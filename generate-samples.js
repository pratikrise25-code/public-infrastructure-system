const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Lightweight pure Node.js PNG generator
function createPNG(width, height, colorGenerator) {
  const bytesPerPixel = 4; // RGBA
  const rowSize = width * bytesPerPixel;
  const rawData = Buffer.alloc((rowSize + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (rowSize + 1);
    rawData[rowOffset] = 0; // Filter type: None

    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = colorGenerator(x, y, width, height);
      const pixelOffset = rowOffset + 1 + (x * bytesPerPixel);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a !== undefined ? a : 255;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Header
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type);
    const body = Buffer.concat([typeBuf, data]);
    const crc = crc32(body);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', deflated);
  const iendChunk = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

const assetsDir = path.join(__dirname, 'public', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 1. Pothole (dark asphalt with irregular deep crater in center)
const potholePNG = createPNG(320, 240, (x, y, w, h) => {
  const dx = x - w / 2;
  const dy = y - h / 2;
  const dist = Math.sqrt(dx * dx + (dy * 1.4) * (dy * 1.4));
  const noise = (Math.sin(x * 0.1) + Math.cos(y * 0.1)) * 6;
  if (dist + noise < 55) {
    return [30, 26, 24, 255]; // Deep dark void
  } else if (dist + noise < 70) {
    return [70, 65, 60, 255]; // Fractured edge
  }
  return [100 + ((x + y) % 12), 102 + ((x + y) % 12), 105 + ((x + y) % 12), 255]; // Asphalt
});
fs.writeFileSync(path.join(assetsDir, 'sample-pothole.jpg'), potholePNG);

// 2. Road Crack (Asphalt with longitudinal zig-zag crack)
const crackPNG = createPNG(320, 240, (x, y, w, h) => {
  const crackCenter = (w / 2) + Math.sin(y * 0.08) * 25 + Math.cos(y * 0.2) * 10;
  if (Math.abs(x - crackCenter) < 4) {
    return [20, 20, 20, 255]; // Deep crack
  } else if (Math.abs(x - crackCenter) < 9) {
    return [60, 60, 65, 255]; // Fissure shadow
  }
  return [95 + ((x * 3) % 10), 98 + ((x * 3) % 10), 102 + ((x * 3) % 10), 255];
});
fs.writeFileSync(path.join(assetsDir, 'sample-roadcrack.jpg'), crackPNG);

// 3. Broken Streetlight (Dark night sky, leaning pole with broken lamp head)
const streetlightPNG = createPNG(320, 240, (x, y, w, h) => {
  if (x > 140 && x < 155 && y > 60) {
    return [160, 165, 175, 255]; // Metal pole
  }
  if (x > 120 && x < 175 && y > 40 && y <= 60) {
    return [220, 60, 40, 255]; // Broken fixture / warning marker
  }
  return [25, 30, 45, 255]; // Night sky
});
fs.writeFileSync(path.join(assetsDir, 'sample-streetlight.jpg'), streetlightPNG);

// 4. Water Leakage (Street pavement with blue/cyan water puddle & rippling)
const waterPNG = createPNG(320, 240, (x, y, w, h) => {
  const dx = x - w / 2;
  const dy = y - h / 2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 60) {
    return [40, 120 + Math.sin(dist * 0.3) * 30, 200, 255]; // Water puddle
  }
  return [110, 115, 120, 255];
});
fs.writeFileSync(path.join(assetsDir, 'sample-waterleak.jpg'), waterPNG);

// 5. Damaged Sidewalk (Concrete paving blocks with displaced/broken stone)
const sidewalkPNG = createPNG(320, 240, (x, y, w, h) => {
  const isBlockBorder = (x % 40 < 3) || (y % 40 < 3);
  if (x > 100 && x < 200 && y > 80 && y < 160) {
    return [140, 90, 60, 255]; // Dislodged sub-base
  }
  if (isBlockBorder) return [60, 60, 60, 255];
  return [180, 180, 175, 255]; // Concrete pavers
});
fs.writeFileSync(path.join(assetsDir, 'sample-sidewalk.jpg'), sidewalkPNG);

// 6. Garbage Accumulation (Sidewalk with colorful debris accumulation)
const garbagePNG = createPNG(320, 240, (x, y, w, h) => {
  if (y > 110 && x > 70 && x < 250) {
    const col = (x * 7 + y * 13) % 4;
    if (col === 0) return [200, 160, 40, 255];
    if (col === 1) return [60, 150, 80, 255];
    if (col === 2) return [190, 70, 70, 255];
    return [120, 120, 140, 255];
  }
  return [130, 135, 140, 255];
});
fs.writeFileSync(path.join(assetsDir, 'sample-garbage.jpg'), garbagePNG);

// 7. Damaged Public Building (Brick facade with cracked render)
const buildingPNG = createPNG(320, 240, (x, y, w, h) => {
  const isCrack = Math.abs(x - (160 + Math.sin(y * 0.1) * 20)) < 4 && y > 30 && y < 200;
  if (isCrack) return [40, 20, 15, 255];
  return [195, 105, 80, 255]; // Brick masonry
});
fs.writeFileSync(path.join(assetsDir, 'sample-building.jpg'), buildingPNG);

// 8. Clean / Repaired Surface (Smooth new black asphalt or repaired pavement)
const repairedPNG = createPNG(320, 240, (x, y, w, h) => {
  // Smooth fresh asphalt with white lane marking
  if (y > 110 && y < 125 && (x % 50 < 30)) {
    return [245, 245, 245, 255]; // Fresh white road marking
  }
  return [45 + (x % 5), 47 + (x % 5), 52 + (x % 5), 255]; // Smooth fresh asphalt
});
fs.writeFileSync(path.join(assetsDir, 'sample-repaired.jpg'), repairedPNG);

console.log('Sample test images created in public/assets successfully!');
