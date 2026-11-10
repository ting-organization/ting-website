#!/usr/bin/env node
// Serves dist/ on http://127.0.0.1:4173/ to look at a build. PORT picks
// another port, and BASE a folder to serve it under, as GitHub Pages serves
// a project: BASE=/ting-website/ npm run serve
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.env.PORT || 4173);
const BASE = ('/' + (process.env.BASE || '') + '/').replace(/\/+/g, '/');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

http.createServer((request, response) => {
  const url = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const send = (status, file) => {
    response.writeHead(status, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  };
  const missing = () => send(404, path.join(DIST, '404.html'));
  if (!url.startsWith(BASE)) return missing();
  let file = path.join(DIST, path.normalize(url.slice(BASE.length)));
  if (!file.startsWith(DIST)) return missing();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    // A folder without its trailing slash is redirected, as GitHub Pages does.
    if (!url.endsWith('/')) { response.writeHead(301, { location: url + '/' }); return response.end(); }
    file = path.join(file, 'index.html');
  }
  return fs.existsSync(file) ? send(200, file) : missing();
}).listen(PORT, '127.0.0.1', () => console.log(`Serving dist/ at http://127.0.0.1:${PORT}${BASE}`));
