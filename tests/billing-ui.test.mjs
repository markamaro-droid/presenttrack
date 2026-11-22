import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/billing.js',import.meta.url),'utf8');
const plans=[{id:'weekly',label:'Weekly',amount:4900},{id:'monthly',label:'Monthly',amount:14900},{id:'annual',label:'Annual',amount:99900}];
async function render(view,result){
 const nodes=Object.fromEntries(['billing-content','billing-message','billing-refresh'].map(id=>[id,{isConnected:true,innerHTML:'',textContent:'',querySelectorAll:()=>[]}]));
 const ext={S:{view},V:{},B:{},esc:x=>String(x).replaceAll('<','&lt;')};
 const cloud={user:{id:'tester'},client:{auth:{getSession:async()=>({data:{session:{user:{id:'tester'},access_token:'fake'}}})}}};
 vm.runInNewContext(source,{podium:{ext},window:{PTCloud:cloud},PTCloud:cloud,Intl,Date,URL,AbortSignal,document:{getElementById:id=>nodes[id]},fetch:async()=>({ok:true,json:async()=>result})});
 assert.match(ext.V[view](),view==='billing'?/>Billing</:/>Payments</);
 ext.B[view]();await new Promise(resolve=>setTimeout(resolve,10));return nodes;
}
test('student preview renders prices with unavailable checkout and no trial action',async()=>{
 const n=await render('billing',{enabled:false,plans});
 assert.match(n['billing-content'].innerHTML,/49\.00/);assert.match(n['billing-content'].innerHTML,/149\.00/);assert.match(n['billing-content'].innerHTML,/999\.00/);
 assert.match(n['billing-content'].innerHTML,/disabled/);assert.doesNotMatch(n['billing-content'].innerHTML,/id="billing-trial"/);
});
test('eligible user sees trial action; admin sees setup and payment tables',async()=>{
 let n=await render('billing',{enabled:true,plans,status:'not_started',orders:[]});assert.match(n['billing-content'].innerHTML,/Start 7-day free trial/);
 n=await render('adminBilling',{configuration:{enabled:false,testAccounts:0},plans,accounts:[],orders:[]});
 assert.match(n['billing-content'].innerHTML,/Webhook signing secret/);assert.match(n['billing-content'].innerHTML,/Test payments/);assert.match(n['billing-content'].innerHTML,/No test records yet/);
});
