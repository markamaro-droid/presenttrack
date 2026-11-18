import {timingSafeEqual,createHmac} from 'node:crypto';
import {readLimited} from './presentation-files.mjs';
export const DAILY_CREDITS=10,RESERVED_CREDITS=2;
export class ConversionError extends Error {
  constructor(code,status=503,retryAfter=0){super(code);this.code=code;this.status=status;this.retryAfter=retryAfter;}
}
export function validSignature(raw,signature,secret){
  if(!secret||!/^[a-f0-9]{64}$/i.test(signature||''))return false;
  const expected=createHmac('sha256',secret).update(raw).digest();return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
export function exportUrl(value){
  const url=new URL(value);
  // Only download provider-controlled export storage. Never follow redirects
  // or send the API key to an export URL, even when a webhook is authentic.
  if(url.protocol!=='https:'||url.username||url.password||url.port||!/^([a-z0-9-]+\.)*storage\.cloudconvert\.com$/i.test(url.hostname))throw new ConversionError('unsafe_export');
  return url.href;
}
export function createCloudConvertClient({env=process.env,fetchImpl=fetch}={}){
  const request=async(route,method='GET',body)=>{
    if(!env.CLOUDCONVERT_API_KEY)throw new ConversionError('cloudconvert_setup');
    const response=await fetchImpl('https://api.cloudconvert.com/v2'+route,{method,redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{Authorization:'Bearer '+env.CLOUDCONVERT_API_KEY,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok){
      // Bound error bodies as well as successful JSON responses.
      const bytes=await readLimited(new Response(response.body,{headers:response.headers}),2_000_000);
      let data={};try{data=JSON.parse(bytes.toString())}catch{}
      throw new ConversionError(String(data.code||'provider_error').slice(0,80),response.status,Math.min(86400,Math.max(0,Number(response.headers.get('retry-after'))||0)));
    }
    if(response.status===204)return null;
    const value=JSON.parse((await readLimited(response,2_000_000)).toString());return value.data;
  };
  return {
    balance:async()=>{const user=await request('/users/me');if(!Number.isInteger(user?.credits)||user.credits<0)throw new ConversionError('credit_status_unavailable');return user.credits;},
    create:(tag,url)=>request('/jobs','POST',{tag,tasks:{
      'import-original':{operation:'import/url',url,filename:'presentation.pptx'},
      'convert-pdf':{operation:'convert',input:'import-original',input_format:'pptx',output_format:'pdf',filename:'presentation.pdf',engine:'office',timeout:60},
      'export-pdf':{operation:'export/url',input:'convert-pdf',inline:false,archive_multiple_files:false}
    }}),
    get:id=>request('/jobs/'+id),
    find:tag=>request('/jobs?filter%5Btag%5D='+encodeURIComponent(tag)+'&include=tasks&per_page=10'),
    remove:id=>request('/jobs/'+id,'DELETE'),
    download:async(url,limit)=>readLimited(await fetchImpl(exportUrl(url),{redirect:'error',signal:AbortSignal.timeout(25000)}),limit)
  };
}
