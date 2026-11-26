"use client";

import { useEffect, useState } from "react";
import { DownloadIcon, ImageIcon, LockIcon, VaultMark } from "@/components/Icons";
import { formatBytes, formatDate, isImage } from "@/lib/files";
import type { FileDTO } from "@/lib/types";

export function SharedFile({ file, token }: { file: FileDTO; token: string }) {
  const url = `/api/files/${file.id}/content?token=${encodeURIComponent(token)}`;
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (file.mimeType.startsWith("text/") || file.mimeType === "application/json") {
      let active = true;
      fetch(url)
        .then((response) => (response.ok ? response.text() : Promise.reject(new Error("failed"))))
        .then((value) => {
          if (active) setText(value.slice(0, 12000));
        })
        .catch(() => {
          if (active) setFailed(true);
        });
      return () => {
        active = false;
      };
    }
    return undefined;
  }, [file.mimeType, url]);

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-7 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-accent text-white">
              <VaultMark size={20} />
            </span>
            <span className="font-display text-xl">Vault</span>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted">
            <LockIcon size={13} /> Signed link
          </span>
        </header>

        <div className="surface-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
              <ImageIcon size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-xl">{file.name}</h1>
              <p className="text-xs text-muted">
                Shared by {file.owner.name || "a Vault user"} · {formatBytes(file.size)} · {formatDate(file.updatedAt)}
              </p>
            </div>
            <a className="btn-primary" href={`${url}&download=1`}>
              <DownloadIcon size={16} /> Download
            </a>
          </div>

          <div className="bg-canvas p-4 sm:p-6">
            {isImage(file.mimeType) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={file.name} className="mx-auto max-h-[65vh] max-w-full rounded-lg" />
            )}
            {file.mimeType === "application/pdf" && (
              <iframe title={`Preview of ${file.name}`} src={url} className="h-[65vh] w-full rounded-lg border border-line bg-white" />
            )}
            {(file.mimeType.startsWith("text/") || file.mimeType === "application/json") && (
              text !== null ? (
                <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-5 text-[13px] leading-6">
                  {text}
                </pre>
              ) : failed ? (
                <p className="text-sm text-danger">This file could not be previewed.</p>
              ) : (
                <div className="skeleton h-56 w-full" />
              )
            )}
            {!file.previewable && !isImage(file.mimeType) && (
              <div className="py-16 text-center text-sm text-muted">
                No inline preview is available for this file type. Download it to open locally.
              </div>
            )}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-muted">
          Links are signed and can be revoked by the owner at any time.
        </p>
      </div>
    </main>
  );
}
