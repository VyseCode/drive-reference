import Link from "next/link";
import { FolderIcon } from "@/components/Icons";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="surface-card w-full max-w-md p-8 text-center">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <FolderIcon size={26} />
        </span>
        <h1 className="font-display text-2xl">Nothing filed here</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          That folder or page does not exist, or it may have been moved.
        </p>
        <Link href="/drive" className="btn-primary mt-6">
          Back to My files
        </Link>
      </div>
    </main>
  );
}
