import type { Table } from 'dexie';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestore } from './client';
import { db } from '../storage/db';
import { DEFAULT_SYSTEM_SETTINGS } from '../settings/defaultSettings';

export const CLOUD_TABLES = [
  'users',
  'settings',
  'counters',
  'cases',
  'case_participants',
  'persons',
  'applicants',
  'patients',
  'organizations',
  'case_organizations',
  'doctors',
  'case_doctors',
  'visits',
  'inspection_acts',
  'orders',
  'commissions',
  'case_commissions',
  'document_requests',
  'evidence_transfers',
  'correspondence',
  'reviewers',
  'review_assignments',
  'tasks',
  'reminders',
  'attachments',
  'comments',
  'activity_logs',
  'custom_field_values',
  'case_links',
] as const;

type CloudTableName = (typeof CLOUD_TABLES)[number];
type PendingChange =
  | { table: CloudTableName; key: string; type: 'put'; value: DocumentData }
  | { table: CloudTableName; key: string; type: 'delete' };

let captureSuspended = 0;
let hooksRegistered = false;
const pendingChanges = new Map<string, PendingChange>();
let liveUnsubscribers: Unsubscribe[] = [];

function keyFor(table: CloudTableName, key: string | number): string {
  return `${table}/${String(key)}`;
}

function tableKey(table: CloudTableName, value: DocumentData): string | number {
  return table === 'counters' ? Number(value.year) : String(value.id ?? value.blobKey);
}

function cleanForFirestore(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cleanForFirestore);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, cleanForFirestore(child)])
    );
  }
  return value;
}

export async function withoutCloudCapture<T>(work: () => Promise<T>): Promise<T> {
  captureSuspended += 1;
  try {
    return await work();
  } finally {
    captureSuspended -= 1;
  }
}

export function registerCloudMutationCapture(): void {
  if (hooksRegistered) return;
  hooksRegistered = true;

  for (const tableName of CLOUD_TABLES) {
    const table = db.table(tableName) as Table<Record<string, unknown>, string | number>;
    table.hook('creating', (primaryKey, object) => {
      if (captureSuspended) return;
      const key = String(primaryKey ?? tableKey(tableName, object));
      pendingChanges.set(keyFor(tableName, key), {
        table: tableName,
        key,
        type: 'put',
        value: cleanForFirestore(object) as DocumentData,
      });
    });
    table.hook('updating', (modifications, primaryKey, object) => {
      if (captureSuspended) return;
      const next = { ...object, ...modifications };
      const key = String(primaryKey);
      pendingChanges.set(keyFor(tableName, key), {
        table: tableName,
        key,
        type: 'put',
        value: cleanForFirestore(next) as DocumentData,
      });
    });
    table.hook('deleting', (primaryKey) => {
      if (captureSuspended) return;
      const key = String(primaryKey);
      pendingChanges.set(keyFor(tableName, key), { table: tableName, key, type: 'delete' });
    });
  }
}

export async function flushCloudWrites(): Promise<void> {
  if (pendingChanges.size === 0) return;
  const changes = [...pendingChanges.values()];
  pendingChanges.clear();

  try {
    for (let offset = 0; offset < changes.length; offset += 400) {
      const batch = writeBatch(firestore);
      for (const change of changes.slice(offset, offset + 400)) {
        const ref = doc(firestore, change.table, change.key);
        if (change.type === 'delete') batch.delete(ref);
        else batch.set(ref, change.value);
      }
      await batch.commit();
    }
  } catch (error) {
    for (const change of changes) {
      pendingChanges.set(keyFor(change.table, change.key), change);
    }
    throw error;
  }
}

async function replaceLocalFromCloud(): Promise<void> {
  await withoutCloudCapture(async () => {
    for (const tableName of CLOUD_TABLES) {
      const snapshot = await getDocs(collection(firestore, tableName));
      const table = db.table(tableName) as Table<DocumentData, string | number>;
      await table.clear();
      const rows = snapshot.docs.map((item) => item.data());
      if (rows.length > 0) await table.bulkPut(rows);
    }
  });
}

async function uploadLocalWorkspace(): Promise<void> {
  for (const tableName of CLOUD_TABLES) {
    const rows = await db.table(tableName).toArray();
    for (let offset = 0; offset < rows.length; offset += 400) {
      const batch = writeBatch(firestore);
      for (const row of rows.slice(offset, offset + 400) as DocumentData[]) {
        const key = String(tableKey(tableName, row));
        batch.set(doc(firestore, tableName, key), cleanForFirestore(row) as DocumentData);
      }
      await batch.commit();
    }
  }
}

/** Reconciles the browser cache before live listeners are attached. */
export async function prepareCloudWorkspace(): Promise<void> {
  registerCloudMutationCapture();
  const remoteSettings = await getDoc(doc(firestore, 'settings', 'singleton'));
  if (remoteSettings.exists()) {
    await replaceLocalFromCloud();
    return;
  }

  await withoutCloudCapture(async () => {
    if (!(await db.settings.get('singleton'))) {
      await db.settings.put(DEFAULT_SYSTEM_SETTINGS);
    }
  });
  await uploadLocalWorkspace();
}

export function stopLiveSync(): void {
  for (const unsubscribe of liveUnsubscribers) unsubscribe();
  liveUnsubscribers = [];
}

export function startLiveSync(onDataChanged: () => void, onError: (error: Error) => void): () => void {
  stopLiveSync();
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(onDataChanged, 120);
  };

  for (const tableName of CLOUD_TABLES) {
    const unsubscribe = onSnapshot(
      collection(firestore, tableName),
      async (snapshot) => {
        try {
          await withoutCloudCapture(async () => {
            const table = db.table(tableName) as Table<DocumentData, string | number>;
            for (const change of snapshot.docChanges()) {
              const key = tableName === 'counters' ? Number(change.doc.id) : change.doc.id;
              if (change.type === 'removed') await table.delete(key);
              else await table.put(change.doc.data());
            }
          });
          if (snapshot.docChanges().length > 0) scheduleRefresh();
        } catch (error) {
          onError(error instanceof Error ? error : new Error('Firebase live sync failed.'));
        }
      },
      (error) => onError(error)
    );
    liveUnsubscribers.push(unsubscribe);
  }

  return () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    stopLiveSync();
  };
}

export async function saveCloudDocument(table: CloudTableName, key: string, value: DocumentData): Promise<void> {
  await setDoc(doc(firestore, table, key), cleanForFirestore(value) as DocumentData);
}

export async function removeCloudDocument(table: CloudTableName, key: string): Promise<void> {
  await deleteDoc(doc(firestore, table, key));
}

registerCloudMutationCapture();
