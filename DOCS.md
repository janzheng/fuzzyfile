# Fuzzyfile (F2) API Documentation

Fuzzyfile is a blob storage file handler built on Cloudflare Workers + R2. It supports scoped uploads, nanoid-based keys, versioning, deterministic keys, presigned URLs, IPFS content hashing, and zip downloads.

Base URL: `https://f2.phage.directory`

---

## Key Concepts

### Key Structure

Files are stored in R2 with keys following this pattern:

```
{scope}/{nanoid}/{version}/{filename}
```

- **scope** — a namespace or folder path (e.g. `images`, `users/avatars`)
- **nanoid** — an auto-generated 8-character ID to prevent collisions
- **version** — auto-incrementing (`v0`, `v1`, `v2`, ...) when uploading to the same scope+nanoid
- **filename** — the original or custom filename

### Storage Modes

| Mode | Key Pattern | nanoid | Versioning |
|------|------------|--------|------------|
| Default | `scope/abc123/v0/file.png` | auto-generated | yes |
| Deterministic | `scope/file.png` | skipped | no |
| Direct Upload | `scope/file.png` | skipped | no |

---

## Deterministic Mode

By default, F2 generates a random nanoid for each upload, producing keys like `images/abc123/v0/logo.png`. This is great for avoiding collisions but means you need to know the nanoid to retrieve the file.

**Deterministic mode** skips the nanoid and versioning entirely, storing files at an exact, predictable path. This is ideal for CRUD systems, caching, and any case where you want `get("images/logo.png")` to always resolve without needing to track generated keys.

### How to Enable

There are three equivalent approaches via the JSON POST API:

**Option A: Empty nanoid string** (recommended)

```json
{
  "cmd": "add",
  "key": "logo.png",
  "scope": "images",
  "nanoid": "",
  "useVersioning": false
}
```

R2 key: `images/logo.png`

**Option B: Direct upload flag**

```json
{
  "cmd": "add",
  "key": "logo.png",
  "scope": "images",
  "optionStr": "direct-upload"
}
```

R2 key: `images/logo.png`

**Option C: Disable versioning only**

```json
{
  "cmd": "add",
  "key": "logo.png",
  "scope": "images",
  "useVersioning": false
}
```

R2 key: `images/logo.png`

### Multipart Form Uploads

When uploading via multipart form data, pass a `filePath` field to enable deterministic mode automatically:

```bash
curl https://f2.phage.directory/ \
  -F "scope=images" \
  -F "filePath=assets/logo.png" \
  -F "files[]=@logo.png"
```

The `filePath` field sets `nanoid` to `""` and `useVersioning` to `false` internally.

You can also explicitly control it with form fields:

```bash
curl https://f2.phage.directory/ \
  -F "scope=images" \
  -F "nanoid=" \
  -F "versioning=false" \
  -F "files[]=@logo.png"
```

---

## API Reference

### GET Endpoints

All GET operations use URL path patterns and query parameters.

#### Get a File

Retrieve a file by its full R2 key path.

```
GET /{key}
GET /{scope}/{filename}
GET /{scope}/{nanoid}
GET /{scope}/{nanoid}/{filename}
GET /{scope}/{nanoid}/{version}
GET /{scope}/{nanoid}/{version}/{filename}
```

Examples:
```
GET /logo.png
GET /images/logo.png
GET /images/abc123
GET /images/abc123/photo.jpg
GET /images/abc123/v2
```

Returns the file body with appropriate `Content-Type`, `ETag`, `Cache-Control`, and `Content-Disposition` headers. Supports range requests for audio/video streaming.

#### Add a File via URL (GET)

Upload a file by providing its source URL as a query parameter.

```
GET /{scope}?url={source_url}
GET /{scope}?url={source_url}&name={custom_filename}
GET /{scope}?add={source_url}
GET /{scope}?add={source_url}&name={custom_filename}
GET /{scope}/{nanoid}?add={source_url}&name={custom_filename}
```

- `?url=` — downloads the file, stores it, and returns the file body directly (pass-through cache mode). Uses deterministic/direct-upload mode.
- `?add=` — downloads the file, stores it, and returns the JSON metadata. Uses nanoid+versioning mode.
- `&name=` — optional custom filename override.

