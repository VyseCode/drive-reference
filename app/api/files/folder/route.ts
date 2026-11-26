import { z } from "zod";
import { getSession } from "@/lib/auth";
import { fail, handleError, isDuplicateKeyError, ok, readJson } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { FileNode } from "@/models/FileNode";
import { getNode, nameConflict, ownerIdOf, toFileDTO } from "@/lib/queries";
import { cleanName, validId } from "@/lib/route-utils";

const schema = z.object({
  name: z.string().trim().min(1, "Give the folder a name").max(200),
  parent: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("You must be signed in", 401);
    const body = schema.parse(await readJson(request));
    await connectDB();

    const parentId = body.parent ? validId(body.parent) : null;
    if (body.parent && !parentId) return fail("Invalid parent folder", 400);
    if (parentId) {
      const parent = await getNode(parentId.toString());
      if (!parent || parent.kind !== "folder" || parent.trashed) {
        return fail("That folder is no longer available", 404);
      }
      if (ownerIdOf(parent.owner) !== session.userId) {
        return fail("You can only create folders inside your own folders", 403);
      }
    }

    const name = cleanName(body.name);
    if (!name) return fail("Give the folder a name", 400);
    if (await nameConflict(session.userId, parentId, name)) {
      return fail("A folder or file with that name already exists here", 409);
    }

    const node = await FileNode.create({
      owner: session.userId,
      parent: parentId,
      kind: "folder",
      name,
      nameKey: name.toLowerCase(),
      mimeType: "",
      size: 0,
      storageKey: "",
    });

    return ok({ file: toFileDTO(node.toObject(), session.userId) }, 201);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return fail("A folder or file with that name already exists here", 409);
    }
    return handleError(error);
  }
}
