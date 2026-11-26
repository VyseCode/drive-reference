"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ClockIcon,
  FolderIcon,
  LogoutIcon,
  MenuIcon,
  SearchIcon,
  StarIcon,
  TrashIcon,
  VaultMark,
} from "@/components/Icons";
import { formatBytes } from "@/lib/files";
import type { UsageDTO } from "@/lib/types";

const NAV = [
  { href: "/drive", label: "My files", icon: FolderIcon },
  { href: "/drive/recent", label: "Recent", icon: ClockIcon },
  { href: "/drive/starred", label: "Starred", icon: StarIcon },
  { href: "/drive/trash", label: "Trash", icon: TrashIcon },
];

export function DriveShell({
  user,
  children,
}: {
  user: { name: string; email: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [usage, setUsage] = useState<UsageDTO | null>(null);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { user?: { usage?: UsageDTO } } | null) => {
        if (active && data?.user?.usage) setUsage(data.user.usage);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pathname]);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const percent = usage?.percent ?? 0;

  return (
    <div className="flex min-h-screen bg-canvas">
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-20 bg-ink/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col border-r border-line bg-surface px-4 py-6 transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <Link href="/drive" className="mb-9 flex items-center gap-3 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-accent text-white">
            <VaultMark size={20} />
          </span>
          <span className="font-display text-xl text-ink">Vault</span>
        </Link>

        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
          Workspace
        </p>
        <nav aria-label="File views" className="space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-accent-soft font-semibold text-accent-strong"
                    : "text-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                <Icon size={19} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <div className="rounded-[10px] border border-line bg-canvas px-3 py-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-ink">Storage</span>
              <span className="text-muted">{percent}% used</span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-label="Storage used"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full rounded-full ${percent > 90 ? "bg-danger" : percent > 70 ? "bg-amber" : "bg-accent"}`}
                style={{ width: `${Math.max(2, percent)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-muted">
              {usage
                ? `${formatBytes(usage.usedBytes)} of ${formatBytes(usage.quotaBytes)}`
                : "Loading storage…"}
            </p>
          </div>

          <div className="mt-4 flex items-center gap-3 border-t border-line px-1 pt-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d9e8e2] text-xs font-bold text-accent-strong">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{user.name}</p>
              <p className="truncate text-[11px] text-muted">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-lg p-2 text-muted transition hover:bg-danger-soft hover:text-danger"
            >
              <LogoutIcon size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur sm:px-7">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-muted hover:bg-canvas lg:hidden"
          >
            <MenuIcon size={20} />
          </button>
          <form action="/drive/search" method="get" className="relative max-w-xl flex-1">
            <label htmlFor="drive-search" className="sr-only">
              Search files by name
            </label>
            <SearchIcon
              size={17}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              id="drive-search"
              name="q"
              type="search"
              placeholder="Search files by name…"
              className="field py-2 pl-9"
            />
          </form>
          <div className="ml-auto hidden items-center gap-2 text-xs text-muted sm:flex">
            <span className="h-2 w-2 rounded-full bg-accent" />
            Local storage
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-7 sm:px-7">{children}</main>
      </div>
    </div>
  );
}
