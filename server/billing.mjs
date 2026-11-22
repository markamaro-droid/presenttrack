import { createHmac, timingSafeEqual } from 'node:crypto';
import { ChatError, createAccess } from './ai-access.mjs';
import { billingConfig } from './billing-config.mjs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (code, message, status=503) => { throw new ChatError(status,code,message); };
export function entitlement(account, now=Date.now()) {
  if (Date.parse(account?.paid_until)>now) return 'active';
  if (Date.parse(account?.trial_ends_at)>now) return 'trial';
  return account?.trial_started_at || account?.paid_until ? 'expired' : 'not_started';
}
export function validBillingSignature(raw, header, secret, now=Date.now()) {
  if (!secret || typeof header!=='string') return false;
  const fields=Object.fromEntries(header.split(',').map(x=>x.trim().split('=')));
  if (!/^\d+$/.test(fields.t||'') || !/^[a-f0-9]{64}$/i.test(fields.te||'') || Math.abs(now/1000-Number(fields.t))>300) return false;
  const expected=createHmac('sha256',secret).update(fields.t+'.').update(raw).digest();
  return timingSafeEqual(expected,Buffer.from(fields.te,'hex'));
}
export function createBillingStore({env=process.env,fetchImpl=fetch}={}) {
  return async (route,method='GET',body) => {
    if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY) fail('billing_setup','Billing database setup is incomplete.');
    const r=await fetchImpl(env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/'+route,{method,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
    if(!r.ok) fail('billing_storage','Billing could not update. Check the test-billing migration and retry.');
    return r.status===204?null:r.json();
  };
}
export function createBillingService({env=process.env,fetchImpl=fetch,db=createBillingStore({env,fetchImpl}),authenticate=createAccess({env,fetchImpl,requiredKey:'SUPABASE_SERVICE_ROLE_KEY'}).authenticate}={}) {
  const settings=()=>billingConfig(env);
  function configured() {
    const config=settings();if(!config.enabled)fail('billing_disabled','Test billing has not been enabled.',409);
    if(!/^sk_test_\S+$/.test(env.PAYMONGO_TEST_SECRET_KEY||''))fail('billing_setup','Use a PayMongo test secret key. Live payments are disabled.');
    return config;
  }
  async function provider(path,method='GET',body) {
    configured();
    const r=await fetchImpl('https://api.paymongo.com/'+path,{method,headers:{Authorization:'Basic '+Buffer.from(env.PAYMONGO_TEST_SECRET_KEY+':').toString('base64'),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
    if(!r.ok)fail('payment_provider','PayMongo test checkout is unavailable. Check that GCash and Maya are enabled on your account.');
    return (await r.json()).data;
  }
  function checkoutURL(value) {
    let url;try{url=new URL(value)}catch{fail('invalid_checkout','Invalid checkout response.');}
    if(url.protocol!=='https:'||url.hostname!=='checkout.paymongo.com'||url.username||url.password)fail('invalid_checkout','Invalid checkout response.');
    return url.href;
  }
  async function confirm(sessionId) {
    if(!/^cs_[a-zA-Z0-9]+$/.test(sessionId||''))fail('invalid_session','Invalid checkout session.',400);
    const session=await provider('v1/checkout_sessions/'+sessionId),a=session?.attributes;
    if(session?.id!==sessionId||a?.livemode!==false||!uuid.test(a.reference_number||''))fail('invalid_payment','Payment could not be verified.',400);
    const order=(await db('billing_test_orders?id=eq.'+a.reference_number))[0];
    if(!order)fail('order_missing','Payment order not found.',404);
    const paid=(a.payments||[]).map(p=>p.attributes).find(p=>p?.status==='paid');
    if(!paid)return {pending:true};
    if(paid.livemode!==false||paid.amount!==order.amount||paid.currency!=='PHP'||!['gcash','paymaya'].includes(paid.source?.type)||paid.refunds?.length||paid.disputed)fail('invalid_payment','Payment amount or method did not match the order.',400);
    await db('rpc/complete_billing_test_order','POST',{p_order:order.id,p_session:sessionId,p_amount:paid.amount});
    return {received:true};
  }
  async function service(auth,body) {
    const {userId}=await authenticate(auth);const config=settings();
    if(!body||!['status','trial','checkout','refresh'].includes(body.action))fail('invalid_action','Choose a billing action.',400);
    if(!config.enabled||!config.users.includes(userId))return body.action==='status'?{enabled:false}:fail('billing_test_only','Billing is available only to designated test accounts.',403);
    if(body.action==='trial')await db('rpc/start_billing_test_trial','POST',{p_user:userId});
    if(body.action==='checkout') {
      configured();const plan=config.plans.find(p=>p.id===body.plan);
      if(!plan||!uuid.test(body.requestId||''))fail('invalid_plan','Choose a valid plan.',400);
      const previous=(await db('billing_test_orders?id=eq.'+body.requestId))[0];
      if(previous){
        if(previous.user_id!==userId||previous.plan!==plan.id)fail('order_conflict','Checkout request conflicts with another order.',409);
        if(previous.checkout_url&&previous.status==='pending')return {url:checkoutURL(previous.checkout_url)};
        fail('checkout_pending','This checkout is already processing. Refresh billing status; do not pay again.',409);
      }
      let origin;try{origin=new URL(env.BILLING_SITE_URL)}catch{fail('billing_setup','Set the billing site URL.');}
      if(origin.protocol!=='https:'||origin.username||origin.password)fail('billing_setup','Billing return URL must use HTTPS.');
      await db('billing_test_orders','POST',{id:body.requestId,user_id:userId,plan:plan.id,amount:plan.amount});
      const session=await provider('v2/checkout_sessions','POST',{data:{attributes:{line_items:[{name:'PresentTrack '+plan.label+' (TEST, manual renewal)',amount:plan.amount,currency:'PHP',quantity:1}],payment_method_types:['gcash','paymaya'],reference_number:body.requestId,success_url:origin.origin+'/?billing=return',cancel_url:origin.origin+'/?billing=cancel',send_email_receipt:false}}});
      if(session?.attributes?.livemode!==false||!/^cs_[a-zA-Z0-9]+$/.test(session.id||''))fail('invalid_checkout','Only test checkout sessions are accepted.');
      const url=checkoutURL(session.attributes.checkout_url);
      await db('billing_test_orders?id=eq.'+body.requestId,'PATCH',{session_id:session.id,checkout_url:url});
      return {url};
    }
    if(body.action==='refresh') {
      const pending=await db('billing_test_orders?user_id=eq.'+userId+'&status=eq.pending&session_id=not.is.null&order=created_at.desc&limit=3');
      for(const order of pending)await confirm(order.session_id);
    }
    const account=(await db('billing_test_accounts?user_id=eq.'+userId))[0]||null;
    const orders=await db('billing_test_orders?user_id=eq.'+userId+'&select=id,plan,amount,currency,status,paid_at,created_at&order=created_at.desc&limit=20');
    return {enabled:true,mode:'test',renewal:'manual',trialDays:7,plans:config.plans,account,status:entitlement(account),orders,enforced:env.BILLING_ENFORCE_TEST==='true'};
  }
  return {service,confirm};
}

// Opt-in gates apply only to the isolated test cohort. They never grant live access.
export async function requireBillingTestAccess(userId,{env=process.env,fetchImpl=fetch}={}) {
  if(env.BILLING_MODE!=='test'||env.BILLING_ENFORCE_TEST!=='true'||!billingConfig(env).users.includes(userId))return;
  const account=(await createBillingStore({env,fetchImpl})('billing_test_accounts?user_id=eq.'+userId))[0];
  if(!['active','trial'].includes(entitlement(account)))fail('subscription_required','Your trial or plan has ended. Open Billing to start a trial or renew your plan.',402);
}
