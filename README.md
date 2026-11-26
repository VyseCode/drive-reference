# Vault — Drive-style file storage

A reference implementation inspired by **Google Drive**. Vault is a private, calm file workspace
built with Next.js 16 App Router, React 19, Tailwind 4, TypeScript, MongoDB/Mongoose, bcryptjs and
`jose` signed cookies/tokens.

## Features

**Files and folders**

- Hierarchical folder tree with breadcrumbs, move, rename, star, trash/restore and permanent delete.
- Multipart upload to local disk behind a swappable `StorageAdapter` interface.
- Previews for images and text/PDF, plus direct download with a safe `Content-Disposition`.
- Per-user quota with an atomic usage counter and a storage bar in the sidebar.
- Search by name, recent files, starred files, trash view, bounded pagination and sorting.

**Sharing**

- Three visibility modes: `private`, `link` (anyone with the signed link), and `specific` (named
  users with `viewer` or `editor` ACL entries).
- Signed, expiring share tokens issued with a dedicated HS256 secret. Revoking a link rotates the
  node's nonce so previously issued tokens fail immediately.
- Link editors can rename through a token-authenticated PATCH; named editors can rename with their
  session. Only the owner can move, star, trash, delete or change sharing.

**Interface**

- Original "archival stationery" identity: warm paper canvas (`#f6f5f1`), forest ink (`#1b2b25`),
  verdigris accent (`#0e7665`), amber highlights, serif display headings and inline SVG icons.
- Sidebar information architecture (My files / Recent / Starred / Trash), responsive down to mobile,
  grid and list views, deliberate empty states, skeletons, accessible labels and visible focus.

## Setup

Requires Node 20.9+, npm and a local MongoDB listening on `127.0.0.1:27017`.

```bash
npm install
cp .env.example .env.local      # adjust secrets and MongoDB URI
npm run seed                    # creates drive_ref and sample content
npm run dev                     # http://localhost:3000
```

For a local production deploy on port **3224**:

```bash
npm run build && npm start -- -p 3224
```

### Environment

| Variable | Purpose | Default |
| --- | --- | --- |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/drive_ref` |
| `JWT_SECRET` | HS256 secret for the session cookie | development placeholder |
| `SHARE_SECRET` | Separate HS256 secret for share links | development placeholder |
| `STORAGE_DRIVER` | Storage adapter selector | `local` |
| `STORAGE_DIR` | Blob subdirectory under `.data/` | `blobs` |
| `NEXT_PUBLIC_APP_URL` | Base URL used in copied share links | `http://localhost:3224` |

### Demo accounts

All passwords are `password123`.

| Account | Quota | Notes |
| --- | --- | --- |
| `alex@example.com` | 50 MB | Main demo account with folders, stars, trash and shared files |
| `blair@example.com` | 20 MB | Named `editor` on Roadmap, `viewer` on Reading list |
| `casey@example.com` | 2 KB | Small quota for the quota-exceeded edge case |

`npm run seed` is re-runnable and wipes **only** the `drive_ref` database and `.data/blobs`.

## API

All endpoints are under `/api`. Cookie-based session required unless marked public.

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/auth/register` | Create account (duplicate email → 409) |
| POST | `/auth/login` | Sign in with bcrypt password check |
| POST | `/auth/logout` | Clear the HTTP-only session cookie |
| GET | `/auth/me` | Current user, quota, usage |
| GET | `/files` | List with `view=all\|recent\|starred\|trash\|search`, `folder`, `q`, `sort`, `dir`, `page`, `limit` |
| POST | `/files/folder` | Create folder (`name`, `parent`) |
| POST | `/files/upload` | Multipart upload (`file`, optional `parent`) |
| GET | `/files/[id]` | Detail, access info and breadcrumbs (optional `?token`) |
| PATCH | `/files/[id]` | `rename`, `move`, `star`, `trash`, `restore` (optional `?token` for link editors) |
| DELETE | `/files/[id]` | Permanent delete of the subtree, refunds quota (owner only) |
| GET | `/files/[id]/content` | Inline preview or `?download=1`; optional `?token` |
| GET | `/files/[id]/share` | Share configuration and signed link (owner only) |
| POST | `/files/[id]/share` | Set `private`, `link` or `specific` ACL (owner only) |
| GET | `/share/[token]` | Publicly resolve a signed share token |
| GET | `/users/search` | Find people by name/email for ACL entry |

Pages: `/`, `/login`, `/register`, `/drive`, `/drive/recent`, `/drive/starred`, `/drive/trash`,
`/drive/search?q=`, and the public `/s/[token]`.

## Verification

```bash
npm run lint && npm run typecheck && npm run build && npm run seed
npm start -- -p 3224
bash scripts/verify.sh           # 77 assertions
fuser -k 3224/tcp
```

## Simulation boundary

**No real external service is contacted.** Blobs are written to the local filesystem through the
`StorageAdapter` interface in `lib/storage/types.ts`; the `local` implementation is
`lib/storage/local.ts`, selected in `lib/storage/index.ts`. Uploads, downloads, deletion, quota,
permissions, link signing and all UI flows are genuine application logic — only the persistence
back end is simulated.

**Swapping to object storage:** implement `put`, `get` and `delete` in a new module (e.g.
`lib/storage/s3.ts`) using your provider SDK, add a `case "s3"` to `lib/storage/index.ts`, set
`STORAGE_DRIVER=s3` and supply provider credentials through environment variables. Storage keys are
opaque strings (`<userId>/<uuid>.<ext>`) already stored in `FileNode.storageKey`, so no model or
migration change is needed. Share tokens and sessions are signed locally with `jose`; no email, SMS,
maps, payment or calendar provider is used or stubbed.

## Known limitations

- Starred is a node flag shared by everyone who can see the file, not a per-user bookmark.
- Trashing a folder cascades to its descendants; restoring checks names at their original locations.
- Previews serve the original bytes (no thumbnail pipeline or virus scanning).
- Link "editor" access is limited to rename; richer collaborative editing is out of scope.
- Local disk storage is single-node only; object storage is the documented horizontal-scale path.
- `SameSite=lax` cookies plus signed tokens are used, but there is no CSRF token or rate limiting.
- Client-side console output was not instrumented with a headless browser in this reference run.

## Top three improvements

1. Per-user star state and activity history.
2. Object-storage adapter with thumbnails and content scanning.
3. Fine-grained editor operations (upload/rename/delete inside shared folders) and rate limiting.
