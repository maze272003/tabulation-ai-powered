import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const STUDIO_DIR = path.join(process.cwd(), ".graphify", "studio");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path: segments = [] } = await params;

  if (segments.some((segment) => segment === ".." || segment.includes("\\") || segment.includes("/"))) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const relative = segments.join(path.sep);
  const filePath = path.resolve(STUDIO_DIR, relative || "index.html");

  if (filePath !== STUDIO_DIR && !filePath.startsWith(STUDIO_DIR + path.sep)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let body: Buffer;
  try {
    body = await readFile(filePath);
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }

  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
