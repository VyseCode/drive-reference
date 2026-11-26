import Link from "next/link";
import { SharedFile } from "@/components/SharedFile";
import { LockIcon } from "@/components/Icons";
import { connectDB } from "@/lib/db";
import { getNode, nodeAccess, toFileDTO } from "@/lib/queries";
import { verifyShareToken } from "@/lib/share-token";

export const metadata = { title: "Shared file · Vault" };

function Unavailable({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="surface-card w-full max-w-md p-8 text-center">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft text-danger">
          <LockIcon size={26} />
        </span>
        <h1 className="font-display text-2xl">Link unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{message}</p>
        <Link href="/login" className="btn-secondary mt-6">
          Go to Vault
        </Link>
      </div>
    </main>
  );
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const identity = await verifyShareToken(token);
  if (!identity) return <Unavailable message="This link is invalid or has expired." />;

  await connectDB();
  const node = await getNode(identity.nodeId);
  if (!node || node.kind !== "file") {
    return <Unavailable message="This link no longer points to a file." />;
  }
  const access = nodeAccess(node, null, identity);
  if (!access.view) return <Unavailable message="The owner has revoked this link." />;

  return <SharedFile file={toFileDTO(node, null, identity)} token={token} />;
}
