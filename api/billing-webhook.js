import {createBillingService,validBillingSignature} from '../server/billing.mjs';
export const config={api:{bodyParser:false}};
export function createBillingWebhook({env=process.env,confirm=id=>createBillingService({env}).confirm(id)}={}) {
 return async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const send=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body))};
  if(req.method!=='POST')return send(405,{error:'method_not_allowed'});
  if(env.BILLING_MODE!=='test'||!env.PAYMONGO_TEST_WEBHOOK_SECRET)return send(503,{error:'billing_disabled'});
  try{
   const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>256000)return send(413,{error:'too_large'});chunks.push(Buffer.from(chunk))}
   const raw=Buffer.concat(chunks);
   if(!validBillingSignature(raw,req.headers['paymongo-signature'],env.PAYMONGO_TEST_WEBHOOK_SECRET))return send(401,{error:'invalid_signature'});
   const event=JSON.parse(raw.toString()).data?.attributes;
   if(event?.livemode!==false)return send(400,{error:'test_events_only'});
   if(event.type!=='checkout_session.payment.paid')return send(200,{ignored:true});
   const result=await confirm(event.data?.id);
   return send(result.pending?503:200,result);
  }catch{return send(503,{error:'payment_update_deferred'})}
 };
}
export default createBillingWebhook();
