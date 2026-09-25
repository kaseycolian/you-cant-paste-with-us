// A small static file server for running the app locally. No dependencies.
// Usage: npm start (or node serve.mjs). Set PORT to change the port.
// It only listens on 127.0.0.1 and only answers requests addressed to localhost.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

/** Maps a URL path to a file inside ROOT, or null if it points anywhere else. */
function toFilePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  // No dotfiles or dot-folders (.git and friends).
  if (decoded.split(/[\\/]/).some((part) => part.startsWith('.') && part !== '')) return null;
  const full = resolve(ROOT, `.${sep}${decoded}`);
  return full === ROOT || full.startsWith(ROOT + sep) ? full : null;
}

async function findFile(urlPath) {
  const path = toFilePath(urlPath);
  if (!path) return null;
  const info = await stat(path).catch(() => null);
  if (info?.isFile()) return path;
  if (info?.isDirectory()) {
    const index = resolve(path, 'index.html');
    const indexInfo = await stat(index).catch(() => null);
    if (indexInfo?.isFile()) return index;
  }
  return null;
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "frame-ancestors 'none'",
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  if (!HOSTS.has(req.headers.host ?? '')) return send(res, 421, 'Misdirected request');
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  const file = await findFile(pathname);
  if (!file) return send(res, 404, 'Not found');

  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const body = await readFile(file);
  send(res, 200, req.method === 'HEAD' ? undefined : body, type);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Serving on http://localhost:${PORT}/  (Ctrl+C to stop)`);
});
