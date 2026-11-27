import { db } from './db';
import { generateUuid, validateUploadFile } from '../utils/caseLogic';
import { Bytes, doc, getDoc, getDocs, collection, writeBatch } from 'firebase/firestore';
import { firestore } from '../firebase/client';

export interface StoredFileMeta {
  blobKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface IStorageProvider {
  readonly mode: 'indexeddb' | 'firestore';
  saveFile(file: File): Promise<StoredFileMeta>;
  saveBlob(blobKey: string, fileName: string, mimeType: string, blob: Blob): Promise<void>;
  getFileBlob(blobKey: string): Promise<Blob | null>;
  getFileDownloadUrl(blobKey: string): Promise<string | null>;
  deleteFile(blobKey: string): Promise<void>;
  getStorageUsageEstimate(): Promise<{ usedBytes: number; quotaBytes: number; fileCount: number }>;
}

export class IndexedDbStorageProvider implements IStorageProvider {
  readonly mode = 'indexeddb' as const;

  async saveFile(file: File): Promise<StoredFileMeta> {
    const check = validateUploadFile({ name: file.name, size: file.size, type: file.type });
    if (!check.valid) {
      throw new Error(check.error || 'ფაილის შემოწმება ვერ მოხერხდა.');
    }

    const blobKey = `blob_${generateUuid()}`;
    const mimeType = file.type || 'application/octet-stream';
    await db.file_blobs.put({
      blobKey,
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
      data: file,
      createdAt: new Date().toISOString(),
    });

    return {
      blobKey,
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
    };
  }

  async saveBlob(blobKey: string, fileName: string, mimeType: string, blob: Blob): Promise<void> {
    await db.file_blobs.put({
      blobKey,
      fileName,
      mimeType,
      sizeBytes: blob.size,
      data: blob,
      createdAt: new Date().toISOString(),
    });
  }

  async getFileBlob(blobKey: string): Promise<Blob | null> {
    const rec = await db.file_blobs.get(blobKey);
    return rec ? rec.data : null;
  }

  async getFileDownloadUrl(blobKey: string): Promise<string | null> {
    const rec = await db.file_blobs.get(blobKey);
    if (!rec) return null;
    return URL.createObjectURL(rec.data);
  }

  async deleteFile(blobKey: string): Promise<void> {
    await db.file_blobs.delete(blobKey);
  }

  async getStorageUsageEstimate(): Promise<{ usedBytes: number; quotaBytes: number; fileCount: number }> {
    const allBlobs = await db.file_blobs.toArray();
    const fileBytes = allBlobs.reduce((sum, b) => sum + (b.sizeBytes || 0), 0);
    let quotaBytes = 0;
    let totalUsed = fileBytes;

    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        quotaBytes = est.quota || 0;
        totalUsed = est.usage || fileBytes;
      } catch {
        // Ignore browser storage estimate refusal
      }
    }

    return {
      usedBytes: totalUsed,
      quotaBytes,
      fileCount: allBlobs.length,
    };
  }
}

export class FirestoreFileProvider implements IStorageProvider {
  readonly mode = 'firestore' as const;
  private readonly localCache = new IndexedDbStorageProvider();
  private readonly chunkSize = 600 * 1024;

  private async persist(blobKey: string, fileName: string, mimeType: string, blob: Blob): Promise<void> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunkCount = Math.ceil(bytes.length / this.chunkSize);
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, 'file_blobs', blobKey), {
      blobKey,
      fileName,
      mimeType,
      sizeBytes: blob.size,
      chunkCount,
      createdAt: new Date().toISOString(),
    });
    for (let index = 0; index < chunkCount; index += 1) {
      const part = bytes.slice(index * this.chunkSize, (index + 1) * this.chunkSize);
      batch.set(doc(firestore, 'file_chunks', `${blobKey}_${index}`), {
        blobKey,
        index,
        data: Bytes.fromUint8Array(part),
      });
    }
    await batch.commit();
  }

  async saveFile(file: File): Promise<StoredFileMeta> {
    const check = validateUploadFile({ name: file.name, size: file.size, type: file.type });
    if (!check.valid) throw new Error(check.error || 'ფაილის შემოწმება ვერ მოხერხდა.');
    const blobKey = `blob_${generateUuid()}`;
    const mimeType = file.type || 'application/octet-stream';
    await this.localCache.saveBlob(blobKey, file.name, mimeType, file);
    try {
      await this.persist(blobKey, file.name, mimeType, file);
    } catch (error) {
      console.warn('Firestore file upload unavailable; retained in the local cache.', error);
    }
    return { blobKey, fileName: file.name, mimeType, sizeBytes: file.size };
  }

  async saveBlob(blobKey: string, fileName: string, mimeType: string, blob: Blob): Promise<void> {
    await this.localCache.saveBlob(blobKey, fileName, mimeType, blob);
    try {
      await this.persist(blobKey, fileName, mimeType, blob);
    } catch (error) {
      console.warn('Firestore file upload unavailable; retained in the local cache.', error);
    }
  }

  async getFileBlob(blobKey: string): Promise<Blob | null> {
    try {
      const metaSnapshot = await getDoc(doc(firestore, 'file_blobs', blobKey));
      if (!metaSnapshot.exists()) return this.localCache.getFileBlob(blobKey);
      const meta = metaSnapshot.data() as { mimeType: string; chunkCount: number };
      const chunkSnapshots = await Promise.all(
        Array.from({ length: meta.chunkCount }, (_, index) =>
          getDoc(doc(firestore, 'file_chunks', `${blobKey}_${index}`))
        )
      );
      if (chunkSnapshots.some((item) => !item.exists())) return this.localCache.getFileBlob(blobKey);
      return new Blob(
        chunkSnapshots.map((item) => Uint8Array.from((item.data()!.data as Bytes).toUint8Array()).buffer),
        { type: meta.mimeType }
      );
    } catch {
      return this.localCache.getFileBlob(blobKey);
    }
  }

  async getFileDownloadUrl(blobKey: string): Promise<string | null> {
    try {
      const blob = await this.getFileBlob(blobKey);
      return blob ? URL.createObjectURL(blob) : null;
    } catch { return null; }
  }

  async deleteFile(blobKey: string): Promise<void> {
    try {
      const metaSnapshot = await getDoc(doc(firestore, 'file_blobs', blobKey));
      const chunkCount = metaSnapshot.exists() ? Number(metaSnapshot.data().chunkCount || 0) : 0;
      const batch = writeBatch(firestore);
      batch.delete(doc(firestore, 'file_blobs', blobKey));
      for (let index = 0; index < chunkCount; index += 1) {
        batch.delete(doc(firestore, 'file_chunks', `${blobKey}_${index}`));
      }
      await batch.commit();
    } catch (error) {
      console.warn('Firestore file deletion unavailable; local cache was still cleared.', error);
    }
    await this.localCache.deleteFile(blobKey);
  }

  async getStorageUsageEstimate(): Promise<{ usedBytes: number; quotaBytes: number; fileCount: number }> {
    try {
      const snapshot = await getDocs(collection(firestore, 'file_blobs'));
      return {
        usedBytes: snapshot.docs.reduce((total, item) => total + Number(item.data().sizeBytes || 0), 0),
        quotaBytes: 0,
        fileCount: snapshot.size,
      };
    } catch {
      return this.localCache.getStorageUsageEstimate();
    }
  }
}

export const storageProvider: IStorageProvider = new FirestoreFileProvider();
