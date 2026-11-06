import { ChatError, LIMITS, createChatService } from '../server/chat.mjs';

export function createHandler(service = createChatService()) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    try {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(405, { error: 'method_not_allowed', message: 'Use POST to chat.' }); }
      if (!/^Bearer [^\s]+$/i.test(req.headers.authorization || '')) throw new ChatError(401, 'unauthorized', 'Please sign in again to chat.');
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new ChatError(415, 'invalid_content_type', 'Send JSON to chat.');
      if (Number(req.headers['content-length']) > LIMITS.body) throw new ChatError(413, 'too_large', 'Your message is too long.');
      let body = req.body;
      if (body === undefined) {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > LIMITS.body) throw new ChatError(413, 'too_large', 'Your message is too long.');
          chunks.push(Buffer.from(chunk));
        }
        body = Buffer.concat(chunks).toString('utf8');
      }
      if (Buffer.isBuffer(body)) body = body.toString('utf8');
      if (typeof body === 'string') {
        if (Buffer.byteLength(body) > LIMITS.body) throw new ChatError(413, 'too_large', 'Your message is too long.');
        try { body = JSON.parse(body); } catch { throw new ChatError(400, 'invalid_json', 'Send a valid JSON message.'); }
      } else if (Buffer.byteLength(JSON.stringify(body) || '') > LIMITS.body) throw new ChatError(413, 'too_large', 'Your message is too long.');
      send(200, await service(req.headers.authorization, body));
    } catch (error) {
      const safe = error instanceof ChatError;
      if (safe && error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      send(safe ? error.status : 503, { error: safe ? error.code : 'unavailable', message: safe ? error.message : 'Chat is temporarily unavailable. Please try again later.' });
    }
  };
}
export default createHandler();
