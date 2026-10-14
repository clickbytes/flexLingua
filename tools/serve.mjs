/** Tiny local development server (Node built-ins only, bound to loopback). */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  if (path.includes('\\') || path.includes('\0') || path.split('/').some(part => part.startsWith('.'))) {
    res.writeHead(403).end(); return;
  }
  const destination = resolve(root, `.${path === '/' ? '/index.html' : path}`);
  if (!destination.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const metadata = await stat(destination);
    if (!metadata.isFile()) { res.writeHead(404).end(); return; }
    const content = await readFile(destination);
    res.writeHead(200, {
      'Content-Type': contentTypes[extname(destination)] || 'application/octet-stream',
      'Content-Length': content.byteLength,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
  }
});
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`flexLingua running at ${url} (Ctrl+C to stop)`);
  if (process.argv.includes('--open') && process.platform === 'win32') {
    const child = spawn('cmd.exe', ['/d', '/s', '/c', `start "" "${url}"`], {
      detached: true, stdio: 'ignore', windowsHide: true
    });
    child.unref();
  }
});
