import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import type { IAclEntry } from "@/models/FileNode";
import { signShareToken } from "@/lib/share-token";
import { getNodeDocument, nodeAccess, toFileDTO, type LeanNode } from "@/lib/queries";

type Ctx = RouteContext<"/api/files/[id]/share">;

const schema = z.discriminatedUnion("visibility", [
  z.object({ visibility: z.literal("private") }),
  z.object({
    visibility: z.literal("link"),
    role: z.enum(["viewer", "editor"]).default("viewer"),
  }),
  z.object({
    visibility: z.literal("specific"),
    acl: z
      .array(
        z.object({
          email: z.string().trim().toLowerCase().email("Enter a valid email"),
          role: z.enum(["viewer", "editor"]),
        }),
      )
      .max(20, "You can share with up to 20 people"),
  }),
]);

async function linkResult(node: LeanNode, viewerId: string) {
  const dto = toFileDTO(node, viewerId);
  if (dto.share.visibility !== "link") {
    return { share: dto.share, token: null as string | null, url: null as string | null };
  }
  const token = await signShareToken({
    nodeId: dto.id,
    nonce: node.share.nonce,
    role: node.share.linkRole ?? "viewer",
  });
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3224";
  return { share: dto.share, token, url: `${base}/s/${token}` };
}

export async function GET(_request: Request, context: Ctx) {
  try {
    const session = await getSession();
    if (!session) return fail("You must be signed in", 401);
    const { id } = await context.params;
    await connectDB();

    const document = await getNodeDocument(id);
    if (!document) return fail("File not found", 404);
    const node = document.toObject() as unknown as LeanNode;
    if (!nodeAccess(node, session.userId).manage) {
      return fail("Only the owner can manage sharing", 403);
    }

    return ok(await linkResult(node, session.userId));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request, context: Ctx) {
  try {
    const session = await getSession();
    if (!session) return fail("You must be signed in", 401);
    const { id } = await context.params;
    const body = schema.parse(await readJson(request));
    await connectDB();

    const document = await getNodeDocument(id);
    if (!document) return fail("File not found", 404);
    const node = document.toObject() as unknown as LeanNode;
    if (!nodeAccess(node, session.userId).manage) {
      return fail("Only the owner can manage sharing", 403);
    }

    document.share.nonce = randomUUID();
    if (body.visibility === "private") {
      document.share.visibility = "private";
      document.share.linkRole = "viewer";
      document.share.acl = [];
    } else if (body.visibility === "link") {
      document.share.visibility = "link";
      document.share.linkRole = body.role;
      document.share.acl = [];
    } else {
      const emails = [...new Set(body.acl.map((entry) => entry.email))];
      const users = emails.length
        ? await User.find({ email: { $in: emails } }).select("name email")
        : [];
      const byEmail = new Map(users.map((user) => [user.email, user]));
      const missing = emails.find((email) => !byEmail.has(email));
      if (missing) return fail(`No Vault account exists for ${missing}`, 400);

      document.share.visibility = "specific";
      document.share.linkRole = "viewer";
      const entries: IAclEntry[] = [];
      for (const entry of body.acl) {
        const user = byEmail.get(entry.email);
        if (!user) return fail(`No Vault account exists for ${entry.email}`, 400);
        entries.push({ user: user._id, role: entry.role });
      }
      document.share.acl = entries;
    }

    await document.save();
    const updated = document.toObject() as unknown as LeanNode;
    return ok(await linkResult(updated, session.userId));
  } catch (error) {
    return handleError(error);
  }
}
