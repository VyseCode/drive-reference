import { randomUUID } from "node:crypto";
import { Schema, model, models, type Model, type Types } from "mongoose";

export type NodeKind = "file" | "folder";
export type Visibility = "private" | "link" | "specific";
export type ShareRole = "viewer" | "editor";

export interface IAclEntry {
  user: Types.ObjectId;
  role: ShareRole;
}

export interface IShare {
  visibility: Visibility;
  nonce: string;
  acl: IAclEntry[];
}

export interface IFileNode {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  parent: Types.ObjectId | null;
  kind: NodeKind;
  name: string;
  nameKey: string;
  mimeType: string;
  size: number;
  storageKey: string;
  trashed: boolean;
  trashedAt: Date | null;
  starred: boolean;
  share: IShare;
  createdAt: Date;
  updatedAt: Date;
}

const aclSchema = new Schema<IAclEntry>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["viewer", "editor"], required: true },
  },
  { _id: false },
);

const shareSchema = new Schema<IShare>(
  {
    visibility: {
      type: String,
      enum: ["private", "link", "specific"],
      default: "private",
    },
    nonce: { type: String, default: () => randomUUID() },
    acl: { type: [aclSchema], default: [] },
  },
  { _id: false },
);

const fileNodeSchema = new Schema<IFileNode>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: "FileNode",
      default: null,
    },
    kind: { type: String, enum: ["file", "folder"], required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    nameKey: { type: String, required: true, trim: true, maxlength: 200 },
    mimeType: { type: String, default: "application/octet-stream" },
    size: { type: Number, default: 0, min: 0 },
    storageKey: { type: String, default: "" },
    trashed: { type: Boolean, default: false },
    trashedAt: { type: Date, default: null },
    starred: { type: Boolean, default: false },
    share: { type: shareSchema, default: () => ({}) },
  },
  { timestamps: true },
);

fileNodeSchema.pre("validate", async function () {
  if (this.name && !this.nameKey) this.nameKey = this.name.toLowerCase();
});

fileNodeSchema.index(
  { owner: 1, parent: 1, nameKey: 1 },
  {
    unique: true,
    name: "uniq_active_sibling_name",
    partialFilterExpression: { trashed: false },
  },
);
fileNodeSchema.index(
  { storageKey: 1 },
  { unique: true, name: "uniq_storage_key", partialFilterExpression: { kind: "file" } },
);
fileNodeSchema.index({ owner: 1, parent: 1, trashed: 1, kind: 1, name: 1 });
fileNodeSchema.index({ owner: 1, trashed: 1, updatedAt: -1 });
fileNodeSchema.index({ owner: 1, starred: 1, trashed: 1 });
fileNodeSchema.index({ owner: 1, "share.acl.user": 1, trashed: 1 });

export const FileNode: Model<IFileNode> =
  (models.FileNode as Model<IFileNode>) ||
  model<IFileNode>("FileNode", fileNodeSchema);
