import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(request: NextRequest) {
  const requestedPath = request.nextUrl.searchParams.get("path");
  if (!requestedPath || requestedPath.includes("\0")) {
    return new Response("Missing screenshot path.", { status: 400 });
  }

  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const artifactsRoot = path.resolve(workspaceRoot, "artifacts");
  const resolvedPath = path.resolve(workspaceRoot, requestedPath);
  if (!isWithinDirectory(resolvedPath, artifactsRoot)) {
    return new Response("Screenshot path is outside the artifact directory.", { status: 403 });
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) {
    return new Response("Unsupported screenshot type.", { status: 415 });
  }

  const fileStat = await stat(resolvedPath).catch(() => null);
  if (!fileStat?.isFile()) {
    return new Response("Screenshot not found.", { status: 404 });
  }

  const body = await readFile(resolvedPath);
  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Length": String(body.byteLength),
      "Content-Type": contentType,
    },
  });
}

function isWithinDirectory(filePath: string, directoryPath: string) {
  const relativePath = path.relative(directoryPath, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function findWorkspaceRoot(startDir: string) {
  let current = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir);
    }
    current = parent;
  }
}
