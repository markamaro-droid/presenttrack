import { createAdminService } from '../server/admin.mjs';
import { ChatError } from '../server/ai-access.mjs';
export function createAdminHandler(service = createAdminService()) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    try {
      if (req.method !== 'POST') return send(405, { message: 'Use POST.' });
      if (!/^Bearer \S+$/i.test(req.headers.authorization || '')) return send(401, { message: 'Please sign in.' });
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { message: 'Expected JSON.' });
      let body = req.body;
      if (body === undefined) {
        const chunks = []; let length = 0;
        for await (const chunk of req) { length += Buffer.byteLength(chunk); if (length > 4096) return send(413, { message: 'Request too large.' }); chunks.push(Buffer.from(chunk)); }
        body = Buffer.concat(chunks).toString();
      }
      if (Buffer.isBuffer(body)) body = body.toString();
      if (typeof body !== 'string') body = JSON.stringify(body);
      if (!body || Buffer.byteLength(body) > 4096) return send(413, { message: 'Request too large.' });
      let parsed; try { parsed = JSON.parse(body); } catch { return send(400, { message: 'Invalid JSON.' }); }
      send(200, await service(req.headers.authorization, parsed));
    } catch (error) { send(error instanceof ChatError ? error.status : 503, { message: error instanceof ChatError ? error.message : 'Account updates are unavailable. Please retry shortly.' }); }
  };
}
export default createAdminHandler();
