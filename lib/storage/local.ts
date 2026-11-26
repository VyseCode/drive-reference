import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageAdapter, StoredObject } from "./types";

const root = path.resolve(process.cwd(), process.env.STORAGE_DIR || ".data/blobs");
const KEY_PATTERN = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.[a-z0-9]+$/;

function resolveKey(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export function makeStorageKey(userId: string, extension: string): string {
  if (!/^[a-z0-9]{1,5}$/.test(extension)) throw new Error("Invalid file extension");
  return `${userId}/${randomUUID()}.${extension}`;
}

export const localAdapter: StorageAdapter = {
  driver: "local",

  async put(key, data, mimeType): Promise<StoredObject> {
    const full = resolveKey(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data, { flag: "wx" });
    return { key, size: data.length, mimeType };
  },

  async get(key): Promise<Buffer | null> {
    try {
      return await readFile(resolveKey(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  },

  async delete(key): Promise<void> {
    try {
      await unlink(resolveKey(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  },
};
