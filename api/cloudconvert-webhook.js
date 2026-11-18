import {validSignature} from '../server/cloudconvert-client.mjs';
import {createPresentationConversion} from '../server/presentation-conversion.mjs';
// Also supports a future Next.js Pages Router wrapper; native Node reads the stream.
export const config={api:{bodyParser:false}};
export function createCloudConvertWebhook({env=process.env,conversion=createPresentationConversion({env})}={}){
  return async(req,res)=>{
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    const send=(code,value)=>{res.statusCode=code;res.end(JSON.stringify(value))};
    if(req.method!=='POST')return send(405,{error:'method_not_allowed'});
    if(!env.CLOUDCONVERT_WEBHOOK_SECRET)return send(503,{error:'webhook_setup_required'});
    try{
      // Never JSON.stringify a parsed body for signature verification.
      const chunks=[];let size=0;
      for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>256000)return send(413,{error:'payload_too_large'});chunks.push(Buffer.from(chunk));}
      const raw=Buffer.concat(chunks);
      if(!validSignature(raw,req.headers['cloudconvert-signature'],env.CLOUDCONVERT_WEBHOOK_SECRET))return send(401,{error:'invalid_signature'});
      let payload;try{payload=JSON.parse(raw.toString())}catch{return send(400,{error:'invalid_json'})}
      if(!['job.finished','job.failed'].includes(payload.event))return send(200,{ignored:true});
      const result=await conversion.webhook(payload.job);
      return send(result?.busy||result?.waiting?503:200,{received:true});
    }catch{return send(503,{error:'conversion_update_deferred'})}
  };
}
export default createCloudConvertWebhook();
