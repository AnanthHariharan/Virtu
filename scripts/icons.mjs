/**
 * Generates the PWA icons with no dependencies at all.
 *
 * A PNG is a signature, an IHDR, one zlib-compressed IDAT of raw scanlines,
 * and an IEND. Node has zlib and a CRC is twelve lines, so shipping an image
 * pipeline to draw a red square with a V in it would be absurd.
 *
 * The mark: ink ground, accent bar down the left edge, and a V cut from the
 * paper colour — the same three colours the application uses and no others.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const INK    = [17, 17, 16];
const PAPER  = [251, 251, 249];
const ACCENT = [224, 36, 27];

/* ── PNG encoding ────────────────────────────────────────────────── */

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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** `px(x, y)` returns [r, g, b]. Written as RGB8, no alpha, no filtering. */
function png(size, px) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;                       // filter type 0: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = px(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 2;    // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── the mark ────────────────────────────────────────────────────── */

/**
 * The V, as a filled polygon rather than a stroked path — so the terminals
 * are cut square and the vertex comes to a point, which is what a grotesque
 * capital does and what a round-capped stroke cannot.
 *
 * @param size   pixel dimension
 * @param inset  fraction of the edge kept clear. Maskable icons must keep
 *               the mark inside the safe circle, which is the middle 80%.
 */
function mark(size, inset) {
  const pad = size * inset;
  const box = size - pad * 2;

  const w   = box * 0.145;              // stroke weight
  const top = pad + box * 0.20;
  const bot = pad + box * 0.80;
  const lx  = pad + box * 0.16;
  const rx  = pad + box * 0.84;
  const mx  = (lx + rx) / 2;

  // Outer left, inner left, inner vertex, inner right, outer right, vertex.
  const inner = bot - w * 1.55;
  const V = [
    [lx, top], [lx + w, top], [mx, inner], [rx - w, top], [rx, top], [mx, bot],
  ];

  const inside = (x, y) => {
    let hit = false;
    for (let i = 0, j = V.length - 1; i < V.length; j = i++) {
      const [xi, yi] = V[i], [xj, yj] = V[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };

  return (x, y) => {
    // the accent bar, flush to the left edge
    if (x < size * 0.085) return ACCENT;
    return inside(x + 0.5, y + 0.5) ? PAPER : INK;
  };
}

mkdirSync(OUT, { recursive: true });

const files = [
  ["icon-192.png",          192, 0.16],
  ["icon-512.png",          512, 0.16],
  ["apple-touch-icon.png",  180, 0.14],
  ["icon-maskable-512.png", 512, 0.24],   // extra inset for the safe circle
];

for (const [name, size, inset] of files) {
  writeFileSync(join(OUT, name), png(size, mark(size, inset)));
  console.log(`icons: ${name} ${size}×${size}`);
}
