import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import * as esbuild from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, '');
const dist = join(root, 'dist');

const entryPoints = [
  ['src/background/service-worker.ts', 'background/service-worker.js'],
  ['src/content/content-script.ts', 'content/content-script.js'],
  ['src/page/page-bridge.ts', 'page/page-bridge.js'],
  ['src/offscreen/offscreen.ts', 'offscreen/offscreen.js'],
  ['src/popup/popup.ts', 'popup/popup.js'],
  ['src/options/options.ts', 'options/options.js']
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await Promise.all(
  entryPoints.map(([entryPoint, outfile]) =>
    esbuild.build({
      entryPoints: [join(root, entryPoint)],
      outfile: join(dist, outfile),
      bundle: true,
      format: 'esm',
      target: 'chrome116',
      sourcemap: true,
      minify: false,
      legalComments: 'none'
    })
  )
);

await copyText('manifest.template.json', 'manifest.json');
await copyText('src/offscreen/offscreen.html', 'offscreen/offscreen.html');
await copyText('src/popup/popup.html', 'popup/popup.html');
await copyText('src/options/options.html', 'options/options.html');
await copyText('src/shared/styles.css', 'shared/styles.css');
await writeIcons();

async function copyText(source, target) {
  const targetPath = join(dist, target);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, await readFile(join(root, source), 'utf8'));
}

async function writeIcons() {
  const sizes = [16, 32, 48, 128];
  await mkdir(join(dist, 'icons'), { recursive: true });
  await Promise.all(
    sizes.map((size) => writeFile(join(dist, 'icons', `icon-${size}.png`), createPngIcon(size)))
  );
}

function createPngIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = Math.round(size * 0.22);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const inside = isInsideRoundedRect(x, y, size, radius);
      rgba[index] = inside ? 223 : 0;
      rgba[index + 1] = inside ? 248 : 0;
      rgba[index + 2] = inside ? 239 : 0;
      rgba[index + 3] = inside ? 255 : 0;

      if (inside && isInsideWStroke(x, y, size)) {
        rgba[index] = 15;
        rgba[index + 1] = 118;
        rgba[index + 2] = 110;
      }
    }
  }

  return encodePng(size, size, rgba);
}

function isInsideRoundedRect(x, y, size, radius) {
  const max = size - 1;
  const cornerX = x < radius ? radius : x > max - radius ? max - radius : x;
  const cornerY = y < radius ? radius : y > max - radius ? max - radius : y;
  return (x - cornerX) ** 2 + (y - cornerY) ** 2 <= radius ** 2;
}

function isInsideWStroke(x, y, size) {
  const nx = x / size;
  const ny = y / size;
  const band = 0.075;
  const left = Math.abs(nx - (0.25 + ny * 0.12)) < band && ny > 0.24 && ny < 0.76;
  const midLeft = Math.abs(nx - (0.43 - ny * 0.12)) < band && ny > 0.38 && ny < 0.78;
  const midRight = Math.abs(nx - (0.56 + ny * 0.12)) < band && ny > 0.38 && ny < 0.78;
  const right = Math.abs(nx - (0.75 - ny * 0.12)) < band && ny > 0.24 && ny < 0.76;
  return left || midLeft || midRight || right;
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', Buffer.concat([uint32(width), uint32(height), Buffer.from([8, 6, 0, 0, 0])])),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  return Buffer.concat([uint32(data.length), typeBuffer, data, uint32(crc32(Buffer.concat([typeBuffer, data])))]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
