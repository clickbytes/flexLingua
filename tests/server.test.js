/** Check static HTTP behavior, including JSON MIME types and protection from path traversal. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn(process.execPath, [join(root, 'tools/serve.mjs')], {
      env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    let errors = '';
    server.stdout.on('data', chunk => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match) resolve({ server, url: match[0] });
    });
    server.stderr.on('data', chunk => { errors += chunk.toString(); });
    server.on('error', reject);
    server.on('exit', code => reject(new Error(`Server exited (${code}): ${errors}`)));
    setTimeout(() => reject(new Error('Local HTTP server did not start')), 4000).unref();
  });
}

test('Bundled local server serves HTML, JS, JSON and safe HTTP errors', async () => {
  const {server,url} = await startServer();
  try {
    for (const [path, expectedType] of [
      ['', 'text/html'], ['js/main.js', 'text/javascript'], ['data/concepts.json', 'application/json'],
      ['data/grammar/pl.json', 'application/json']
    ]) {
      const response = await fetch(url + path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), new RegExp(expectedType), path);
      assert.ok((await response.text()).length > 100);
    }
    assert.equal((await fetch(url + 'does-not-exist.js')).status, 404);
    assert.equal((await fetch(url + '.git/config')).status, 403);
    assert.equal((await fetch(url + '%2eenv')).status, 403);
    assert.equal((await fetch(url + 'index.html', { method: 'POST' })).status, 405);
    assert.equal((await fetch(url + 'index.html', { method: 'HEAD' })).status, 200);
  } finally {
    server.kill();
    await once(server, 'exit').catch(() => {});
  }
});
