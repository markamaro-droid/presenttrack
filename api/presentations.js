import { createPresentationsService } from '../server/presentations.mjs';
import { ChatError } from '../server/ai-access.mjs';
export function createPresentationsHandler(service=createPresentationsService()) {
  return async(req,res)=>{
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','private, no-store');
    const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
    try {
      if(req.method!=='POST')return send(405,{message:'Use POST.'});
      if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(415,{message:'Expected JSON.'});
      let body=req.body;
      if(body===undefined){const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>4096)return send(413,{message:'Request too large.'});chunks.push(Buffer.from(chunk));}body=Buffer.concat(chunks);}
      if(Buffer.isBuffer(body))body=body.toString();
      if(typeof body!=='string')body=JSON.stringify(body);
      if(!body||Buffer.byteLength(body)>4096)return send(413,{message:'Request too large.'});
      let parsed;try{parsed=JSON.parse(body);}catch{return send(400,{message:'Invalid JSON.'});}
      send(200,await service(req.headers.authorization,parsed));
    }catch(error){send(error instanceof ChatError?error.status:503,{error:error instanceof ChatError?error.code:'presentation_unavailable',message:error instanceof ChatError?error.message:'Presentation service is unavailable. Please retry.'});}
  };
}
export default createPresentationsHandler();
