// Serves the renderer exactly as the desktop app does (same files, same
// security headers) so UI tests run against real behaviour in Chromium.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const security = require('../../src/main/security.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/renderer');

export async function startServer() {
  const server = http.createServer(async (req, res) => {
    // Reuse the production path resolver by mapping the request onto app://.
    const appUrl = `${security.APP_ORIGIN}${new URL(req.url, 'http://localhost').pathname}`;
    const file = security.resolveAppPath(appUrl, ROOT);
    const headers = { ...security.SECURITY_HEADERS };
    if (!file || req.method !== 'GET') {
      res.writeHead(404, headers).end('Not found');
      return;
    }
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { ...headers, 'Content-Type': security.contentTypeFor(file) }).end(body);
    } catch {
      res.writeHead(404, headers).end('Not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}
