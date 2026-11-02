// Writes the sheet's fine tooth as a small tiling PNG: grey with very low alpha, so it costs nothing
// to paint and hides any banding in the gold wash underneath. Same seed, same sheet.
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRng } from '../blob-geometry.js';

const here = dirname(fileURLToPath(import.meta.url));
const S = 256, r = makeRng(9001);
const fine = new Float32Array(S * S), soft = new Float32Array(S * S);
for (let i = 0; i < S * S; i++) fine[i] = r();
// a little longer grain, tiling, so it reads as tooth and not as digital noise
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  let t = 0;
  for (let k = -2; k <= 2; k++) t += fine[((y + (k >> 1) + S) % S) * S + ((x + k + S) % S)];
  soft[y * S + x] = t / 5;
}
const raw = Buffer.alloc((S * 2 + 1) * S);
for (let y = 0; y < S; y++) {
  const o = y * (S * 2 + 1);
  raw[o] = 0;
  for (let x = 0; x < S; x++) {
    const v = fine[y * S + x] * 0.75 + soft[y * S + x] * 0.25;
    const dark = v < 0.5;
    raw[o + 1 + x * 2] = dark ? 60 : 255;
    raw[o + 2 + x * 2] = Math.min(255, Math.round(Math.abs(v - 0.5) * 2 * (dark ? 13 : 22)));
  }
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
  return Buffer.concat([len, t, data, crc]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 4;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
writeFileSync(join(here, '..', 'assets', 'paper.png'), png);
console.log('paper.png', png.length);
