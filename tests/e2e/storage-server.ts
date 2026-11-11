// A small stand-in for the Supabase Storage REST API, for end-to-end tests only. It implements
// just the calls the app makes, with the same paths, auth header and private-bucket rules.
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { E2E } from "./fixtures.ts";

type Bucket = {
  id: string;
  public: boolean;
  file_size_limit: number | null;
  allowed_mime_types: string[] | null;
};
const buckets = new Map<string, Bucket>();
const objects = new Map<string, { bytes: Buffer; contentType: string }>();
const uploadTokens = new Map<string, string>(); // token -> bucket/path
const readTokens = new Map<string, { key: string; expires: number }>();

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "*",
};

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const isBytes = Buffer.isBuffer(body);
  res.writeHead(status, {
    ...cors,
    "content-type": isBytes ? "application/octet-stream" : "application/json",
    ...headers,
  });
  res.end(isBytes ? body : JSON.stringify(body));
}
const notFound = (res: ServerResponse, what: string) =>
  send(res, 400, { statusCode: "404", error: "not_found", message: `${what} not found` });

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1/, ""));
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }

  // Test helper: list stored object keys
  if (path === "/__test/objects") return send(res, 200, [...objects.keys()]);
  const peek = path.match(/^\/__test\/object\/(.+)$/);
  if (peek) {
    const obj = objects.get(peek[1]!);
    return obj ? send(res, 200, obj.bytes) : notFound(res, "Object");
  }

  // Signed links work without the key (that is their point)
  let m = path.match(/^\/object\/upload\/sign\/([^/]+)\/(.+)$/);
  if (m && req.method === "PUT") {
    const key = `${m[1]}/${m[2]}`;
    if (uploadTokens.get(url.searchParams.get("token") ?? "") !== key)
      return send(res, 400, { statusCode: "403", error: "invalid token" });
    if (objects.has(key) && req.headers["x-upsert"] !== "true")
      return send(res, 400, { statusCode: "409", error: "Duplicate" });
    const bucket = buckets.get(m[1]!);
    const contentType = String(req.headers["content-type"] ?? "application/octet-stream");
    const bytes = await readBody(req);
    if (bucket?.allowed_mime_types && !bucket.allowed_mime_types.includes(contentType))
      return send(res, 400, { statusCode: "415", error: "invalid_mime_type" });
    if (bucket?.file_size_limit && bytes.length > bucket.file_size_limit)
      return send(res, 400, { statusCode: "413", error: "Payload too large" });
    objects.set(key, { bytes, contentType });
    uploadTokens.delete(url.searchParams.get("token")!);
    return send(res, 200, { Key: key });
  }
  m = path.match(/^\/object\/sign\/([^/]+)\/(.+)$/);
  if (m && req.method === "GET") {
    const t = readTokens.get(url.searchParams.get("token") ?? "");
    const key = `${m[1]}/${m[2]}`;
    if (!t || t.key !== key || t.expires < Date.now())
      return send(res, 400, { statusCode: "400", error: "InvalidJWT" });
    const obj = objects.get(key);
    if (!obj) return notFound(res, "Object");
    const download = url.searchParams.get("download");
    return send(res, 200, obj.bytes, {
      "content-type": obj.contentType,
      ...(download !== null ? { "content-disposition": `attachment; filename="${download}"` } : {}),
    });
  }

  if (req.headers.apikey !== E2E.storageKey)
    return send(res, 400, { statusCode: "403", error: "Unauthorized" });

  m = path.match(/^\/bucket\/([^/]+)$/);
  if (m && req.method === "GET") {
    const b = buckets.get(m[1]!);
    return b ? send(res, 200, b) : notFound(res, "Bucket");
  }
  if (path === "/bucket" && req.method === "POST") {
    const b = JSON.parse((await readBody(req)).toString()) as Bucket;
    buckets.set(b.id, {
      id: b.id,
      public: b.public,
      file_size_limit: b.file_size_limit,
      allowed_mime_types: b.allowed_mime_types,
    });
    return send(res, 200, { name: b.id });
  }
  if (m && req.method === "PUT") {
    const b = JSON.parse((await readBody(req)).toString()) as Bucket;
    buckets.set(m[1]!, { ...b, id: m[1]! });
    return send(res, 200, { message: "Successfully updated" });
  }
  m = path.match(/^\/object\/upload\/sign\/([^/]+)\/(.+)$/);
  if (m && req.method === "POST") {
    const token = randomUUID();
    uploadTokens.set(token, `${m[1]}/${m[2]}`);
    return send(res, 200, { url: `/object/upload/sign/${m[1]}/${m[2]}?token=${token}` });
  }
  // Many signed links at once (Supabase: POST /object/sign/{bucket} with paths)
  m = path.match(/^\/object\/sign\/([^/]+)$/);
  if (m && req.method === "POST") {
    const { expiresIn, paths } = JSON.parse((await readBody(req)).toString()) as {
      expiresIn: number;
      paths: string[];
    };
    return send(
      res,
      200,
      paths.map((p) => {
        const key = `${m![1]}/${p}`;
        if (!objects.has(key))
          return {
            path: p,
            signedURL: null,
            error: "Either the object does not exist or you do not have access to it",
          };
        const token = randomUUID();
        readTokens.set(token, { key, expires: Date.now() + expiresIn * 1000 });
        return { path: p, signedURL: `/object/sign/${m![1]}/${p}?token=${token}`, error: null };
      }),
    );
  }
  m = path.match(/^\/object\/sign\/([^/]+)\/(.+)$/);
  if (m && req.method === "POST") {
    const { expiresIn } = JSON.parse((await readBody(req)).toString()) as { expiresIn: number };
    const key = `${m[1]}/${m[2]}`;
    if (!objects.has(key)) return notFound(res, "Object");
    const token = randomUUID();
    readTokens.set(token, { key, expires: Date.now() + expiresIn * 1000 });
    return send(res, 200, { signedURL: `/object/sign/${m[1]}/${m[2]}?token=${token}` });
  }
  if (path === "/object/move" && req.method === "POST") {
    const { bucketId, sourceKey, destinationKey } = JSON.parse(
      (await readBody(req)).toString(),
    ) as { bucketId: string; sourceKey: string; destinationKey: string };
    const from = `${bucketId}/${sourceKey}`;
    const to = `${bucketId}/${destinationKey}`;
    const obj = objects.get(from);
    if (!obj) return notFound(res, "Object");
    if (objects.has(to)) return send(res, 400, { statusCode: "409", error: "Duplicate" });
    objects.set(to, obj);
    objects.delete(from);
    return send(res, 200, { message: "Successfully moved" });
  }
  m = path.match(/^\/object\/([^/]+)$/);
  if (m && req.method === "DELETE") {
    const { prefixes } = JSON.parse((await readBody(req)).toString()) as { prefixes: string[] };
    for (const p of prefixes) objects.delete(`${m[1]}/${p}`);
    return send(
      res,
      200,
      prefixes.map((name) => ({ name })),
    );
  }
  m = path.match(/^\/object\/([^/]+)\/(.+)$/);
  if (m && req.method === "GET") {
    if (buckets.get(m[1]!)?.public !== false) return notFound(res, "Bucket");
    const obj = objects.get(`${m[1]}/${m[2]}`);
    if (!obj) return notFound(res, "Object");
    return send(res, 200, obj.bytes, {
      "content-type": obj.contentType,
      "content-length": String(obj.bytes.length),
    });
  }
  return send(res, 404, { error: "unknown route" });
});

server.listen(E2E.storagePort, "127.0.0.1", () =>
  console.log(`e2e storage ready on 127.0.0.1:${E2E.storagePort}`),
);
const stop = () => server.close(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
