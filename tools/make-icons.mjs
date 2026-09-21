/**
 * Generate the PWA's PNG icons without an image library.
 *
 * Android's install prompt wants PNG at 192 and 512; PIL is not available on
 * this machine and there is no build step (§8.6), so this rasterises a few
 * simple shapes into an RGBA buffer and writes the PNG by hand: zlib from
 * node:zlib, CRC32 in twenty lines, three chunks.
 *
 *   node tools/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [0x1a, 0x1a, 0x1a, 0xff];
const FG = [0xfb, 0xfb, 0xfa, 0xff];

/* ---------- PNG ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;          // bit depth
  ihdr[9] = 6;          // colour type: RGBA
  // 10–12: compression, filter, interlace — all 0

  // Each scanline is prefixed with its filter byte (0 = none).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- rasterise ---------- */

function icon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = c[3];
  };

  // Rounded background. A maskable icon is cropped to a circle inscribed in the
  // middle 80%, so the glyph stays well inside that.
  const r = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.min(x, size - 1 - x), dy = Math.min(y, size - 1 - y);
      const inCorner = dx < r && dy < r;
      const outside = inCorner && Math.hypot(r - dx, r - dy) > r;
      put(x, y, outside ? [0, 0, 0, 0] : BG);
    }
  }

  // A baseline and an upright — the same mark as icon.svg.
  const w = Math.round(size * 0.062);
  const bar = (x0, y0, x1, y1) => {
    for (let t = 0; t <= 1; t += 1 / (size * 2)) {
      const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      for (let dy = -w / 2; dy <= w / 2; dy++) {
        for (let dx = -w / 2; dx <= w / 2; dx++) {
          if (Math.hypot(dx, dy) <= w / 2) put(Math.round(cx + dx), Math.round(cy + dy), FG);
        }
      }
    }
  };
  bar(size * 0.25, size * 0.67, size * 0.75, size * 0.67);   // baseline
  bar(size * 0.50, size * 0.33, size * 0.50, size * 0.67);   // upright

  return png(size, size, buf);
}

for (const size of [192, 512]) {
  const file = `icon-${size}.png`;
  writeFileSync(file, icon(size));
  console.log(`wrote ${file}`);
}
