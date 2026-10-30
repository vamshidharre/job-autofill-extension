import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPng(width, height, r, g, b, a = 255) {
  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(6, 9); // color type (RGBA)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw Image Scanlines (1 filter byte 0 + RGBA pixels per row)
  const rowBytes = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowBytes);

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    rawData[rowStart] = 0; // Filter None

    for (let x = 0; x < width; x++) {
      const pixelStart = rowStart + 1 + x * 4;

      // Draw rounded blue badge with a lightning bolt
      const cx = width / 2;
      const cy = height / 2;
      const radius = width / 2 - 1;
      const dist = Math.hypot(x - cx, y - cy);

      if (dist <= radius) {
        // Draw blue gradient background #2563eb
        let pr = 37, pg = 99, pb = 235, pa = 255;

        // Inside center draw yellow/white lightning bolt #fef08a
        const nx = (x - cx) / radius;
        const ny = (y - cy) / radius;
        if (
          (ny > -0.7 && ny < -0.1 && nx > -0.3 + ny * 0.4 && nx < 0.3 + ny * 0.4) ||
          (ny >= -0.1 && ny < 0.7 && nx > -0.2 - ny * 0.3 && nx < 0.2 - ny * 0.3)
        ) {
          pr = 254; pg = 240; pb = 138;
        }

        rawData[pixelStart] = pr;
        rawData[pixelStart + 1] = pg;
        rawData[pixelStart + 2] = pb;
        rawData[pixelStart + 3] = pa;
      } else {
        // Transparent outside
        rawData[pixelStart] = 0;
        rawData[pixelStart + 1] = 0;
        rawData[pixelStart + 2] = 0;
        rawData[pixelStart + 3] = 0;
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);

  const checksum = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(checksum, 0);

  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc >>>= 1;
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const outDir = path.resolve(process.cwd(), 'assets/icons');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(path.join(outDir, 'icon16.png'), createPng(16, 16));
fs.writeFileSync(path.join(outDir, 'icon48.png'), createPng(48, 48));
fs.writeFileSync(path.join(outDir, 'icon128.png'), createPng(128, 128));

console.log('Generated extension icons in assets/icons/');
