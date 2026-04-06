/**
 * Generates icon files from public/favicon.svg for electron-builder.
 *
 * Usage:  node scripts/generate-icons.js
 * Requires: npm install --save-dev sharp
 *
 * Produces:
 *   build/icon.png     — 1024x1024
 *   build/icon-512.png — 512x512  (Linux)
 *   build/icon-256.png — 256x256  (Windows BrowserWindow)
 *   build/icon.ico     — Multi-size ICO (Windows exe resource)
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SVG = path.join(ROOT, 'public', 'favicon.svg');
const OUT = path.join(ROOT, 'build');

const SIZES = [
  { name: 'icon.png', size: 1024 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-256.png', size: 256 },
];

// ICO sizes to embed (standard Windows icon sizes)
const ICO_SIZES = [256, 128, 64, 48, 32, 16];

/**
 * Build a .ico file from multiple PNG buffers.
 * ICO format: header (6 bytes) + directory entries (16 bytes each) + PNG data
 */
function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;

  // Calculate offsets
  const offsets = [];
  let offset = headerSize;
  for (const buf of pngBuffers) {
    offsets.push(offset);
    offset += buf.length;
  }

  const ico = Buffer.alloc(offset);

  // ICO header: reserved(2) + type=1(2) + count(2)
  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(count, 4);

  // Directory entries
  for (let i = 0; i < count; i++) {
    const size = ICO_SIZES[i];
    const pos = 6 + i * 16;
    ico.writeUInt8(size < 256 ? size : 0, pos);      // width (0 = 256)
    ico.writeUInt8(size < 256 ? size : 0, pos + 1);  // height
    ico.writeUInt8(0, pos + 2);                        // color palette
    ico.writeUInt8(0, pos + 3);                        // reserved
    ico.writeUInt16LE(1, pos + 4);                     // color planes
    ico.writeUInt16LE(32, pos + 6);                    // bits per pixel
    ico.writeUInt32LE(pngBuffers[i].length, pos + 8);  // data size
    ico.writeUInt32LE(offsets[i], pos + 12);            // data offset
  }

  // PNG data
  for (let i = 0; i < count; i++) {
    pngBuffers[i].copy(ico, offsets[i]);
  }

  return ico;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const svg = fs.readFileSync(SVG);

  // Generate PNGs
  for (const { name, size } of SIZES) {
    const out = path.join(OUT, name);
    await sharp(svg).resize(size, size).png().toFile(out);
    console.log(`  ✓ ${name} (${size}x${size})`);
  }

  // Generate ICO with multiple sizes
  const pngBuffers = [];
  for (const size of ICO_SIZES) {
    const buf = await sharp(svg).resize(size, size).png().toBuffer();
    pngBuffers.push(buf);
  }
  const ico = buildIco(pngBuffers);
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico);
  console.log(`  ✓ icon.ico (${ICO_SIZES.join(', ')})`);

  console.log('\nIcons generated in build/');
}

main().catch((err) => {
  console.error('Icon generation failed:', err.message);
  process.exitCode = 1;
});
