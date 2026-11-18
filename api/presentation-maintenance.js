import {timingSafeEqual} from 'node:crypto';
import {createPresentationConversion} from '../server/presentation-conversion.mjs';
export function createPresentationMaintenance({env=process.env,conversion=createPresentationConversion({env})}={}){
  return async(req,res)=>{
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    const send=(code,data)=>{res.statusCode=code;res.end(JSON.stringify(data))};
    if(req.method!=='GET')return send(405,{error:'method_not_allowed'});
    const actual=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+(env.CRON_SECRET||''));
    if(!env.CRON_SECRET||env.CRON_SECRET.length<32||actual.length!==expected.length||!timingSafeEqual(actual,expected))return send(401,{error:'unauthorized'});
    try{return send(200,await conversion.maintain())}catch{return send(503,{error:'maintenance_deferred'})}
  };
}
export default createPresentationMaintenance();
