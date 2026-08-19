/**
 * Generate minimal PNG icons (two-arrow detour mark) without external deps.
 * Each pixel row is stored as RGBA bytes.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dir, "../public/icons");
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size) {
  const pixels = [];
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;

  for (let y = 0; y < size; y++) {
    pixels.push(0); // filter byte
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let r8 = 66, g8 = 133, b8 = 244, a8 = 0;

      // Outer circle background
      if (dist < r) {
        r8 = 66;
        g8 = 133;
        b8 = 244;
        a8 = 255;
      }

      // Arrow shaft 1 (top-left to bottom-right)
      const onShaft1 =
        Math.abs(dx - dy) < size * 0.08 &&
        dx > -size * 0.15 &&
        dx < size * 0.2 &&
        dy > -size * 0.2 &&
        dy < size * 0.15;
      // Arrow shaft 2 (offset)
      const onShaft2 =
        Math.abs(dx - dy + size * 0.12) < size * 0.08 &&
        dx > -size * 0.05 &&
        dx < size * 0.3 &&
        dy > -size * 0.3 &&
        dy < size * 0.05;

      if (onShaft1 || onShaft2) {
        r8 = 255;
        g8 = 255;
        b8 = 255;
        a8 = 255;
      }

      // Arrow heads
      const head1 =
        dx > size * 0.12 &&
        dx < size * 0.28 &&
        dy > -size * 0.05 &&
        dy < size * 0.22 &&
        dx + dy < size * 0.35;
      const head2 =
        dx > size * 0.18 &&
        dx < size * 0.34 &&
        dy > -size * 0.28 &&
        dy < size * 0.08 &&
        dx + dy < size * 0.42;

      if (head1 || head2) {
        r8 = 255;
        g8 = 255;
        b8 = 255;
        a8 = 255;
      }

      if (dist >= r && a8 === 0) {
        r8 = 0;
        g8 = 0;
        b8 = 0;
        a8 = 0;
      }

      pixels.push(r8, g8, b8, a8);
    }
  }

  const raw = Buffer.from(pixels);
  const compressed = deflateSync(raw);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  const png = makePng(size);
  writeFileSync(join(outDir, `icon-${size}.png`), png);
  console.log(`Wrote icon-${size}.png`);
}
