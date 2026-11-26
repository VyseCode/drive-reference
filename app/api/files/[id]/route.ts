import { Types } from "mongoose";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { FileNode } from "@/models/FileNode";
import { verifyShareToken } from "@/lib/share-token";
import { storage } from "@/lib/storage";
import {
  findSubtree,
  getBreadcrumbs,
  getNode,
  getNodeDocument,
  nameConflict,
  nodeAccess,
  ownerIdOf,
  restoreConflict,
  toFileDTO,
  type LeanNode,
} from "@/lib/queries";
import { cleanName, validId } from "@/lib/route-utils";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), name: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal("move"), parent: z.string().nullable() }),
  z.object({ action: z.literal("star"), starred: z.boolean() }),
  z.object({ action: z.literal("trash") }),
  z.object({ action: z.literal("restore") }),
]);

type Ctx = RouteContext<"/api/files/[id]">;

export async function GET(request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const session = await getSession();
    await connectDB();

    const node = await getNode(id);
    if (!node) return fail("File not found", 404);

    const token = new URL(request.url).searchParams.get("token");
    const link = token ? await verifyShareToken(token) : null;
    const access = nodeAccess(node, session?.userId, link);
    if (!access.view) {
      if (session || link) return fail("You do not have access to this item", 403);
      return fail("You must be signed in", 401);
    }

    const viewerId = session?.userId ?? null;
    return ok({
      file: toFileDTO(node, viewerId, link),
      breadcrumbs: await getBreadcrumbs(node, viewerId, link),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, context: Ctx) {
  try {
    const session = await getSession();
    const token = new URL(request.url).searchParams.get("token");
    const link = token ? await verifyShareToken(token) : null;
    if (!session && !link) return fail("You must be signed in", 401);
    const { id } = await context.params;
    const body = actionSchema.parse(await readJson(request));
    await connectDB();

    const document = await getNodeDocument(id);
    if (!document) return fail("File not found", 404);
    const node = document.toObject() as unknown as LeanNode;
    const access = nodeAccess(node, session?.userId, link);
    if (!access.edit) return fail("Only the owner or an editor can change this item", 403);
    if (body.action !== "rename" && !access.manage) {
      return fail("Only the owner can move, star or delete this item", 403);
    }

    const ownerId = ownerIdOf(node.owner);
    const viewerId = session?.userId ?? null;

    if (body.action === "rename") {
      const name = cleanName(body.name);
      if (!name) return fail("Give this item a name", 400);
      if (await nameConflict(ownerId, node.parent, name, node._id)) {
        return fail("An item with that name already exists here", 409);
      }
      document.name = name;
      document.nameKey = name.toLowerCase();
      await document.save();
      return ok({ file: toFileDTO(document.toObject() as unknown as LeanNode, viewerId, link) });
    }

    if (body.action === "move") {
      if (node.trashed) return fail("Restore this item before moving it", 400);
      let targetId: Types.ObjectId | null = null;
      if (body.parent) {
        targetId = validId(body.parent);
        if (!targetId) return fail("Invalid destination folder", 400);
        const target = await getNode(targetId.toString());
        if (!target || target.kind !== "folder" || target.trashed) {
          return fail("Destination folder not found", 404);
        }
        if (ownerIdOf(target.owner) !== ownerId) {
          return fail("You can only move into your own folders", 403);
        }
        if (node.kind === "folder") {
          if (targetId.equals(node._id)) {
            return fail("A folder cannot be moved into itself", 400);
          }
          const subtree = await findSubtree(node);
          if (subtree.ids.some((item) => item.equals(targetId))) {
            return fail("A folder cannot be moved into its own subfolder", 400);
          }
        }
      }
      if (await nameConflict(ownerId, targetId, node.name, node._id)) {
        return fail("An item with that name already exists in the destination", 409);
      }
      document.parent = targetId;
      await document.save();
      return ok({ file: toFileDTO(document.toObject() as unknown as LeanNode, ownerId) });
    }

    if (body.action === "star") {
      document.starred = body.starred;
      await document.save();
      return ok({ file: toFileDTO(document.toObject() as unknown as LeanNode, ownerId) });
    }

    if (body.action === "trash") {
      if (node.trashed) return ok({ ok: true, trashed: true });
      const subtree = await findSubtree(node);
      await FileNode.updateMany(
        { _id: { $in: subtree.ids } },
        { $set: { trashed: true, trashedAt: new Date() } },
      );
      return ok({ ok: true, trashed: true, count: subtree.ids.length });
    }

    const conflict = await restoreConflict(node);
    if (conflict) {
      return fail(`"${conflict}" already exists at the original location`, 409);
    }
    const subtree = await findSubtree(node);
    await FileNode.updateMany(
      { _id: { $in: subtree.ids } },
      { $set: { trashed: false, trashedAt: null } },
    );
    return ok({ ok: true, trashed: false, count: subtree.ids.length });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const session = await getSession();
    if (!session) return fail("You must be signed in", 401);
    const { id } = await context.params;
    await connectDB();

    const document = await getNodeDocument(id);
    if (!document) return fail("File not found", 404);
    const node = document.toObject() as unknown as LeanNode;
    if (!nodeAccess(node, session.userId).manage) {
      return fail("Only the owner can permanently delete this item", 403);
    }

    const subtree = await findSubtree(node);
    for (const object of subtree.objects) await storage.delete(object.key);
    await FileNode.deleteMany({ _id: { $in: subtree.ids } });
    if (subtree.bytes > 0) {
      await User.updateOne(
        { _id: session.userId },
        { $inc: { usedBytes: -subtree.bytes } },
      );
    }

    return ok({ ok: true, deleted: subtree.ids.length, freedBytes: subtree.bytes });
  } catch (error) {
    return handleError(error);
  }
}