Examples:
```
GET /images?url=https://example.com/photo.jpg
GET /images?add=https://example.com/photo.jpg&name=hero.jpg
GET /images/abc123?add=https://example.com/photo.jpg
```

#### List Files

```
GET /list
GET /list/{scope}
GET /list/{scope}/{arbitrary/path}
GET /{scope}/{path}/list
```

Returns JSON with file metadata grouped by scope or nanoid.

Response:
```json
{
  "total": 5,
  "items": [
    {
      "key": "images/abc123/v0/photo.jpg",
      "uploaded": "2024-01-15T10:30:00Z",
      "size": 204800,
      "type": "image/jpeg",
      "ipfsHash": "Qm..."
    }
  ]
}
```

Listing the root (`GET /list`) returns items grouped by top-level scope.

#### Download as Zip

```
GET /download/{scope}
GET /download/{scope}/{arbitrary/path}
```

Downloads all files under the given prefix as a `.zip` archive.

Example:
```
wget https://f2.phage.directory/download/images/profiles -O profiles.zip
```

#### Get File Details

```
GET /details/{scope}/{path}/{filename}
GET /details/{ipfs_hash}
```

Returns file metadata without the file body:

```json
{
  "key": "images/abc123/v0/photo.jpg",
  "size": 204800,
  "uploaded": "2024-01-15T10:30:00Z",
  "httpMetadata": { "contentType": "image/jpeg" },
  "customMetadata": { "ipfsHash": "Qm..." },
  "httpEtag": "\"abc123\"",
  "version": "v0"
}
```

#### Get File by IPFS Hash

```
GET /hash/{ipfs_hash}
```

Looks up and returns a file by its IPFS content hash. Searches all objects in the bucket.

---

### POST Endpoints (JSON)

Send a JSON body with `Content-Type: application/json`. All commands use a `cmd` field.

#### Add a File

```json
POST /
Content-Type: application/json

{
  "cmd": "add",
  "key": "photo.jpg",
  "url": "https://example.com/photo.jpg",
  "scope": "images",
  "nanoid": "",
  "useVersioning": false,
  "metadata": { "author": "jan" },
  "customMetadata": { "category": "profile" },
  "customFilename": "avatar.jpg",
  "returnFile": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cmd` | string | yes | Must be `"add"` |
| `key` | string | no | Filename. Falls back to filename from `url` |
| `url` | string | yes* | Source URL to download from (*or pass file buffer via multipart) |
| `scope` | string | no | Namespace/folder path |
| `nanoid` | string | no | Set to `""` for deterministic mode. Omit for auto-generated |
| `useVersioning` | bool | no | Set to `false` to skip versioning |
| `optionStr` | string | no | Set to `"direct-upload"` for deterministic mode |
| `metadata` | object | no | Custom metadata stored on the R2 object |
| `customMetadata` | object | no | Additional custom metadata |
| `customFilename` | string | no | Override the stored filename |
| `returnFile` | bool | no | If `true`, returns the file body instead of JSON |

Response:
```json
{
  "success": true,
  "key": "images/photo.jpg",
  "scope": "images",
  "id": "images",
  "version": null,
  "origin": "https://example.com/photo.jpg",
  "latest": "https://f2.phage.directory/images/",
  "permalink": "https://f2.phage.directory/images/photo.jpg",
  "ipfsHash": "Qm...",
  "message": "Added images/photo.jpg successfully!",
  "metadata": {}
}
```

#### Get a File

```json
POST /
Content-Type: application/json

{
  "cmd": "get",
  "scope": "images",
  "key": "images/logo.png"
}
```

Returns the file body with appropriate headers.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cmd` | string | yes | Must be `"get"` |
| `key` | string | no | Direct R2 key path |
| `scope` | string | no | Scope to search in |
| `nanoid` | string | no | Nanoid within scope |
| `version` | string | no | Specific version (e.g. `"v2"`) |

#### List Files

```json
POST /
Content-Type: application/json

