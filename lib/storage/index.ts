import { localAdapter } from "./local";
import type { StorageAdapter } from "./types";

const driver = process.env.STORAGE_DRIVER || "local";

let selected: StorageAdapter;
switch (driver) {
  case "local":
    selected = localAdapter;
    break;
  default:
    throw new Error(
      `Unsupported STORAGE_DRIVER "${driver}". Implement a StorageAdapter and add it here.`,
    );
}

export const storage: StorageAdapter = selected;
export { makeStorageKey } from "./local";
export type { StorageAdapter, StoredObject } from "./types";
