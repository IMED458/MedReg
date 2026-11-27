import { db } from './db';
import { generateUuid, validateUploadFile } from '../utils/caseLogic';

export interface StoredFileMeta {
  blobKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface IStorageProvider {
  readonly mode: 'indexeddb' | 'firebase_storage' | 's3_b2_proxy';
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

/**
 * მომავალი ღრუბლოვანი საცავის ინტერფეისი (Firebase Storage ან სერვერული პროქსი Backblaze B2/S3-სთვის).
 * კონფიგურირდება მხოლოდ .env და სერვერული ავტორიზაციის ჩართვის შემდეგ.
 */
export class CloudStorageProviderStub implements IStorageProvider {
  readonly mode: 'firebase_storage' | 's3_b2_proxy';

  constructor(mode: 'firebase_storage' | 's3_b2_proxy' = 'firebase_storage') {
    this.mode = mode;
  }

  async saveFile(): Promise<StoredFileMeta> {
    throw new Error('ღრუბლოვანი საცავი ჯერ არ არის დაკავშირებული. გთხოვთ გამოიყენოთ ლოკალური IndexedDB რეჟიმი.');
  }
  async saveBlob(): Promise<void> {
    throw new Error('ღრუბლოვანი საცავი ჯერ არ არის დაკავშირებული.');
  }
  async getFileBlob(): Promise<Blob | null> {
    throw new Error('ღრუბლოვანი საცავი ჯერ არ არის დაკავშირებული.');
  }
  async getFileDownloadUrl(): Promise<string | null> {
    throw new Error('ღრუბლოვანი საცავი ჯერ არ არის დაკავშირებული.');
  }
  async deleteFile(): Promise<void> {
    throw new Error('ღრუბლოვანი საცავი ჯერ არ არის დაკავშირებული.');
  }
  async getStorageUsageEstimate(): Promise<{ usedBytes: number; quotaBytes: number; fileCount: number }> {
    return { usedBytes: 0, quotaBytes: 0, fileCount: 0 };
  }
}

export const storageProvider: IStorageProvider = new IndexedDbStorageProvider();
