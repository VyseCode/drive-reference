export type StoredObject = {
  key: string;
  size: number;
  mimeType: string;
};

export interface StorageAdapter {
  readonly driver: string;
  put(key: string, data: Buffer, mimeType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}
