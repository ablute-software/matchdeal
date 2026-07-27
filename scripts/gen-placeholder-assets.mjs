// One-off generator for placeholder app icons/splash — solid brand-color
// PNGs, no design tool or image library needed (none available in this
// environment). Replace these with real artwork before a real store
// submission; they only exist so `expo start` / `eas build` don't fail on
// missing files referenced by app.config.ts.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const MINT = [0x3f, 0xdb, 0xa0]; // colors.mintAccent
const DARK = [0x0e, 0x3a, 0x3f]; // colors.backgroundDark

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Solid color square, with an optional centered circle in a second color —
// simple, unambiguous "this is a placeholder" mark rather than a blank swatch.
function solidPng(size, bg, fg, circleRatio = 0) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const cx = size / 2, cy = size / 2, r = (size * circleRatio) / 2;
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const inCircle = circleRatio > 0 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      const [rr, gg, bb] = inCircle ? fg : bg;
      const px = rowStart + 1 + x * 4;
      raw[px] = rr; raw[px + 1] = gg; raw[px + 2] = bb; raw[px + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const idat = deflateSync(raw);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('assets/icon.png', solidPng(1024, DARK, MINT, 0.55));
writeFileSync('assets/adaptive-icon.png', solidPng(1024, DARK, MINT, 0.55));
writeFileSync('assets/splash.png', solidPng(1284, DARK, MINT, 0.25));
console.log('Wrote assets/icon.png, assets/adaptive-icon.png, assets/splash.png (placeholders — swap for real artwork before a store submission).');
