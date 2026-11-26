"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LockIcon, UploadIcon, UsersIcon, VaultMark } from "@/components/Icons";

type AuthFormProps = { mode: "login" | "register" };

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const payload =
      mode === "register"
        ? {
            name: String(form.get("name") ?? ""),
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
          }
        : {
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
          };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push("/drive");
      router.refresh();
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const isRegister = mode === "register";

  return (
    <main className="flex min-h-screen">
      <section className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-[#123c34] px-12 py-12 text-[#e7f2ee] lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full border border-[#2c6b5d]/60"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-20 h-96 w-96 rounded-full border border-[#2c6b5d]/40"
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#e7f2ee] text-[#123c34]">
            <VaultMark size={22} />
          </span>
          <span className="font-display text-2xl">Vault</span>
        </div>

        <div className="relative max-w-md">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-[#8fc4b4]">
            A calmer kind of cloud
          </p>
          <h1 className="font-display text-[2.85rem] leading-[1.1]">
            Your files, in their place.
          </h1>
          <p className="mt-5 text-[15px] leading-7 text-[#bcd6cd]">
            Folders that make sense, links you control, and previews that open
            right where you are. Nothing louder than it needs to be.
          </p>
          <ul className="mt-10 space-y-5 text-sm">
            <li className="flex items-start gap-3">
              <UploadIcon size={18} className="mt-0.5 shrink-0 text-[#8fc4b4]" />
              <span className="text-[#dceae5]">Upload once, organise with moves and folders.</span>
            </li>
            <li className="flex items-start gap-3">
              <UsersIcon size={18} className="mt-0.5 shrink-0 text-[#8fc4b4]" />
              <span className="text-[#dceae5]">Share privately, by link, or with named people.</span>
            </li>
            <li className="flex items-start gap-3">
              <LockIcon size={18} className="mt-0.5 shrink-0 text-[#8fc4b4]" />
              <span className="text-[#dceae5]">Signed links you can revoke in one click.</span>
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-[#8fb3a8]">
          Reference implementation · local storage adapter · no external services
        </p>
      </section>

      <section className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[390px]">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-accent text-white">
              <VaultMark size={20} />
            </span>
            <span className="font-display text-xl">Vault</span>
          </div>

          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            {isRegister ? "Create your space" : "Welcome back"}
          </p>
          <h2 className="font-display text-3xl text-ink">
            {isRegister ? "Start with a clean slate" : "Sign in to Vault"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {isRegister
              ? "A private workspace with room for 50 MB of files."
              : "Pick up where you left off."}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {isRegister && (
              <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
                  Full name
                </label>
                <input
                  id="name"
                  name="name"
                  required
                  minLength={2}
                  autoComplete="name"
                  placeholder="Alex Morgan"
                  className="field"
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="field"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={isRegister ? 8 : 1}
                autoComplete={isRegister ? "new-password" : "current-password"}
                placeholder={isRegister ? "At least 8 characters" : "Your password"}
                className="field"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-[#e6c4be] bg-danger-soft px-3 py-2.5 text-sm text-danger"
              >
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? "One moment…" : isRegister ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {isRegister ? "Already have an account? " : "New to Vault? "}
            <Link
              href={isRegister ? "/login" : "/register"}
              className="font-semibold text-accent hover:underline"
            >
              {isRegister ? "Sign in" : "Create one"}
            </Link>
          </p>

          <div className="mt-8 rounded-[10px] border border-line bg-surface px-4 py-3 text-xs leading-5 text-muted">
            <span className="font-semibold text-ink">Demo account</span>
            <br />
            alex@example.com / password123
          </div>
        </div>
      </section>
    </main>
  );
}
