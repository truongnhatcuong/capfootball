import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const output = fileURLToPath(new URL("../public/icons/", import.meta.url));
mkdirSync(output, { recursive: true });
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const tag = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4); length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([tag, data]))); return Buffer.concat([length, tag, data, crc]); }
function polygon(x, y, points) { let inside = false; for (let i = 0, j = points.length - 1; i < points.length; j = i++) { const [xi, yi] = points[i], [xj, yj] = points[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } return inside; }
for (const [size, filename] of [[192, "icon-192.png"], [512, "icon-512.png"], [512, "maskable-512.png"]]) {
  const raw = Buffer.alloc(size * (1 + size * 3));
  const pentagon = Array.from({ length: 5 }, (_, i) => [0.5 + Math.cos(-Math.PI / 2 + i * Math.PI * 2 / 5) * 0.105, 0.5 + Math.sin(-Math.PI / 2 + i * Math.PI * 2 / 5) * 0.105]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, r = Math.hypot(u - .5, v - .5);
    let color = [20, 102, 70];
    if (r < .31) color = [236, 248, 218];
    if (r > .295 && r < .31 || polygon(u, v, pentagon)) color = [18, 67, 46];
    if (r < .295) { const seam = Math.abs(Math.sin((Math.atan2(v - .5, u - .5) + Math.PI / 2) * 2.5)); if (r > .10 && seam < .035 || r > .245 && seam < .5) color = [18, 67, 46]; }
    const offset = y * (1 + size * 3) + 1 + x * 3; for (let c = 0; c < 3; c++) raw[offset + c] = color[c];
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  writeFileSync(`${output}/${filename}`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
console.info("Generated 192px, 512px and maskable app icons.");
