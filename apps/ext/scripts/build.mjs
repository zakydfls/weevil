import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, deflateSync } from 'node:zlib';
import * as esbuild from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, '');
const dist = join(root, 'dist');
const releases = join(root, 'releases');
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const isProduction = process.argv.includes('--production') || process.argv.includes('--prod');
const mode = isProduction ? 'production' : 'development';
const localApiBaseUrl = 'http://localhost:4000/v1';
const productionApiBaseUrl = 'https://api-weevil.centurycode.id/v1';
const localWebBaseUrl = 'http://localhost:3000';
const productionWebBaseUrl = 'https://weevil.centurycode.id';
const defaultApiBaseUrl = isProduction ? productionApiBaseUrl : localApiBaseUrl;
const defaultWebBaseUrl = isProduction ? productionWebBaseUrl : localWebBaseUrl;
const apiBaseUrl = normalizeApiBaseUrl(
  readArgValue('--api-base-url') ||
    process.env.WEEVIL_EXTENSION_API_BASE_URL ||
    process.env.EXTENSION_API_BASE_URL ||
    defaultApiBaseUrl
);
const webBaseUrl = normalizeUrl(
  readArgValue('--web-base-url') ||
    process.env.WEEVIL_EXTENSION_WEB_BASE_URL ||
    process.env.EXTENSION_WEB_BASE_URL ||
    defaultWebBaseUrl
);

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
      sourcemap: !isProduction,
      minify: isProduction,
      legalComments: 'none',
      define: {
        __WEEVIL_EXTENSION_BUILD_MODE__: JSON.stringify(mode),
        __WEEVIL_EXTENSION_DEFAULT_API_BASE_URL__: JSON.stringify(apiBaseUrl),
        __WEEVIL_EXTENSION_DEFAULT_WEB_BASE_URL__: JSON.stringify(webBaseUrl),
        __WEEVIL_EXTENSION_LOCAL_API_BASE_URL__: JSON.stringify(localApiBaseUrl),
        __WEEVIL_EXTENSION_PRODUCTION_API_BASE_URL__: JSON.stringify(productionApiBaseUrl),
        __WEEVIL_EXTENSION_LOCAL_WEB_BASE_URL__: JSON.stringify(localWebBaseUrl),
        __WEEVIL_EXTENSION_PRODUCTION_WEB_BASE_URL__: JSON.stringify(productionWebBaseUrl)
      }
    })
  )
);

await writeManifest();
await copyText('src/offscreen/offscreen.html', 'offscreen/offscreen.html');
await copyText('src/popup/popup.html', 'popup/popup.html');
await copyText('src/options/options.html', 'options/options.html');
await copyText('src/shared/styles.css', 'shared/styles.css');
await writeIcons();

if (isProduction) {
  const zipPath = join(releases, `weevil-extension-${packageJson.version}.zip`);
  await rm(zipPath, { force: true });
  await mkdir(releases, { recursive: true });
  await writeZip(dist, zipPath);
  console.log(`Built ${mode} extension for API ${apiBaseUrl}`);
  console.log(`Dashboard URL: ${webBaseUrl}`);
  console.log(`Chrome Web Store ZIP: ${zipPath}`);
} else {
  console.log(`Built ${mode} extension for API ${apiBaseUrl}`);
  console.log(`Dashboard URL: ${webBaseUrl}`);
}

function readArgValue(name) {
  const prefix = `${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : '';
}

function normalizeApiBaseUrl(value) {
  return normalizeUrl(value);
}

function normalizeUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Extension URL cannot be empty.');
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : isLocalUrl(trimmed)
      ? `http://${trimmed}`
      : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

function isLocalUrl(value) {
  const lowerValue = value.toLowerCase();
  return (
    lowerValue.startsWith('localhost') ||
    lowerValue.startsWith('127.0.0.1') ||
    lowerValue.startsWith('[::1]') ||
    lowerValue.startsWith('0.0.0.0')
  );
}

async function copyText(source, target) {
  const targetPath = join(dist, target);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, await readFile(join(root, source), 'utf8'));
}

async function writeManifest() {
  const manifest = JSON.parse(await readFile(join(root, 'manifest.template.json'), 'utf8'));
  manifest.version = packageJson.version;

  if (isProduction) {
    manifest.host_permissions = ['<all_urls>'];
  }

  await writeFile(join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
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

async function writeZip(sourceDir, targetPath) {
  const files = await listFiles(sourceDir);
  const localChunks = [];
  const centralChunks = [];
  const { date, time } = dosDateTime(new Date('2024-01-01T00:00:00Z'));
  let offset = 0;

  for (const filePath of files) {
    const name = filePath.slice(sourceDir.length + 1).replaceAll('\\', '/');
    const nameBuffer = Buffer.from(name);
    const data = await readFile(filePath);
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const flags = 0x0800;
    const method = 8;
    const madeBy = 20;
    const needed = 20;

    const localHeader = Buffer.concat([
      uint32le(0x04034b50),
      uint16le(needed),
      uint16le(flags),
      uint16le(method),
      uint16le(time),
      uint16le(date),
      uint32le(crc),
      uint32le(compressed.length),
      uint32le(data.length),
      uint16le(nameBuffer.length),
      uint16le(0),
      nameBuffer
    ]);

    localChunks.push(localHeader, compressed);

    centralChunks.push(
      Buffer.concat([
        uint32le(0x02014b50),
        uint16le(madeBy),
        uint16le(needed),
        uint16le(flags),
        uint16le(method),
        uint16le(time),
        uint16le(date),
        uint32le(crc),
        uint32le(compressed.length),
        uint32le(data.length),
        uint16le(nameBuffer.length),
        uint16le(0),
        uint16le(0),
        uint16le(0),
        uint16le(0),
        uint32le(0),
        uint32le(offset),
        nameBuffer
      ])
    );

    offset += localHeader.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const end = Buffer.concat([
    uint32le(0x06054b50),
    uint16le(0),
    uint16le(0),
    uint16le(files.length),
    uint16le(files.length),
    uint32le(centralDirectory.length),
    uint32le(offset),
    uint16le(0)
  ]);

  await writeFile(targetPath, Buffer.concat([...localChunks, centralDirectory, end]));
}

async function listFiles(dir) {
  const entries = await readdir(dir);
  const files = [];

  for (const entry of entries.sort()) {
    const path = join(dir, entry);
    const info = await stat(path);
    if (info.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else if (info.isFile()) {
      files.push(path);
    }
  }

  return files;
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

function uint16le(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value >>> 0);
  return buffer;
}

function uint32le(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function dosDateTime(value) {
  const year = Math.max(1980, value.getUTCFullYear());
  const month = value.getUTCMonth() + 1;
  const day = value.getUTCDate();
  const hours = value.getUTCHours();
  const minutes = value.getUTCMinutes();
  const seconds = Math.floor(value.getUTCSeconds() / 2);

  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds
  };
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
