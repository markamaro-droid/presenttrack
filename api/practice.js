import { ChatError } from '../server/ai-access.mjs';
import { createPracticeService } from '../server/practice.mjs';
export function createPracticeHandler(service = createPracticeService()) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    try {
      if (req.method !== 'POST') return send(405, { message: 'Use POST.' });
      if (!/^Bearer \S+$/i.test(req.headers.authorization || '')) return send(401, { message: 'Please sign in.' });
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { message: 'Expected JSON.' });
      if (Number(req.headers['content-length']) > 4100000) return send(413, { message: 'Use a recording under 3 MB.' });
      let body = req.body;
      if (body === undefined) {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 4100000) return send(413, { message: 'Recording too large.' }); chunks.push(Buffer.from(chunk)); }
        body = Buffer.concat(chunks).toString();
      }
      if (Buffer.isBuffer(body)) body = body.toString();
      if (typeof body !== 'string') body = JSON.stringify(body);
      if (!body || Buffer.byteLength(body) > 4100000) return send(413, { message: 'Recording too large.' });
      let parsed; try { parsed = JSON.parse(body); } catch { return send(400, { message: 'Invalid request.' }); }
      send(200, await service(req.headers.authorization, parsed));
    } catch (e) {
      if (e instanceof ChatError && e.retryAfter) res.setHeader('Retry-After', String(e.retryAfter));
      send(e instanceof ChatError ? e.status : 503, { error: e instanceof ChatError ? e.code : 'analysis_failed', message: e instanceof ChatError ? e.message : 'Analysis could not finish. Please retry later.' });
    }
  };
}
export default createPracticeHandler();
