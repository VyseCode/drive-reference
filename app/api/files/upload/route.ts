import { getSession } from "@/lib/auth";
import { fail, handleError, isDuplicateKeyError, ok } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { FileNode } from "@/models/FileNode";
import { detectFileType, MAX_FILE_BYTES } from "@/lib/files";
import { makeStorageKey, storage } from "@/lib/storage";
import { getNode, nameConflict, ownerIdOf, toFileDTO } from "@/lib/queries";
import { cleanName, validId } from "@/lib/route-utils";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("You must be signed in", 401);

    const form = await request.formData();
    const entry = form.get("file");
    if (!(entry instanceof File)) return fail("Choose a file to upload", 400);

    const name = cleanName(entry.name);
    if (!name) return fail("Choose a file with a valid name", 400);
    const detected = detectFileType(name, entry.type);
    if (!detected) {
      return fail("That file type is not supported. Upload an image, PDF or text file.", 415);
    }
    const bytes = Buffer.from(await entry.arrayBuffer());
    if (bytes.length === 0) return fail("That file is empty", 400);
    if (bytes.length > MAX_FILE_BYTES) return fail("Files must be 20 MB or smaller", 413);

    const parentRaw = typeof form.get("parent") === "string" ? String(form.get("parent")) : "";
    const parentId = parentRaw ? validId(parentRaw) : null;
    if (parentRaw && !parentId) return fail("Invalid parent folder", 400);

    await connectDB();
    if (parentId) {
      const parent = await getNode(parentId.toString());
      if (!parent || parent.kind !== "folder" || parent.trashed) {
        return fail("That folder is no longer available", 404);
      }
      if (ownerIdOf(parent.owner) !== session.userId) {
        return fail("You can only upload into your own folders", 403);
      }
    }

    if (await nameConflict(session.userId, parentId, name)) {
      return fail("A file or folder with that name already exists here", 409);
    }

    const charged = await User.updateOne(
      {
        _id: session.userId,
        $expr: { $lt: [{ $add: ["$usedBytes", bytes.length] }, "$quotaBytes"] },
      },
      { $inc: { usedBytes: bytes.length } },
    );
    if (charged.matchedCount === 0) {
      return fail("Your storage quota is full. Delete a file to make room.", 413);
    }

    const key = makeStorageKey(session.userId, detected.extension);
    const stored = await storage.put(key, bytes, detected.mimeType);

    try {
      const node = await FileNode.create({
        owner: session.userId,
        parent: parentId,
        kind: "file",
        name,
        nameKey: name.toLowerCase(),
        mimeType: detected.mimeType,
        size: stored.size,
        storageKey: stored.key,
      });
      return ok({ file: toFileDTO(node.toObject(), session.userId) }, 201);
    } catch (error) {
      await storage.delete(key);
      await User.updateOne({ _id: session.userId }, { $inc: { usedBytes: -bytes.length } });
      if (isDuplicateKeyError(error)) {
        return fail("A file or folder with that name already exists here", 409);
      }
      throw error;
    }
  } catch (error) {
    return handleError(error);
  }
}
