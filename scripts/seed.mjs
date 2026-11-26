import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

function loadEnv() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnv();

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/drive_ref";
const dbName = new URL(uri.replace("mongodb://", "mongodb+srv://")).pathname.slice(1);
if (dbName !== "drive_ref") {
  throw new Error(`Refusing to wipe database "${dbName}" — seed only touches drive_ref`);
}
const storageRoot = path.resolve(process.cwd(), process.env.STORAGE_DIR || ".data/blobs");

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}
function solidPng(width, height, [r, g, b]) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = y * stride + 1 + x * 3;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
function pdf(title) {
  const stream = `BT /F1 18 Tf 72 720 Td (${title}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(out));
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

async function main() {
  await mongoose.connect(uri, { bufferCommands: false, maxPoolSize: 5 });
  const db = mongoose.connection.db;
  if (db.databaseName !== "drive_ref") {
    throw new Error(`Refusing to wipe database "${db.databaseName}"`);
  }
  await db.dropDatabase();
  await rm(storageRoot, { recursive: true, force: true });
  await mkdir(storageRoot, { recursive: true });

  const userSchema = new mongoose.Schema(
    {
      name: String,
      email: String,
      password: String,
      quotaBytes: Number,
      usedBytes: Number,
    },
    { timestamps: true },
  );
  userSchema.index({ email: 1 }, { unique: true });
  const User = mongoose.model("User", userSchema);

  const aclSchema = new mongoose.Schema(
    { user: mongoose.Schema.Types.ObjectId, role: String },
    { _id: false },
  );
  const shareSchema = new mongoose.Schema(
    { visibility: String, nonce: String, acl: [aclSchema] },
    { _id: false },
  );
  const nodeSchema = new mongoose.Schema(
    {
      owner: mongoose.Schema.Types.ObjectId,
      parent: { type: mongoose.Schema.Types.ObjectId, default: null },
      kind: String,
      name: String,
      nameKey: String,
      mimeType: String,
      size: Number,
      storageKey: String,
      trashed: Boolean,
      trashedAt: Date,
      starred: Boolean,
      share: shareSchema,
    },
    { timestamps: true },
  );
  nodeSchema.index(
    { owner: 1, parent: 1, nameKey: 1 },
    { unique: true, partialFilterExpression: { trashed: false } },
  );
  nodeSchema.index({ storageKey: 1 }, { unique: true, partialFilterExpression: { kind: "file" } });
  nodeSchema.index({ owner: 1, trashed: 1, updatedAt: -1 });
  const FileNode = mongoose.model("FileNode", nodeSchema);
  await Promise.all([User.syncIndexes(), FileNode.syncIndexes()]);

  const password = await bcrypt.hash("password123", 12);
  const [alex, blair, casey] = await User.create([
    { name: "Alex Morgan", email: "alex@example.com", password, quotaBytes: 50 * 1024 * 1024 },
    { name: "Blair Chen", email: "blair@example.com", password, quotaBytes: 20 * 1024 * 1024 },
    { name: "Casey Rivera", email: "casey@example.com", password, quotaBytes: 2 * 1024 },
  ]);

  const used = new Map([[alex.id, 0], [blair.id, 0], [casey.id, 0]]);

  async function folder(owner, parent, name, options = {}) {
    const doc = await FileNode.create({
      owner: owner._id,
      parent: parent ? parent._id : null,
      kind: "folder",
      name,
      nameKey: name.toLowerCase(),
      mimeType: "",
      size: 0,
      storageKey: "",
      trashed: options.trashed ?? false,
      trashedAt: options.trashed ? new Date() : null,
      starred: options.starred ?? false,
      share: { visibility: "private", nonce: randomUUID(), acl: [] },
    });
    return doc;
  }

  async function file(owner, parent, name, bytes, mimeType, options = {}) {
    const extension = name.split(".").pop().toLowerCase();
    const key = `${owner.id}/${randomUUID()}.${extension}`;
    const full = path.join(storageRoot, owner.id, key.split("/")[1]);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
    const doc = await FileNode.create({
      owner: owner._id,
      parent: parent ? parent._id : null,
      kind: "file",
      name,
      nameKey: name.toLowerCase(),
      mimeType,
      size: bytes.length,
      storageKey: key,
      trashed: options.trashed ?? false,
      trashedAt: options.trashed ? new Date() : null,
      starred: options.starred ?? false,
      share: options.share ?? { visibility: "private", nonce: randomUUID(), acl: [] },
    });
    used.set(owner.id, used.get(owner.id) + bytes.length);
    return doc;
  }

  const design = await folder(alex, null, "Design System");
  const finance = await folder(alex, null, "Finance");
  const product = await folder(alex, null, "Product");
  const reference = await folder(alex, null, "Reference");

  const welcome = Buffer.from(
    "Welcome to Vault.\n\nEverything here lives in folders, just like a real drive. " +
      "Use the sidebar to move between My files, Recent, Starred and Trash. " +
      "Upload a file with the Upload button, then open its menu to rename, move, star or share it.\n",
  );
  await file(alex, null, "Welcome to Vault.txt", welcome, "text/plain", { starred: true });
  await file(
    alex,
    null,
    "Atlas — project brief.md",
    Buffer.from(
      "# Project Atlas\n\nA focused workspace for the 2026 product refresh.\n\n" +
        "- Design System: palette, type scale and iconography\n" +
        "- Product: roadmap, launch checklist and the spec draft\n" +
        "- Finance: forecast and invoices\n",
    ),
    "text/plain",
  );

  const palette = await file(
    alex,
    design,
    "Brand palette.png",
    solidPng(48, 48, [14, 118, 101]),
    "image/png",
    { starred: true, share: { visibility: "link", nonce: randomUUID(), acl: [] } },
  );
  await file(
    alex,
    design,
    "Type scale.md",
    Buffer.from(
      "Display 42 / 48 · Heading 28 / 34 · Body 15 / 24 · Caption 12 / 16\n\n" +
        "Headings use the serif stack. Interface text stays sans for legibility.\n",
    ),
    "text/plain",
  );
  await file(
    alex,
    design,
    "Iconography notes.txt",
    Buffer.from(
      "Line icons at 1.5px stroke. No emoji in the product UI. " +
        "Each action gets a text label and an accessible name.\n",
    ),
    "text/plain",
  );

  await file(
    alex,
    finance,
    "Q3 Forecast.csv",
    Buffer.from(
      "Month,Revenue,Costs,Net\nJul,128400,74200,54200\nAug,141900,76900,65000\nSep,158200,80100,78100\n",
    ),
    "text/csv",
    { starred: true },
  );
  await file(
    alex,
    finance,
    "Invoice 2041.pdf",
    pdf("Invoice 2041 - Northwind Studio"),
    "application/pdf",
  );
  await file(
    alex,
    finance,
    "Expense report.csv",
    Buffer.from("Category,Amount\nSoftware,1420\nTravel,880\nStudio,640\n"),
    "text/csv",
  );

  const roadmap = await file(
    alex,
    product,
    "Roadmap 2026.md",
    Buffer.from(
      "# Roadmap 2026\n\nQ1 — storage foundations and sharing.\n" +
        "Q2 — previews and search.\nQ3 — team workspaces.\nQ4 — audit and export.\n\n" +
        "Owners: Alex (product), Blair (design).\n",
    ),
    "text/plain",
    {
      starred: true,
      share: {
        visibility: "specific",
        nonce: randomUUID(),
        acl: [
          { user: blair._id, role: "editor" },
          { user: casey._id, role: "viewer" },
        ],
      },
    },
  );
  await file(
    alex,
    product,
    "Launch checklist.txt",
    Buffer.from(
      "1. Confirm copy\n2. Verify permissions\n3. Check share links\n4. Run the seed\n5. Publish\n",
    ),
    "text/plain",
  );
  await file(
    alex,
    product,
    "Dashboard screenshot.png",
    solidPng(48, 48, [183, 114, 43]),
    "image/png",
  );
  await file(
    alex,
    product,
    "Spec draft.pdf",
    pdf("Product Specification Draft"),
    "application/pdf",
  );

  const reading = await file(
    alex,
    reference,
    "Reading list.md",
    Buffer.from("1. Designing Data-Intensive Applications\n2. The Timeless Way of Building\n3. Shape Up\n"),
    "text/plain",
    {
      share: {
        visibility: "specific",
        nonce: randomUUID(),
        acl: [{ user: blair._id, role: "viewer" }],
      },
    },
  );
  await file(
    alex,
    reference,
    "Interview notes.txt",
    Buffer.from("Candidate asked about quota handling and link revocation. Both are covered.\n"),
    "text/plain",
  );
  await file(
    alex,
    null,
    "Old logo draft.png",
    solidPng(24, 24, [120, 120, 120]),
    "image/png",
    { trashed: true },
  );

  const blairFolder = await folder(blair, null, "Personal");
  await file(
    blair,
    blairFolder,
    "Weekend notes.txt",
    Buffer.from("Groceries, library return, and the train ticket.\n"),
    "text/plain",
  );
  await file(
    casey,
    null,
    "Starter.txt",
    Buffer.from("Small quota account for testing.\n"),
    "text/plain",
  );

  await Promise.all(
    [...used].map(([id, bytes]) => User.updateOne({ _id: id }, { $set: { usedBytes: bytes } })),
  );

  const counts = {
    users: await User.countDocuments(),
    folders: await FileNode.countDocuments({ kind: "folder" }),
    files: await FileNode.countDocuments({ kind: "file" }),
    trashed: await FileNode.countDocuments({ trashed: true }),
    starred: await FileNode.countDocuments({ starred: true }),
    shared: await FileNode.countDocuments({ "share.visibility": { $ne: "private" } }),
  };
  console.log("Seed complete:", JSON.stringify(counts));
  console.log("Demo accounts: alex@example.com, blair@example.com, casey@example.com (password123)");
  console.log("Seeded link-share node:", palette.id.toString());
  console.log("Seeded ACL node:", roadmap.id.toString(), "and", reading.id.toString());
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
