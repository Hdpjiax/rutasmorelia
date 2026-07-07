export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Future SQLite adapter will implement the same interface for offline sync. */
export interface OfflineCapableStorage extends KeyValueStorage {
  readonly kind: 'async-storage' | 'sqlite';
}