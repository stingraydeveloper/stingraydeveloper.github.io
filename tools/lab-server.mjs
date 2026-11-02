// Local server for the look-development lab. Serves the site folder and accepts PNGs from the page
// so screenshots land on disk at a fixed size, whatever size the browser window happens to be.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, join, normalize, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shots = join(root, '..', 'review-shots-blob');
const press = join(root, '..', 'press', 'blob');
const port = Number(process.env.PORT || 4173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'POST' && (url.pathname === '/__shot' || url.pathname === '/__press')) {
      const name = basename(url.searchParams.get('name') || 'shot.png');
      const sub = (url.searchParams.get('dir') || '').replace(/[^a-z0-9/_-]/gi, '');
      const dir = url.pathname === '/__shot' ? (sub ? join(root, '..', sub) : shots) : press;
      const chunks = [];
      for await (const c of req) chunks.push(c);
      await mkdir(dir, { recursive: true });
      const path = join(dir, name);
      await writeFile(path, Buffer.concat(chunks));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ path }));
      return;
    }
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.endsWith('/')) path += 'index.html';
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch (e) {
    res.writeHead(404).end(String(e.message));
  }
}).listen(port, '127.0.0.1', () => console.log(`lab on http://localhost:${port}/lab.html`));
