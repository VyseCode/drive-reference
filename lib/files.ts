export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_NAME_LENGTH = 200;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain",
  md: "text/plain",
  csv: "text/csv",
  log: "text/plain",
  json: "application/json",
  pdf: "application/pdf",
};

export const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export type DetectedFile = { mimeType: string; extension: string };

export function detectFileType(name: string, provided: string): DetectedFile | null {
  const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const fromExtension = MIME_BY_EXTENSION[extension];
  if (fromExtension) return { mimeType: fromExtension, extension };
  const safeProvided = provided.split(";")[0].trim().toLowerCase();
  if (Object.values(MIME_BY_EXTENSION).includes(safeProvided)) {
    return { mimeType: safeProvided, extension: safeProvided === "image/jpeg" ? "jpg" : safeProvided.split("/")[1] };
  }
  return null;
}

export function isPreviewable(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    IMAGE_MIMES.has(mimeType) ||
    mimeType === "application/pdf" ||
    mimeType === "application/json"
  );
}

export function isImage(mimeType: string): boolean {
  return IMAGE_MIMES.has(mimeType);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
