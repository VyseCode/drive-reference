"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronRight,
  CloseIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  ImageIcon,
  LinkIcon,
  ListIcon,
  LockIcon,
  MoreIcon,
  MoveIcon,
  PencilIcon,
  PlusIcon,
  RestoreIcon,
  ShareIcon,
  StarIcon,
  TextIcon,
  TrashIcon,
  UploadIcon,
  UsersIcon,
  VaultMark,
} from "@/components/Icons";
import { formatBytes, formatDate, isImage } from "@/lib/files";
import type { BreadcrumbDTO, FileDTO, FilePageDTO } from "@/lib/types";

type View = "all" | "recent" | "starred" | "trash" | "search";
type Dialog =
  | { type: "newFolder" }
  | { type: "rename"; node: FileDTO }
  | { type: "move"; node: FileDTO }
  | { type: "share"; node: FileDTO }
  | { type: "preview"; node: FileDTO }
  | { type: "delete"; node: FileDTO }
  | null;

type Props = {
  view: View;
  path: string;
  title: string;
  subtitle: string;
  initial: FilePageDTO;
  breadcrumbs: BreadcrumbDTO[];
  folderId: string | null;
  query: string;
  sort: "name" | "updatedAt" | "size";
  dir: "asc" | "desc";
  page: number;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
}

function glyph(node: FileDTO) {
  if (node.kind === "folder") return <FolderIcon size={24} />;
  if (isImage(node.mimeType)) return <ImageIcon size={24} />;
  if (node.mimeType.startsWith("text/") || node.mimeType === "application/json") {
    return <TextIcon size={24} />;
  }
  return <FileIcon size={24} />;
}

