import fs from "fs";
import path from "path";
import { type NextRequest, NextResponse } from "next/server";
import { getBackgroundImagesDir } from "@/lib/background-images";

const MIME: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

type RouteContext = {
  params: Promise<{ file: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { file: rawFile } = await context.params;
  const file = decodeURIComponent(rawFile);

  if (!file || file.includes("..") || file.includes("/") || file.includes("\\")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const dir = getBackgroundImagesDir();
  if (!dir) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = path.join(dir, file);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(file).toLowerCase();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
