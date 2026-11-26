import { getSession } from "@/lib/auth";
import { fail, handleError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { verifyShareToken } from "@/lib/share-token";
import { storage } from "@/lib/storage";
import { getNode, nodeAccess } from "@/lib/queries";

type Ctx = RouteContext<"/api/files/[id]/content">;

export async function GET(request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const session = await getSession();
    await connectDB();

    const node = await getNode(id);
    if (!node) return fail("File not found", 404);
    if (node.kind !== "file") return fail("Folders do not have file content", 400);

    const params = new URL(request.url).searchParams;
    const token = params.get("token");
    const link = token ? await verifyShareToken(token) : null;
    const access = nodeAccess(node, session?.userId, link);
    if (!access.view) {
      if (session || link) return fail("You do not have access to this file", 403);
      return fail("You must be signed in", 401);
    }

    const bytes = await storage.get(node.storageKey);
    if (!bytes) return fail("The stored file is missing", 404);

    const download = params.get("download") === "1";
    const disposition = download ? "attachment" : "inline";
    const filename = encodeURIComponent(node.name);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": node.mimeType,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${filename}`,
        "Cache-Control": "private, no-store",
        "Content-Length": String(bytes.length),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
