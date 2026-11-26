import { Types } from "mongoose";
import { FileNode } from "@/models/FileNode";
import type { ShareRole, Visibility } from "@/models/FileNode";
import { describeAccess } from "@/lib/access";
import { isPreviewable } from "@/lib/files";
import type {
  AccessInfo,
  BreadcrumbDTO,
  FileDTO,
  FilePageDTO,
  LinkIdentity,
} from "@/lib/types";

type OwnerRef = Types.ObjectId | { _id: Types.ObjectId; name: string };
type AclUserRef = Types.ObjectId | { _id: Types.ObjectId; name: string; email: string };
type AclRef = { user: AclUserRef; role: ShareRole };

export type LeanNode = {
  _id: Types.ObjectId;
  owner: OwnerRef;
  parent: Types.ObjectId | null;
  kind: "file" | "folder";
  name: string;
  nameKey: string;
  mimeType: string;
  size: number;
  storageKey: string;
  trashed: boolean;
  trashedAt: Date | null;
  starred: boolean;
  share: {
    visibility: Visibility;
    nonce: string;
    linkRole?: ShareRole;
    acl: AclRef[];
  };
  createdAt: Date;
  updatedAt: Date;
};

function refId(value: OwnerRef | AclUserRef): string {
  return value instanceof Types.ObjectId ? value.toString() : value._id.toString();
}

export function ownerIdOf(owner: OwnerRef): string {
  return refId(owner);
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function nodeAccess(
  node: LeanNode,
  viewerId: string | null | undefined,
  link?: LinkIdentity | null,
): AccessInfo {
  const id = node._id.toString();
  return describeAccess(
    id,
    {
      owner: refId(node.owner),
      trashed: node.trashed,
      share: {
        visibility: node.share.visibility,
        nonce: node.share.nonce,
        linkRole: node.share.linkRole,
        acl: node.share.acl.map((entry) => ({
          user: refId(entry.user),
          role: entry.role,
        })),
      },
    },
    viewerId,
    link,
  );
}

export function toFileDTO(
  node: LeanNode,
  viewerId: string | null | undefined,
  link?: LinkIdentity | null,
): FileDTO {
  const owner = node.owner;
  return {
    id: node._id.toString(),
    name: node.name,
    kind: node.kind,
    mimeType: node.mimeType,
    size: node.size,
    parentId: node.parent ? node.parent.toString() : null,
    starred: node.starred,
    trashed: node.trashed,
    trashedAt: toIso(node.trashedAt),
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
    owner: {
      id: refId(owner),
      name: "name" in owner ? owner.name : "",
    },
    share: {
      visibility: node.share.visibility,
      linkActive: node.share.visibility === "link",
      acl: node.share.acl.map((entry) => ({
        userId: refId(entry.user),
        name: "name" in entry.user ? entry.user.name : "",
        email: "email" in entry.user ? entry.user.email : "",
        role: entry.role,
      })),
    },
    access: nodeAccess(node, viewerId, link),
    previewable: node.kind === "file" && isPreviewable(node.mimeType),
  };
}

export async function getNodeDocument(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  return FileNode.findById(id);
}

export async function getNode(id: string): Promise<LeanNode | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = await FileNode.findById(id)
    .populate("owner", "name")
    .populate("share.acl.user", "name email")
    .lean();
  return (doc as unknown as LeanNode) ?? null;
}

export type ListOptions = {
  viewerId: string;
  view: "all" | "recent" | "starred" | "trash" | "search";
  folderId: Types.ObjectId | null;
  query: string;
  page: number;
  limit: number;
  sort: "name" | "updatedAt" | "size";
  dir: "asc" | "desc";
};

