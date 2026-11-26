import { fail, handleError, ok } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { verifyShareToken } from "@/lib/share-token";
import { getNode, nodeAccess, toFileDTO } from "@/lib/queries";

type Ctx = RouteContext<"/api/share/[token]">;

export async function GET(_request: Request, context: Ctx) {
  try {
    const { token } = await context.params;
    const identity = await verifyShareToken(token);
    if (!identity) return fail("This link is invalid or has expired", 403);

    await connectDB();
    const node = await getNode(identity.nodeId);
    if (!node || node.kind !== "file") {
      return fail("This link no longer points to a file", 404);
    }
    const access = nodeAccess(node, null, identity);
    if (!access.view) return fail("This link has been revoked", 403);

    return ok({
      file: toFileDTO(node, null, identity),
      role: identity.role,
      previewUrl: `/api/files/${identity.nodeId}/content?token=${encodeURIComponent(token)}`,
    });
  } catch (error) {
    return handleError(error);
  }
}
