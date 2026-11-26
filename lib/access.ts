import type { Types } from "mongoose";
import type { AccessInfo, LinkIdentity } from "@/lib/types";
import type { ShareRole, Visibility } from "@/models/FileNode";

type IdLike = Types.ObjectId | string;

type AccessNode = {
  owner: IdLike;
  trashed: boolean;
  share: {
    visibility: Visibility;
    nonce: string;
    linkRole?: ShareRole;
    acl: Array<{ user: IdLike; role: ShareRole }>;
  };
};

function id(value: IdLike): string {
  return typeof value === "string" ? value : value.toString();
}

export function describeAccess(
  nodeId: string,
  node: AccessNode,
  viewerId?: string | null,
  link?: LinkIdentity | null,
): AccessInfo {
  if (viewerId && id(node.owner) === viewerId) {
    return { view: true, edit: true, manage: true, via: "owner", role: null };
  }
  if (node.trashed) {
    return { view: false, edit: false, manage: false, via: "none", role: null };
  }

  if (
    link &&
    link.nodeId === nodeId &&
    link.nonce === node.share.nonce &&
    node.share.visibility === "link" &&
    (node.share.linkRole ?? "viewer") === link.role
  ) {
    return {
      view: true,
      edit: link.role === "editor",
      manage: false,
      via: "link",
      role: link.role,
    };
  }

  if (viewerId && node.share.visibility === "specific") {
    const entry = node.share.acl.find((item) => id(item.user) === viewerId);
    if (entry) {
      return {
        view: true,
        edit: entry.role === "editor",
        manage: false,
        via: "acl",
        role: entry.role,
      };
    }
  }

  return { view: false, edit: false, manage: false, via: "none", role: null };
}