function glyphTone(node: FileDTO): string {
  if (node.kind === "folder") return "bg-amber-soft text-amber";
  if (isImage(node.mimeType)) return "bg-accent-soft text-accent";
  if (node.mimeType === "application/pdf") return "bg-danger-soft text-danger";
  return "bg-canvas text-muted";
}

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface shadow-xl sm:rounded-[14px] ${wide ? "max-w-2xl" : "max-w-md"}`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-xl">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink"
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function PreviewBody({ node }: { node: FileDTO }) {
  const url = `/api/files/${node.id}/content`;
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (node.mimeType.startsWith("text/") || node.mimeType === "application/json") {
      let active = true;
      fetch(url)
        .then((response) => (response.ok ? response.text() : Promise.reject(new Error("failed"))))
        .then((value) => {
          if (active) setText(value.slice(0, 8000));
        })
        .catch(() => {
          if (active) setFailed(true);
        });
      return () => {
        active = false;
      };
    }
    return undefined;
  }, [node.id, node.mimeType, url]);

  if (isImage(node.mimeType)) {
    return (
      <div className="rounded-[10px] border border-line bg-canvas p-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={node.name}
          className="mx-auto max-h-[46vh] max-w-full rounded-lg"
        />
        <p className="mt-3 text-xs text-muted">Preview of {node.name}</p>
      </div>
    );
  }
  if (node.mimeType === "application/pdf") {
    return (
      <iframe
        src={url}
        title={`Preview of ${node.name}`}
        className="h-[50vh] w-full rounded-[10px] border border-line bg-white"
      />
    );
  }
  if (text !== null) {
    return (
      <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-[10px] border border-line bg-canvas p-4 text-[13px] leading-6 text-ink">
        {text}
      </pre>
    );
  }
  if (failed) return <p className="text-sm text-danger">This file could not be previewed.</p>;
  return <div className="skeleton h-40 w-full" />;
}

function SharePanel({
  node,
  onClose,
  notify,
}: {
  node: FileDTO;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [visibility, setVisibility] = useState<"private" | "link" | "specific">(
    node.share.visibility,
  );
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [url, setUrl] = useState<string | null>(null);
  const [acl, setAcl] = useState(node.share.acl);
  const [userQuery, setUserQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    api<{ url: string | null; share: { visibility: "private" | "link" | "specific" } }>(
      `/api/files/${node.id}/share`,
    )
      .then((data) => {
        if (!active) return;
        setUrl(data.url);
        setVisibility(data.share.visibility);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [node.id]);

  useEffect(() => {
    const term = userQuery.trim();
    if (term.length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      api<{ users: Array<{ id: string; name: string; email: string }> }>(
        `/api/users/search?q=${encodeURIComponent(term)}`,
      )
        .then((data) => {
          if (active) setResults(data.users.filter((user) => !acl.some((entry) => entry.userId === user.id)));
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [userQuery, acl]);

  async function save(nextVisibility: "private" | "link" | "specific", nextAcl = acl) {
    setSaving(true);
    setMessage("");
    try {
      const body =
        nextVisibility === "specific"
          ? { visibility: nextVisibility, acl: nextAcl.map((entry) => ({ email: entry.email, role: entry.role })) }
          : nextVisibility === "link"
            ? { visibility: nextVisibility, role }
            : { visibility: nextVisibility };
      const data = await api<{ url: string | null }>(`/api/files/${node.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setVisibility(nextVisibility);
      setAcl(nextAcl);
      setUrl(data.url);
      notify(nextVisibility === "private" ? "Sharing turned off" : "Sharing updated");
      if (nextVisibility === "private") onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update sharing");
    } finally {
      setSaving(false);
    }
  }

  const visibleResults = userQuery.trim().length >= 2 ? results : [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["private", "Private", LockIcon],
            ["link", "Anyone with link", LinkIcon],
            ["specific", "Named people", UsersIcon],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => void save(value)}
            disabled={saving}
            className={`flex flex-col items-center gap-2 rounded-[10px] border px-2 py-3 text-center text-xs transition ${visibility === value ? "border-accent bg-accent-soft font-semibold text-accent-strong" : "border-line text-muted hover:border-accent"}`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      {visibility === "link" && (
        <div className="rounded-[10px] border border-line bg-canvas p-4">
          <label htmlFor="link-role" className="mb-2 block text-sm font-medium">
            People with the link can
          </label>
          <select
            id="link-role"
            value={role}
            onChange={(event) => {
              const next = event.target.value as "viewer" | "editor";
              setRole(next);
              void save("link", acl);
            }}
            disabled={saving}
            className="field"
          >
            <option value="viewer">View and download</option>
            <option value="editor">View, download and rename</option>
          </select>
          {url && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-muted">Share link</p>
              <div className="flex gap-2">
                <input readOnly value={url} className="field text-xs" aria-label="Share link" />
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => {
                    void navigator.clipboard?.writeText(url);
                    notify("Link copied");
                  }}
                >
                  Copy
                </button>
              </div>
              <p className="mt-2 text-[11px] text-muted">
                Revoking access rotates the signed token. Old links stop working immediately.
              </p>
            </div>
          )}
        </div>
      )}

      {visibility === "specific" && (
        <div className="space-y-3">
          <div>
            <label htmlFor="share-user" className="mb-1.5 block text-sm font-medium">
              Add a person by name or email
            </label>
            <input
              id="share-user"
              value={userQuery}
              onChange={(event) => setUserQuery(event.target.value)}
              placeholder="blair@example.com"
              className="field"
            />
          </div>
          {visibleResults.length > 0 && (
            <ul className="divide-y divide-line rounded-[10px] border border-line">
              {visibleResults.map((user) => (
                <li key={user.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <strong className="font-medium">{user.name}</strong>
                    <span className="ml-2 text-xs text-muted">{user.email}</span>
                  </span>
                  {(
                    [
                      ["viewer", "Viewer"],
                      ["editor", "Editor"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        const next = [...acl, { userId: user.id, name: user.name, email: user.email, role: value }];
                        setAcl(next);
                        setUserQuery("");
                        void save("specific", next);
                      }}
                      className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
                    >
                      {label}
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          )}
          <ul className="divide-y divide-line rounded-[10px] border border-line">
            {acl.length === 0 && (
              <li className="px-3 py-3 text-sm text-muted">No one else can open this file yet.</li>
            )}
            {acl.map((entry) => (
              <li key={entry.userId} className="flex items-center gap-2 px-3 py-2 text-sm">
                <UsersIcon size={16} className="text-muted" />
                <span className="min-w-0 flex-1 truncate">{entry.name || entry.email}</span>
                <span className="text-xs text-muted">{entry.role}</span>
                <button
                  type="button"
                  aria-label={`Remove ${entry.name || entry.email}`}
                  onClick={() => {
                    const next = acl.filter((item) => item.userId !== entry.userId);
                    setAcl(next);
                    void save("specific", next);
                  }}
                  className="rounded-md p-1 text-muted hover:bg-danger-soft hover:text-danger"
                >
                  <CloseIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {message && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {message}
        </p>
      )}
    </div>
  );
}

function MovePanel({
  node,
  onDone,
  notify,
}: {
  node: FileDTO;
  onDone: () => void;
  notify: (message: string) => void;
}) {
  const [folders, setFolders] = useState<FileDTO[]>([]);
  const [target, setTarget] = useState<string | null>(node.parentId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    api<{ items: FileDTO[] }>("/api/files?view=all&limit=60")
      .then((data) => {
        if (active) setFolders(data.items.filter((item) => item.kind === "folder"));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  function isInSubtree(id: string): boolean {
    let cursor: string | null = id;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      if (cursor === node.id) return true;
      seen.add(cursor);
      cursor = folders.find((folder) => folder.id === cursor)?.parentId ?? null;
    }
    return false;
  }

  async function move() {
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/files/${node.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", parent: target }),
      });
      notify("Item moved");
      onDone();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not move this item");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Choose a destination for {node.name}.</p>
      <ul className="max-h-64 space-y-1 overflow-y-auto rounded-[10px] border border-line p-2">
        <li>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-canvas">
            <input
              type="radio"
              name="destination"
              checked={target === null}
              onChange={() => setTarget(null)}
            />
            <FolderIcon size={17} className="text-amber" />
            My files (root)
          </label>
        </li>
        {folders.map((folder) => {
          const blocked = folder.id === node.id || isInSubtree(folder.id);
          return (
            <li key={folder.id}>
              <label
                className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${blocked ? "cursor-not-allowed text-muted opacity-50" : "cursor-pointer hover:bg-canvas"}`}
              >
                <input
                  type="radio"
                  name="destination"
                  disabled={blocked}
                  checked={target === folder.id}
                  onChange={() => setTarget(folder.id)}
                />
                <FolderIcon size={17} className="text-amber" />
                <span className="truncate">{folder.name}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {message && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void move()}>
          {busy ? "Moving…" : "Move here"}
        </button>
      </div>
    </div>
  );
}

export function FileManager(props: Props) {
  const {
    view, path, title, subtitle, initial, breadcrumbs, folderId, query, sort, dir, page,
  } = props;
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialog(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  function openDialog(next: Dialog) {
    if (next?.type === "rename") setName(next.node.name);
    if (next?.type === "newFolder") setName("");
    setDialog(next);
  }

  function go(overrides: { page?: number; sort?: string; dir?: string; folder?: string | null }) {
    const params = new URLSearchParams();
    const targetFolder = "folder" in overrides ? overrides.folder : folderId;
    if (targetFolder && view === "all") params.set("folder", targetFolder);
    const nextSort = overrides.sort ?? sort;
    if (nextSort !== "updatedAt") params.set("sort", nextSort);
    const nextDir = overrides.dir ?? dir;
    if (nextDir !== "desc") params.set("dir", nextDir);
    const nextPage = overrides.page ?? page;
    if (nextPage > 1) params.set("page", String(nextPage));
    if (query) params.set("q", query);
    const qs = params.toString();
    router.push(`${path}${qs ? `?${qs}` : ""}`);
  }

  function chooseLayout(next: "grid" | "list") {
    setLayout(next);
  }

  async function mutate(url: string, init: RequestInit, success: string) {
    setBusy(true);
    setError("");
    try {
      await api(url, init);
      setToast(success);
      setDialog(null);
      setMenuId(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function createFolder(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await mutate(
      "/api/files/folder",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, parent: folderId }),
      },
      `Folder “${trimmed}” created`,
    );
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    if (folderId) form.set("parent", folderId);
    await mutate("/api/files/upload", { method: "POST", body: form }, `Uploaded “${file.name}”`);
  }

  async function star(node: FileDTO) {
    await mutate(
      `/api/files/${node.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "star", starred: !node.starred }),
      },
      node.starred ? "Removed from Starred" : "Added to Starred",
    );
  }

  async function trashRestore(node: FileDTO) {
    await mutate(
      `/api/files/${node.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: node.trashed ? "restore" : "trash" }),
      },
      node.trashed ? "Restored to My files" : "Moved to Trash",
    );
  }

  function openNode(node: FileDTO) {
    if (node.kind === "folder") {
      go({ folder: node.id, page: 1 });
    } else if (node.previewable) {
      openDialog({ type: "preview", node });
    } else {
      window.open(`/api/files/${node.id}/content?download=1`, "_blank", "noopener,noreferrer");
    }
  }

  const limit = initial.limit;
  const rangeStart = initial.total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, initial.total);
  const isEmpty = initial.items.length === 0;
  const emptyCopy: Record<View, { heading: string; body: string }> = {
    all: {
      heading: folderId ? "This folder is empty" : "A fresh start",
      body: folderId
        ? "Upload a file or create a subfolder to fill this space."
        : "Your drive is ready. Add a folder to start organising, or upload a file.",
    },
    recent: { heading: "Nothing recent yet", body: "Files you add or change will show up here." },
    starred: {
      heading: "No starred files",
      body: "Star a file from its menu and it will be easy to find here.",
    },
    trash: { heading: "Trash is empty", body: "Deleted items stay here until you remove them forever." },
    search: {
      heading: `No matches for “${query}”`,
      body: "Try a shorter name or check the spelling.",
    },
  };

  return (
    <div className="mx-auto max-w-6xl">
      {menuId && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setMenuId(null)}
        />
      )}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {breadcrumbs.length > 1 && (
            <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted">
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.id ?? "root"} className="flex items-center gap-1">
                  {index > 0 && <ChevronRight size={13} />}
                  <Link
                    href={crumb.id ? `/drive?folder=${crumb.id}` : "/drive"}
                    className={index === breadcrumbs.length - 1 ? "font-semibold text-ink" : "hover:text-accent"}
                  >
                    {crumb.name}
                  </Link>
                </span>
              ))}
            </nav>
          )}
          <h1 className="font-display text-3xl text-ink sm:text-4xl">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary" onClick={() => openDialog({ type: "newFolder" })}>
            <PlusIcon size={17} /> New folder
          </button>
          <button type="button" className="btn-primary" onClick={() => fileInput.current?.click()}>
            <UploadIcon size={17} /> Upload
          </button>
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            aria-label="Choose a file to upload"
            accept=".png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv,.log,.json,.pdf"
            onChange={(event) => {
              void upload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-line pb-4">
        <p className="mr-auto text-xs text-muted">
          {initial.total} {initial.total === 1 ? "item" : "items"}
          {busy && <span className="ml-2 text-accent">Updating…</span>}
        </p>
        <label htmlFor="sort" className="text-xs text-muted">
          Sort
        </label>
        <select
          id="sort"
          value={`${sort}:${dir}`}
          onChange={(event) => {
            const [nextSort, nextDir] = event.target.value.split(":");
            go({ sort: nextSort, dir: nextDir, page: 1 });
          }}
          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
        >
          <option value="updatedAt:desc">Recently changed</option>
          <option value="name:asc">Name A–Z</option>
          <option value="name:desc">Name Z–A</option>
          <option value="size:desc">Largest first</option>
          <option value="size:asc">Smallest first</option>
        </select>
        <div className="flex overflow-hidden rounded-lg border border-line">
          <button
            type="button"
            aria-label="Grid view"
            aria-pressed={layout === "grid"}
            onClick={() => chooseLayout("grid")}
            className={`p-1.5 ${layout === "grid" ? "bg-accent-soft text-accent" : "text-muted"}`}
          >
            <GridIcon size={16} />
          </button>
          <button
            type="button"
            aria-label="List view"
            aria-pressed={layout === "list"}
            onClick={() => chooseLayout("list")}
            className={`p-1.5 ${layout === "list" ? "bg-accent-soft text-accent" : "text-muted"}`}
          >
            <ListIcon size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-5 rounded-[10px] border border-[#e6c4be] bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {isEmpty ? (
        <div className="surface-card flex flex-col items-center px-6 py-16 text-center">
          <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
            <VaultMark size={30} />
          </span>
          <h2 className="font-display text-xl">{emptyCopy[view].heading}</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted">{emptyCopy[view].body}</p>
          {view === "all" && (
            <div className="mt-6 flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => openDialog({ type: "newFolder" })}>
                New folder
              </button>
              <button type="button" className="btn-primary" onClick={() => fileInput.current?.click()}>
                Upload a file
              </button>
            </div>
          )}
          {view === "search" && (
            <Link href="/drive" className="btn-secondary mt-6">
              Back to My files
            </Link>
          )}
        </div>
      ) : layout === "grid" ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {initial.items.map((node) => (
            <li key={node.id} className="surface-card group relative p-4 transition hover:border-accent/60 hover:shadow-sm">
              <button
                type="button"
                onClick={() => openNode(node)}
                className="flex w-full items-start gap-3 text-left"
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] ${glyphTone(node)}`}>
                  {glyph(node)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{node.name}</span>
                  <span className="mt-1 block text-xs text-muted">
                    {node.kind === "folder"
                      ? "Folder"
                      : `${formatBytes(node.size)} · ${formatDate(node.updatedAt)}`}
                  </span>
                </span>
              </button>
              <div className="mt-3 flex items-center gap-1 border-t border-line pt-2">
                {node.share.visibility !== "private" && (
                  <span className="flex items-center gap-1 text-[11px] text-accent">
                    {node.share.visibility === "link" ? <LinkIcon size={13} /> : <UsersIcon size={13} />}
                    {node.share.visibility === "link" ? "Link" : "Shared"}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={node.starred ? `Unstar ${node.name}` : `Star ${node.name}`}
                    onClick={() => void star(node)}
                    className={`rounded-md p-1.5 ${node.starred ? "text-amber" : "text-muted hover:bg-canvas"}`}
                  >
                    <StarIcon size={16} filled={node.starred} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Actions for ${node.name}`}
                    onClick={() => setMenuId(menuId === node.id ? null : node.id)}
                    className="rounded-md p-1.5 text-muted hover:bg-canvas"
                  >
                    <MoreIcon size={17} />
                  </button>
                </span>
              </div>
              {menuId === node.id && (
                <div className="absolute right-3 top-14 z-20 w-44 rounded-[10px] border border-line bg-surface py-1 shadow-lg">
                  <ItemMenu node={node} onAction={openDialog} onToggle={trashRestore} onStar={star} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                <th scope="col" className="px-4 py-3 font-semibold">Shared</th>
                <th scope="col" className="px-4 py-3 font-semibold">Modified</th>
                <th scope="col" className="px-4 py-3 font-semibold">Size</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {initial.items.map((node) => (
                <tr key={node.id} className="hover:bg-canvas/70">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => openNode(node)} className="flex items-center gap-3 text-left">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${glyphTone(node)}`}>
                        {glyph(node)}
                      </span>
                      <span className="font-medium text-ink">{node.name}</span>
                      {node.starred && <StarIcon size={14} filled className="text-amber" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {node.share.visibility === "private"
                      ? "Private"
                      : node.share.visibility === "link"
                        ? "Anyone with link"
                        : `${node.share.acl.length} people`}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{formatDate(node.updatedAt)}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {node.kind === "folder" ? "—" : formatBytes(node.size)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        aria-label={`Actions for ${node.name}`}
                        onClick={() => setMenuId(menuId === node.id ? null : node.id)}
                        className="relative rounded-md p-1.5 text-muted hover:bg-line"
                      >
                        <MoreIcon size={17} />
                      </button>
                      {menuId === node.id && (
                        <div className="absolute right-6 z-20 mt-8 w-44 rounded-[10px] border border-line bg-surface py-1 shadow-lg">
                          <ItemMenu node={node} onAction={openDialog} onToggle={trashRestore} onStar={star} />
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {initial.total > limit && (
        <div className="mt-5 flex items-center justify-between text-xs text-muted">
          <span>
            Showing {rangeStart}–{rangeEnd} of {initial.total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary px-3 py-1.5"
              disabled={page <= 1}
              onClick={() => go({ page: page - 1 })}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary px-3 py-1.5"
              disabled={!initial.hasMore}
              onClick={() => go({ page: page + 1 })}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-[10px] bg-ink px-4 py-3 text-sm text-white shadow-lg">
          <CheckIcon size={16} /> {toast}
        </div>
      )}

      {dialog?.type === "newFolder" && (
        <Modal title="New folder" onClose={() => setDialog(null)}>
          <form onSubmit={createFolder} className="space-y-4">
            <div>
              <label htmlFor="folder-name" className="mb-1.5 block text-sm font-medium">
                Folder name
              </label>
              <input
                id="folder-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Research"
                maxLength={200}
                className="field"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
                Create folder
              </button>
            </div>
          </form>
        </Modal>
      )}

      {dialog?.type === "rename" && (
        <Modal title="Rename" onClose={() => setDialog(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              void mutate(`/api/files/${dialog.node.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "rename", name: name.trim() }),
              }, "Name updated");
            }}
            className="space-y-4"
          >
            <div>
              <label htmlFor="rename-input" className="mb-1.5 block text-sm font-medium">
                New name
              </label>
              <input id="rename-input" autoFocus value={name} onChange={(event) => setName(event.target.value)} className="field" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setDialog(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>Save name</button>
            </div>
          </form>
        </Modal>
      )}

      {dialog?.type === "move" && (
        <Modal title={`Move “${dialog.node.name}”`} onClose={() => setDialog(null)}>
          <MovePanel node={dialog.node} onDone={() => setDialog(null)} notify={setToast} />
        </Modal>
      )}

      {dialog?.type === "share" && (
        <Modal title={`Share “${dialog.node.name}”`} onClose={() => setDialog(null)} wide>
          <SharePanel node={dialog.node} onClose={() => setDialog(null)} notify={setToast} />
        </Modal>
      )}

      {dialog?.type === "preview" && (
        <Modal title={dialog.node.name} onClose={() => setDialog(null)} wide>
          <div className="space-y-4">
            <PreviewBody node={dialog.node} />
            <div className="flex items-center justify-between text-xs text-muted">
              <span>{formatBytes(dialog.node.size)} · Updated {formatDate(dialog.node.updatedAt)}</span>
              <a className="btn-secondary" href={`/api/files/${dialog.node.id}/content?download=1`}>
                <DownloadIcon size={16} /> Download
              </a>
            </div>
          </div>
        </Modal>
      )}

      {dialog?.type === "delete" && (
        <Modal title="Delete forever?" onClose={() => setDialog(null)}>
          <p className="text-sm leading-6 text-muted">
            {dialog.node.name} and everything inside it will be permanently removed. This cannot be
            undone, and its storage space will be freed.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setDialog(null)}>Cancel</button>
            <button
              type="button"
              className="btn-primary bg-danger hover:bg-[#8f372e]"
              disabled={busy}
              onClick={() => void mutate(`/api/files/${dialog.node.id}`, { method: "DELETE" }, "Deleted forever")}
            >
              Delete forever
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ItemMenu({
  node,
  onAction,
  onToggle,
  onStar,
}: {
  node: FileDTO;
  onAction: (dialog: Dialog) => void;
  onToggle: (node: FileDTO) => void;
  onStar: (node: FileDTO) => void;
}) {
  const entries: Array<{ label: string; icon: React.ReactNode; run: () => void; danger?: boolean }> = [];
  if (node.kind === "file" && node.previewable) {
    entries.push({ label: "Preview", icon: <ImageIcon size={15} />, run: () => onAction({ type: "preview", node }) });
  }
  entries.push(
    { label: "Rename", icon: <PencilIcon size={15} />, run: () => onAction({ type: "rename", node }) },
    { label: "Move", icon: <MoveIcon size={15} />, run: () => onAction({ type: "move", node }) },
  );
  if (node.kind === "file") {
    entries.push({ label: "Share", icon: <ShareIcon size={15} />, run: () => onAction({ type: "share", node }) });
  }
  entries.push({
    label: node.starred ? "Remove star" : "Add star",
    icon: <StarIcon size={15} filled={node.starred} />,
    run: () => void onStar(node),
  });
  if (node.trashed) {
    entries.push(
      { label: "Restore", icon: <RestoreIcon size={15} />, run: () => void onToggle(node) },
      { label: "Delete forever", icon: <TrashIcon size={15} />, danger: true, run: () => onAction({ type: "delete", node }) },
    );
  } else {
    entries.push({
      label: "Move to trash",
      icon: <TrashIcon size={15} />,
      danger: true,
      run: () => void onToggle(node),
    });
  }

  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.label}>
          <button
            type="button"
            onClick={entry.run}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-canvas ${entry.danger ? "text-danger" : "text-ink"}`}
          >
            {entry.icon}
            {entry.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
