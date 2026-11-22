import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {billingConfig} from '../server/billing-config.mjs';
import {createBillingService,validBillingSignature,entitlement,requireBillingTestAccess} from '../server/billing.mjs';
const userId='10000000-0000-4000-8000-000000000001',orderId='10000000-0000-4000-8000-000000000002';
const env={BILLING_MODE:'test',BILLING_TEST_USERS:userId,PAYMONGO_TEST_SECRET_KEY:'sk_test_fake',BILLING_SITE_URL:'https://example.com'};
test('test prices and exact expiry boundaries',()=>{
 assert.deepEqual(billingConfig({}).plans.map(p=>p.amount),[4900,14900,99900]);
 assert.equal(billingConfig({}).enabled,false);
 assert.equal(entitlement({trial_started_at:'2026-01-01',trial_ends_at:'2026-01-08'},Date.parse('2026-01-08')),'expired');
 assert.equal(entitlement(null),'not_started');
});
test('signature verifies raw bytes, test signature and timestamp',()=>{
 const now=Date.now(),t=Math.floor(now/1000),raw=Buffer.from('{"ok":true}'),secret='testsecret';
 const sig=createHmac('sha256',secret).update(t+'.').update(raw).digest('hex');
 assert.ok(validBillingSignature(raw,`t=${t},te=${sig},li=`,secret,now));
 assert.equal(validBillingSignature(Buffer.from('{}'),`t=${t},te=${sig}`,secret,now),false);
 assert.equal(validBillingSignature(raw,`t=${t},li=${sig}`,secret,now),false);
 assert.equal(validBillingSignature(raw,`t=${t},te=${sig}`,secret,now+301000),false);
});
test('server owns checkout identity, prices and payment methods',async()=>{
 const calls=[];let payload;
 const {service}=createBillingService({env,authenticate:async()=>({userId}),db:async(...args)=>{calls.push(args);return []},fetchImpl:async(url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({data:{id:'cs_test',attributes:{livemode:false,checkout_url:'https://checkout.paymongo.com/test'}}})}}});
 assert.equal((await service('Bearer x',{action:'checkout',plan:'weekly',requestId:orderId,amount:1,userId:'attacker'})).url,'https://checkout.paymongo.com/test');
 assert.equal(calls[1][2].user_id,userId);assert.equal(calls[1][2].amount,4900);
 assert.deepEqual(payload.data.attributes.payment_method_types,['gcash','paymaya']);
 assert.equal(payload.data.attributes.line_items[0].amount,4900);
});
test('admin data requires server-controlled role and changed password',async()=>{
 const {service}=createBillingService({env,authenticate:async()=>({userId,user:{user_metadata:{role:'admin'}}}),db:async()=>{throw Error('must not read')}});
 await assert.rejects(service('Bearer x',{action:'admin'}),e=>e.status===403);
});
test('non-test accounts cannot checkout and live keys are refused',async()=>{
 const options={env,authenticate:async()=>({userId:'other'}),db:async()=>{throw Error('must not read')}};
 const service=createBillingService(options).service;
 assert.equal((await service('x',{action:'status'})).enabled,false);
 await assert.rejects(service('x',{action:'trial'}),e=>e.status===403);
 await assert.rejects(createBillingService({...options,env:{...env,PAYMONGO_TEST_SECRET_KEY:'sk_live_fake'},authenticate:async()=>({userId})}).service('x',{action:'checkout',plan:'weekly',requestId:orderId}),e=>e.code==='billing_setup');
});
test('payment confirmation rejects mismatched amount and live payments',async()=>{
 let amount=1,live=false,writes=0;
 const {confirm}=createBillingService({env,db:async(route)=>{if(route.startsWith('rpc/')){writes++;return null}return [{id:orderId,amount:4900}]},fetchImpl:async()=>({ok:true,json:async()=>({data:{id:'cs_test',attributes:{livemode:live,reference_number:orderId,payments:[{attributes:{livemode:false,status:'paid',amount,currency:'PHP',source:{type:'gcash'}}}]}}})})});
 await assert.rejects(confirm('cs_test'),e=>e.code==='invalid_payment');assert.equal(writes,0);
 amount=4900;assert.deepEqual(await confirm('cs_test'),{received:true});assert.equal(writes,1);
 live=true;await assert.rejects(confirm('cs_test'),e=>e.code==='invalid_payment');assert.equal(writes,1);
});
test('opt-in gate leaves other users alone and rejects expired testers',async()=>{
 const opts={env:{...env,BILLING_ENFORCE_TEST:'true',SUPABASE_URL:'https://example.com',SUPABASE_SERVICE_ROLE_KEY:'fake'},fetchImpl:async()=>({ok:true,json:async()=>[]})};
 await requireBillingTestAccess('other',opts);
 await assert.rejects(requireBillingTestAccess(userId,opts),e=>e.status===402);
});
test('SQL trial cannot reset, payment cannot extend twice, and clients cannot grant access',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${userId}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261122_test_billing.sql',import.meta.url),'utf8'));
 await db.query('select public.start_billing_test_trial($1)',[userId]);
 const before=(await db.query('select trial_ends_at from billing_test_accounts')).rows[0].trial_ends_at;
 await db.query('select public.start_billing_test_trial($1)',[userId]);
 assert.deepEqual((await db.query('select trial_ends_at from billing_test_accounts')).rows[0].trial_ends_at,before);
 await db.query("insert into billing_test_orders(id,user_id,plan,amount,session_id) values($1,$2,'weekly',4900,'cs_test')",[orderId,userId]);
 await assert.rejects(db.query('select complete_billing_test_order($1,$2,$3)',[orderId,'cs_other',4900]));
 await db.query('select complete_billing_test_order($1,$2,$3)',[orderId,'cs_test',4900]);
 const after=(await db.query('select paid_until from billing_test_accounts')).rows[0].paid_until;
 assert.equal(new Date(after)-new Date(before),7*86400000);
 await db.query('select complete_billing_test_order($1,$2,$3)',[orderId,'cs_test',4900]);
 assert.deepEqual((await db.query('select paid_until from billing_test_accounts')).rows[0].paid_until,after);
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select start_billing_test_trial($1)',[userId]));
 await assert.rejects(db.query('select * from billing_test_orders'));
 }finally{await db.close()}
});
