import type { ShareRole, Visibility } from "@/models/FileNode";

export type AccessReason = "owner" | "acl" | "link" | "none";

export type AccessInfo = {
  view: boolean;
  edit: boolean;
  manage: boolean;
  via: AccessReason;
  role: ShareRole | null;
};

export type AclEntryDTO = {
  userId: string;
  name: string;
  email: string;
  role: ShareRole;
};

export type ShareDTO = {
  visibility: Visibility;
  linkActive: boolean;
  acl: AclEntryDTO[];
};

export type FileDTO = {
  id: string;
  name: string;
  kind: "file" | "folder";
  mimeType: string;
  size: number;
  parentId: string | null;
  starred: boolean;
  trashed: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; name: string };
  share: ShareDTO;
  access: AccessInfo;
  previewable: boolean;
};

export type BreadcrumbDTO = { id: string | null; name: string };

export type FilePageDTO = {
  items: FileDTO[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type UsageDTO = {
  quotaBytes: number;
  usedBytes: number;
  freeBytes: number;
  percent: number;
};

export type LinkIdentity = {
  nodeId: string;
  nonce: string;
  role: ShareRole;
};