{
  "cmd": "list",
  "scope": "images",
  "limit": 50
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cmd` | string | yes | Must be `"list"` |
| `scope` | string | no | Scope/prefix to list. Empty string lists all |
| `nanoid` | string | no | Filter to specific nanoid |
| `limit` | number | no | Max results (default 100, max 1000) |
| `cursor` | string | no | Pagination cursor from a previous response |
| `mode` | string | no | Set to `"folders"` for folder-browsing mode |
| `folders` | bool | no | Set to `true` for folder-browsing mode (alias) |

Response (flat mode):
```json
{
  "success": true,
  "total": 50,
  "items": [...],
  "cursor": "eyJrZXkiOiJpbWFnZXMv...",
  "hasMore": true
}
```

**Paginated listing:** When `hasMore` is `true`, pass the returned `cursor` in your next request to get the next page:

```json
{
  "cmd": "list",
  "scope": "images",
  "limit": 50,
  "cursor": "eyJrZXkiOiJpbWFnZXMv..."
}
```

#### List Files (Folder Browsing Mode)

Browse the bucket like a filesystem — returns folders and files at the current level, similar to the Cloudflare R2 dashboard.

```json
POST /
Content-Type: application/json

{
  "cmd": "list",
  "scope": "images",
  "mode": "folders",
  "limit": 100
}
```

Response:
```json
{
  "success": true,
  "prefix": "images/",
  "folders": [
    { "prefix": "images/profiles/", "name": "profiles", "type": "folder" },
    { "prefix": "images/banners/", "name": "banners", "type": "folder" }
  ],
  "files": [
    { "key": "images/logo.png", "uploaded": "2024-01-15T10:30:00Z", "size": 20480, "type": "image/png" }
  ],
  "totalFolders": 2,
  "totalFiles": 1,
  "cursor": "...",
  "hasMore": false
}
```

To drill into a folder, set `scope` to the folder prefix:

```json
{ "cmd": "list", "scope": "images/profiles", "mode": "folders" }
```

#### Add JSON Data

Store arbitrary JSON data as a file in R2.

```json
POST /
Content-Type: application/json

{
  "cmd": "data",
  "data": { "name": "Jan", "role": "admin" },
  "key": "user-profile.json",
  "scope": "users",
  "nanoid": "",
  "useVersioning": false,
  "customMetadata": { "type": "profile" }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cmd` | string | yes | Must be `"data"` |
| `data` | any | yes | Data to store (objects are JSON-stringified) |
| `key` | string | no | Filename (defaults to `"data.json"`) |
| `scope` | string | no | Namespace/folder path |
| `nanoid` | string | no | Set to `""` for deterministic mode |
| `useVersioning` | bool | no | Set to `false` to skip versioning |
| `customMetadata` | object | no | Additional metadata |
| `cacheControl` | string | no | Cache header (default `"public, max-age=86400"`) |

Response:
```json
{
  "success": true,
  "key": "users/user-profile.json",
  "scope": "users",
  "size": 42,
  "metadata": { "contentType": "application/json" },
  "customMetadata": { "ipfsHash": "Qm...", "type": "profile" },
  "permalink": "https://f2.phage.directory/users/user-profile.json",
  "ipfsHash": "Qm...",
  "message": "Added data to users/user-profile.json successfully!"
}
```

#### Download as Zip

```json
POST /
Content-Type: application/json

{
  "cmd": "download",
  "scope": "images/profiles"
}
```

Returns a zip archive of all files under the scope.

#### Get File Details

```json
POST /
Content-Type: application/json

{
  "cmd": "details",
  "scope": "images/abc123/v0/photo.jpg",
  "key": "images/abc123/v0/photo.jpg"
}
```

Or look up by IPFS hash:

```json
{
  "cmd": "details",
  "hash": "Qma5zM3diAxAegs3FJWhU52k5h3sX7iB6hS7PRTzWVJZ9Q"
}
```

#### Get File by Hash

```json
POST /
Content-Type: application/json

{
  "cmd": "hash",
  "hash": "Qma5zM3diAxAegs3FJWhU52k5h3sX7iB6hS7PRTzWVJZ9Q"
}
```

Returns the file body matching the IPFS content hash.

#### Delete a File

Requires `authKey` matching the `DELETE_AUTH_KEY` environment variable.

**Single delete:**

```json
POST /
Content-Type: application/json

{
  "cmd": "delete",
  "authKey": "your-secret-key",
  "key": "images/logo.png"
}
```

Response:
```json
{
  "success": true,
  "key": "images/logo.png",
  "message": "Deleted images/logo.png successfully"
}
```

**Bulk delete (multiple keys):**

```json
{
  "cmd": "delete",
  "authKey": "your-secret-key",
  "keys": [
    "images/photo1.jpg",
    "images/photo2.jpg",
    "images/photo3.jpg"
  ]
}
```

Response:
```json
{
  "success": true,
  "deleted": 3,
  "notFound": 0,
  "errors": 0,
  "details": {
    "deleted": ["images/photo1.jpg", "images/photo2.jpg", "images/photo3.jpg"],
    "notFound": [],
    "errors": []
  },
  "message": "Deleted 3 file(s)"
}
```

**Delete by prefix (all files in a scope):**

```json
{
  "cmd": "delete",
  "authKey": "your-secret-key",
  "prefix": "images/old-campaign"
}
```

Deletes all objects whose key starts with the given prefix.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cmd` | string | yes | Must be `"delete"` |
| `authKey` | string | yes | Must match `DELETE_AUTH_KEY` env var |
| `key` | string | no* | Single key to delete |
| `keys` | string[] | no* | Array of keys to bulk delete |
| `prefix` | string | no* | Delete all objects with this prefix |

*One of `key`, `keys`, or `prefix` is required.

#### Rename / Move a File

Copies the file to a new key and deletes the original. Requires `authKey`.

```json
POST /
Content-Type: application/json

{
  "cmd": "rename",
  "authKey": "your-secret-key",
  "from": "images/old-name.png",
  "to": "images/new-name.png"
}
```

Response:
```json
{
  "success": true,
  "from": "images/old-name.png",
  "to": "images/new-name.png",
  "message": "Renamed images/old-name.png → images/new-name.png"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cmd` | string | yes | `"rename"` or `"move"` |
| `authKey` | string | yes | Must match `DELETE_AUTH_KEY` env var |
| `from` | string | yes | Current R2 key |
| `to` | string | yes | New R2 key |
| `overwrite` | bool | no | If `true`, overwrites if destination exists (default `false`) |

If the destination key already exists and `overwrite` is not set, the request returns a `409 Conflict`.

#### Get a Presigned Upload URL

Get a presigned S3-compatible URL for direct client-side uploads.

```json
POST /
Content-Type: application/json

{
  "cmd": "presign",
  "key": "photo.jpg",
  "scope": "images",
  "nanoid": "",
  "useVersioning": false,
  "expiresIn": 3600
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cmd` | string | yes | `"presign"` or `"presigned"` |
| `key` | string | yes | Filename |
| `scope` | string | no | Namespace/folder path |
| `nanoid` | string | no | Set to `""` for deterministic mode |
| `useVersioning` | bool | no | Set to `false` to skip versioning |
| `expiresIn` | number | no | URL expiry in seconds (default 3600) |

Response:
```json
{
  "key": "images/photo.jpg",
  "scope": "images",
  "id": "images",
  "permalink": "https://f2.phage.directory/images/photo.jpg",
  "message": "Signed S3 Upload URL: https://...",
  "url": "https://cceae190abc777c64fb8d7a98be577a3.r2.cloudflarestorage.com/..."
}
```

Then upload directly to the presigned URL:
```bash
curl -X PUT "{presigned_url}" \
  -H "Content-Type: image/jpeg" \
  -H "x-amz-meta-author: jan" \
  --data-binary @photo.jpg
```

---

### POST Endpoints (Multipart Form)

Upload files directly using `multipart/form-data`.

```bash
curl https://f2.phage.directory/ \
  -F "scope=images" \
  -F "files[]=@photo1.jpg" \
  -F "files[]=@photo2.jpg"
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `files[]` | file | yes | One or more files to upload |
| `scope` | string | no | Namespace/folder path |
| `nanoid` | string | no | Set to `""` for deterministic keys |
| `versioning` | string | no | Set to `"false"` to disable versioning |
| `filePath` | string | no | Preserves directory structure; auto-enables deterministic mode |

#### Upload preserving directory structure

The `filePath` field extracts the directory path and appends it to the scope, while also setting deterministic mode:

```bash
curl https://f2.phage.directory/ \
  -F "scope=myproject" \
  -F "filePath=assets/icons/logo.png" \
  -F "files[]=@logo.png"
```

R2 key: `myproject/assets/icons/logo.png`

#### Bulk upload a folder

```bash
find . -type f -print0 | xargs -0 -I {} \
  curl -F "files=@\"{}\"" \
  -F "scope=myproject/backup" \
  -F "filePath=\"{}\"" \
  https://f2.phage.directory/
```

---

## CRUD Pattern (Deterministic Mode)

For building CRUD systems on top of F2, use deterministic mode so keys are predictable and no in-memory key mapping is needed.

### Create / Update

```json
POST /
Content-Type: application/json

{
  "cmd": "add",
  "key": "logo.png",
  "scope": "images",
  "nanoid": "",
  "useVersioning": false,
  "url": "https://example.com/logo.png"
}
```

Or for JSON data:

```json
{
  "cmd": "data",
  "key": "config.json",
  "scope": "settings",
  "nanoid": "",
  "useVersioning": false,
  "data": { "theme": "dark", "lang": "en" }
}
```

### Read

```
GET /images/logo.png
GET /settings/config.json
```

Or via POST:

```json
{ "cmd": "get", "key": "images/logo.png" }
```

### List

```
GET /list/images
```

Or via POST:

```json
{ "cmd": "list", "scope": "images" }
```

### Delete

```json
{
  "cmd": "delete",
  "authKey": "your-secret-key",
  "key": "images/logo.png"
}
```

Bulk delete:

```json
{
  "cmd": "delete",
  "authKey": "your-secret-key",
  "keys": ["images/old1.png", "images/old2.png"]
}
```

Delete by prefix (all files in a folder):

```json
{
  "cmd": "delete",
  "authKey": "your-secret-key",
  "prefix": "images/temp"
}
```

### Rename / Move

```json
{
  "cmd": "rename",
  "authKey": "your-secret-key",
  "from": "images/draft.png",
  "to": "images/final.png"
}
```

---

## Authentication

Destructive operations (`delete`, `rename`, `move`) require an `authKey` field in the JSON body that matches the `DELETE_AUTH_KEY` environment variable.

**Setup:**

1. Set `DELETE_AUTH_KEY` in `wrangler.toml` under `[vars]` for development
2. For production, use Wrangler secrets:
   ```bash
   wrangler secret put DELETE_AUTH_KEY
   ```
3. Pass the key in every destructive request:
   ```json
   { "cmd": "delete", "authKey": "your-secret-key", "key": "..." }
   ```

Read-only operations (`get`, `list`, `details`, `hash`, `download`) and write operations (`add`, `data`, `presign`) do **not** require auth. F2 is designed as a public upload bucket — auth only gates destructive operations.

---

## Content Type Handling

F2 automatically detects content types from file extensions for the following formats:

**Text:** txt, html, css, csv, ics, md
**Documents:** json, js, xml, pdf, zip, doc/docx, xls/xlsx, ppt/pptx
**Images:** png, jpg, jpeg, gif, webp, svg, ico, bmp, tiff
**Audio:** mp3, wav, ogg, m4a
**Video:** mp4, webm, avi, mov, wmv
**Fonts:** ttf, otf, woff, woff2
**Other:** yaml/yml, epub, rtf

If the R2 object has a stored content type, that takes priority. The extension-based mapping is a fallback for objects stored without metadata.

---

## Streaming & Range Requests

F2 supports HTTP range requests for video and audio files. Clients (browsers, media players) can request byte ranges for seeking:

```
GET /videos/demo.mp4
Range: bytes=1000000-2000000
```

Response includes `Accept-Ranges: bytes`, `Content-Range`, and returns status `206 Partial Content`.

---

## IPFS Content Hashing

Every file uploaded through F2 gets an IPFS-compatible content hash stored in custom metadata. This hash can be used to:

- Deduplicate files across the bucket
- Verify file integrity
- Look up files by content hash via `/hash/{hash}` or `/details/{hash}`

---

## CORS

All responses include permissive CORS headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, x-custom-auth-key
```
