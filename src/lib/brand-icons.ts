import sharp from "sharp";

export function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

export async function renderSquarePng(sourcePath: string, size: number): Promise<Buffer> {
  return sharp(sourcePath, { animated: false })
    .ensureAlpha()
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

export async function renderFaviconIco(sourcePath: string): Promise<Buffer> {
  const sizes = [16, 32, 48];
  const pngBuffers = await Promise.all(sizes.map((size) => renderSquarePng(sourcePath, size)));
  const headerSize = 6 + pngBuffers.length * 16;
  let offset = headerSize;
  const dir = Buffer.alloc(pngBuffers.length * 16);

  pngBuffers.forEach((buffer, index) => {
    const size = sizes[index];
    const entryOffset = index * 16;
    dir.writeUInt8(size, entryOffset);
    dir.writeUInt8(size, entryOffset + 1);
    dir.writeUInt8(0, entryOffset + 2);
    dir.writeUInt8(0, entryOffset + 3);
    dir.writeUInt16LE(1, entryOffset + 4);
    dir.writeUInt16LE(32, entryOffset + 6);
    dir.writeUInt32LE(buffer.length, entryOffset + 8);
    dir.writeUInt32LE(offset, entryOffset + 12);
    offset += buffer.length;
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngBuffers.length, 4);

  return Buffer.concat([header, dir, ...pngBuffers]);
}
