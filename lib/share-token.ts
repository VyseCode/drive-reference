import { SignJWT, jwtVerify } from "jose";
import type { LinkIdentity } from "@/lib/types";
import type { ShareRole } from "@/models/FileNode";

const secret = new TextEncoder().encode(
  process.env.SHARE_SECRET || "dev-only-share-secret-change-me-before-deploying",
);

export async function signShareToken(identity: LinkIdentity): Promise<string> {
  return new SignJWT({ nonce: identity.nonce, role: identity.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(identity.nodeId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyShareToken(token: string): Promise<LinkIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || typeof payload.nonce !== "string") return null;
    const role: ShareRole = payload.role === "editor" ? "editor" : "viewer";
    return { nodeId: payload.sub, nonce: payload.nonce, role };
  } catch {
    return null;
  }
}
