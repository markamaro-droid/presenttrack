import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import chat from '../api/chat.js';
import voice from '../api/voice.js';
import coach from '../api/coach.js';
import practice from '../api/practice.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const shared = /^supabase\/functions\/_shared\/(metrics|quality|classify|feedback|criteria|baseline)\.js$/;
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/chat') return await chat(req, res);
    if (pathname === '/api/voice') return await voice(req, res);
    if (pathname === '/api/practice') return await practice(req, res);
    if (pathname === '/api/coach') return await coach(req, res);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const target = path.resolve(root, relative);
    if (!['GET', 'HEAD'].includes(req.method) || !target.startsWith(root) || relative.includes('..') || relative.includes('\\') ||
        !(relative === 'index.html' || /^(css|js|assets)\/[\w./-]+$/.test(relative) || shared.test(relative))) {
      res.writeHead(404); return res.end('Not found');
    }
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.PORT) || 3000, '127.0.0.1', () => console.log('PresentTrack: http://localhost:' + (process.env.PORT || 3000)));
