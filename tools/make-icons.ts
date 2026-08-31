// Write the PWA icons as PNGs with no dependencies: a Kingdom soldier on the dark background.
// Usage: node tools/make-icons.ts

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PAL, TYPES } from '../src/data/units.ts';

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function png(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1); }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function icon(size: number, maskable: boolean): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const bg = hex('#0a0b10');
  for (let i = 0; i < size * size; i++) { px[i * 4] = bg[0]; px[i * 4 + 1] = bg[1]; px[i * 4 + 2] = bg[2]; px[i * 4 + 3] = 255; }
  const spr = TYPES.kni.sprite, n = spr.length;
  const pad = maskable ? 0.2 : 0.1;
  const sc = Math.floor((size * (1 - pad * 2)) / n);
  const ox = Math.floor((size - n * sc) / 2), oy = Math.floor((size - n * sc) / 2);
  for (let r = 0; r < n; r++)
    for (let q = 0; q < n; q++) {
      const ch = spr[r][q];
      if (ch === '.') continue;
      const col = hex(ch === 'T' ? '#3fa7ff' : PAL[ch]);
      for (let y = 0; y < sc; y++)
        for (let x = 0; x < sc; x++) {
          const i = ((oy + r * sc + y) * size + ox + q * sc + x) * 4;
          px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
        }
    }
  return png(size, size, px);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', icon(192, false));
writeFileSync('public/icons/icon-512.png', icon(512, false));
writeFileSync('public/icons/maskable-512.png', icon(512, true));
writeFileSync('public/icons/apple-touch-icon.png', icon(180, false));
console.log('wrote public/icons');
