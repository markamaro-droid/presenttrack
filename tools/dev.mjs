import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import chat from '../api/chat.js';
import voice from '../api/voice.js';
import coach from '../api/coach.js';
import speech from '../api/speech.js';
import practice from '../api/practice.js';
import admin from '../api/admin.js';
import presentations from '../api/presentations.js';
import cloudconvertWebhook from '../api/cloudconvert-webhook.js';
import presentationMaintenance from '../api/presentation-maintenance.js';
import { pdfAsset, pdfRoot } from './pdf-assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const shared = /^supabase\/functions\/_shared\/(metrics|quality|classify|feedback|criteria|baseline|report)\.js$/;
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/chat') return await chat(req, res);
    if (pathname === '/api/voice') return await voice(req, res);
    if (pathname === '/api/admin') return await admin(req, res);
    if (pathname === '/api/presentations') return await presentations(req, res);
    if (pathname === '/api/cloudconvert-webhook') return await cloudconvertWebhook(req,res);
    if (pathname === '/api/presentation-maintenance') return await presentationMaintenance(req,res);
    if (pathname === '/api/practice') return await practice(req, res);
    if (pathname === '/api/speech') return await speech(req, res);
    if (pathname === '/api/coach') return await coach(req, res);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const pdfMatch=pdfAsset.exec(relative);
    if(pdfMatch&&['GET','HEAD'].includes(req.method)){
      const bytes=await readFile(path.join(pdfRoot,pdfMatch[1]));
      res.writeHead(200,{'Content-Type':relative.endsWith('.mjs')?'text/javascript':relative.endsWith('.wasm')?'application/wasm':'application/octet-stream','Cache-Control':'public, max-age=3600'});
      return res.end(req.method==='HEAD'?undefined:bytes);
    }
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
