// Draws the app icon (green square, white leaf with map pin dot) as PNG without dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = px(x + 0.5, y + 0.5);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// leaf = intersection of two discs, tilted 45°
function inLeaf(u, v) {
  const r = 0.34, d = 0.2;
  const a = Math.SQRT1_2, x = (u - v) * a, y = (u + v) * a;
  return (x - d) ** 2 + y ** 2 < r * r && (x + d) ** 2 + y ** 2 < r * r;
}
function shade(x, y, s) {
  const u = x / s - 0.5, v = y / s - 0.5;
  const bg = [47, 93, 58, 255];
  let hit = 0;
  for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
    const uu = u + (dx - 0.5) / s, vv = v + (dy - 0.5) / s;
    if (inLeaf(uu + 0.03, vv - 0.03)) hit++;
  }
  // midrib
  const onRib = Math.abs((u + 0.03) + (v - 0.03)) < 0.012 && Math.hypot(u + 0.03, v - 0.03) < 0.3;
  // pin dot bottom-left
  const pin = Math.hypot(u + 0.2, v - 0.2) < 0.075;
  if (pin) return [224, 68, 122, 255];
  if (onRib && hit) return [47, 93, 58, 255];
  const t = hit / 4;
  return [Math.round(bg[0] + (255 - bg[0]) * t), Math.round(bg[1] + (255 - bg[1]) * t), Math.round(bg[2] + (244 - bg[2]) * t), 255];
}
for (const s of [192, 512]) writeFileSync(`public/icons/icon-${s}.png`, png(s, (x, y) => shade(x, y, s)));
writeFileSync('public/icons/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2f5d3a"/><path d="M14 50 C14 28 28 14 50 14 C50 36 36 50 14 50Z" fill="#fff"/><path d="M18 46 L44 20" stroke="#2f5d3a" stroke-width="2"/><circle cx="19" cy="45" r="5" fill="#e0447a"/></svg>`);
console.log('icons written');