export async function listFiles(options: ListOptions): Promise<FilePageDTO> {
  const { viewerId, view, folderId, page, limit } = options;
  const viewer = new Types.ObjectId(viewerId);
  const filter: Record<string, unknown> = {};

  if (view === "all") {
    filter.owner = viewer;
    filter.trashed = false;
    filter.parent = folderId;
  } else if (view === "trash") {
    filter.owner = viewer;
    filter.trashed = true;
  } else if (view === "starred") {
    filter.owner = viewer;
    filter.trashed = false;
    filter.starred = true;
  } else {
    filter.$or = [{ owner: viewer }, { "share.acl.user": viewer }];
    filter.trashed = false;
    if (view === "search" && options.query) {
      const escaped = options.query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = new RegExp(escaped, "i");
    }
  }

  const sortField = options.sort === "name" ? "nameKey" : options.sort;
  const direction = options.dir === "asc" ? 1 : -1;
  const docs = (await FileNode.find(filter)
    .sort({ [sortField]: direction, kind: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("owner", "name")
    .populate("share.acl.user", "name email")
    .lean()) as unknown as LeanNode[];
  const total = await FileNode.countDocuments(filter);

  return {
    items: docs.map((node) => toFileDTO(node, viewerId)),
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

export async function getBreadcrumbs(
  node: LeanNode,
  viewerId: string | null | undefined,
  link?: LinkIdentity | null,
): Promise<BreadcrumbDTO[]> {
  const chain: BreadcrumbDTO[] = [];
  const seen = new Set<string>([node._id.toString()]);
  let parentId = node.parent;

  for (let depth = 0; parentId && depth < 32; depth += 1) {
    const key = parentId.toString();
    if (seen.has(key)) break;
    seen.add(key);
    const parent = (await FileNode.findById(parentId).select("name parent").lean()) as {
      _id: Types.ObjectId;
      name: string;
      parent: Types.ObjectId | null;
    } | null;
    if (!parent) break;
    chain.push({ id: parent._id.toString(), name: parent.name });
    parentId = parent.parent;
  }

  const access = nodeAccess(node, viewerId, link);
  const rootName = access.via === "acl" || access.via === "link" ? "Shared with you" : "My files";
  return [{ id: null, name: rootName }, ...chain.reverse()];
}

export async function findSubtree(root: LeanNode): Promise<{
  ids: Types.ObjectId[];
  objects: Array<{ key: string; size: number }>;
  bytes: number;
}> {
  const ids = [root._id];
  const objects: Array<{ key: string; size: number }> = [];
  let bytes = 0;
  if (root.kind === "file" && root.storageKey) {
    objects.push({ key: root.storageKey, size: root.size });
    bytes += root.size;
  }

  let frontier = [root._id];
  for (let depth = 0; frontier.length && depth < 64; depth += 1) {
    const children = (await FileNode.find({ parent: { $in: frontier } })
      .select("_id kind storageKey size")
      .lean()) as unknown as Array<{
      _id: Types.ObjectId;
      kind: "file" | "folder";
      storageKey: string;
      size: number;
    }>;
    ids.push(...children.map((child) => child._id));
    for (const child of children) {
      if (child.kind === "file" && child.storageKey) {
        objects.push({ key: child.storageKey, size: child.size });
        bytes += child.size;
      }
    }
    frontier = children.map((child) => child._id);
  }

  return { ids, objects, bytes };
}

export async function nameConflict(
  ownerId: string | Types.ObjectId,
  parentId: Types.ObjectId | null,
  name: string,
  excludeId?: Types.ObjectId,
): Promise<boolean> {
  const query: Record<string, unknown> = {
    owner: ownerId,
    parent: parentId,
    nameKey: name.toLowerCase(),
    trashed: false,
  };
  if (excludeId) query._id = { $ne: excludeId };
  return Boolean(await FileNode.exists(query));
}

export async function restoreConflict(node: LeanNode): Promise<string | null> {
  const subtree = await findSubtree(node);
  const docs = (await FileNode.find({ _id: { $in: subtree.ids } })
    .select("_id name parent")
    .lean()) as unknown as Array<{
    _id: Types.ObjectId;
    name: string;
    parent: Types.ObjectId | null;
  }>;
  for (const doc of docs) {
    if (await nameConflict(refId(node.owner), doc.parent, doc.name, doc._id)) {
      return doc.name;
    }
  }
  return null;
}
