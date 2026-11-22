/* Test billing. All access dates and payment confirmations come from the server. */
(() => {
  const {S,V,B,esc}=podium.ext;
  const owner=()=>window.PTCloud?.user?.id;
  const money=n=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(n)/100);
  const date=s=>s&&Number.isFinite(Date.parse(s))?new Date(s).toLocaleString():'—';
  const status=s=>({not_started:'Trial not started',trial:'Free trial active',active:'Paid access active',expired:'Access expired',pending:'Awaiting confirmation',paid:'Paid'}[s]||s||'Not enabled');
  const shell=admin=>`<section class="billing-page"><header><p class="eyebrow">TEST MODE · NO REAL CHARGES</p><h1>${admin?'Payments':'Billing'}</h1><p>${admin?'Monitor test trials and wallet payments.':'Choose your access period. Pay with GCash or Maya.'}</p></header><p id="billing-message" role="status" aria-live="polite">Loading billing…</p><button type="button" class="bt gh" id="billing-refresh">${admin?'Refresh payments':'Refresh payment status'}</button><div id="billing-content"></div></section>`;
  V.billing=()=>shell(false);V.adminBilling=()=>shell(true);
  async function request(action,extra={}){
    const id=owner();if(!id)throw Error('Sign in to view billing.');
    const {data,error}=await PTCloud.client.auth.getSession();
    if(error||data.session?.user?.id!==id)throw Error('Please sign in again.');
    const response=await fetch('/api/billing',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(110000)});
    const result=await response.json().catch(()=>null);
    if(owner()!==id)throw Error('Your account changed.');
    if(!response.ok||!result)throw Error(result?.message||'Billing could not load. Check that the new API files have been deployed.');
    return result;
  }
  const table=(head,rows)=>`<div class="billing-table"><table><thead><tr>${head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${head.length}">No test records yet.</td></tr>`}</tbody></table></div>`;
  function plans(data,admin){return `<div class="billing-plans">${data.plans.map(p=>`<article class="pn"><h2>${esc(p.label)}</h2><strong class="billing-price">${esc(money(p.amount))}</strong><p>${{weekly:'7 days',monthly:'1 calendar month',annual:'1 calendar year'}[p.id]} of access</p><p>One payment · manual renewal</p>${admin?'':`<button class="bt" type="button" data-billing-plan="${esc(p.id)}" ${data.enabled?'':'disabled'}>Choose ${esc(p.label.toLowerCase())}</button>`}</article>`).join('')}</div>`}
  function userHTML(data){return `<section class="pn"><h2>${esc(status(data.status))}</h2>${data.enabled?`<p>Trial ends: ${esc(date(data.account?.trial_ends_at))}<br>Paid access until: ${esc(date(data.account?.paid_until))}</p>${!data.account?.trial_started_at?'<button class="bt" type="button" id="billing-trial">Start 7-day free trial</button>':''}<p>${data.enforced?'A current trial or plan is required for new recording analyses and AI coaching.':'Trial expiry enforcement is off during setup.'}</p>`:'<p>Payment testing is not enabled for this account yet. These are preview prices; checkout is unavailable until the administrator completes setup.</p>'}<p>No payment method is required for the trial. It will not turn into a paid plan automatically.</p></section>${plans(data,false)}<p>Test prices in Philippine pesos. Approve each payment yourself. There are no automatic deductions. Renewing early adds time after your current access ends. Existing usage limits still apply.</p><section class="pn"><h2>Test payment history</h2>${table(['Plan','Amount','Status','Created'],(data.orders||[]).map(o=>[o.plan,money(o.amount),status(o.status),date(o.created_at)]))}</section>`}
  function adminHTML(data){const c=data.configuration;return `<section class="pn"><h2>Billing setup</h2><dl class="billing-facts">${[['Test billing',c.enabled?'Enabled':'Not enabled'],['PayMongo test key',c.keyConfigured?'Configured':'Missing'],['Webhook signing secret',c.webhookConfigured?'Configured':'Missing'],['Designated test accounts',c.testAccounts],['Trial expiry enforcement',c.enforced?'On':'Off']].map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><p>Configuration presence does not verify the provider connection. Follow docs/BILLING_SETUP.md in the project to enable checkout.</p></section>${plans(data,true)}<section class="pn"><h2>Test access</h2><p>Latest 100 accounts. Match the user ID in Supabase Authentication → Users.</p>${table(['User ID','Access','Trial ends','Paid until'],data.accounts.map(a=>[a.user_id,status(a.status),date(a.trial_ends_at),date(a.paid_until)]))}</section><section class="pn"><h2>Test payments</h2><p>Latest 100 orders. Pending orders include abandoned checkouts. Test payments are not revenue.</p>${table(['User ID','Plan','Amount','Status','Created'],data.orders.map(o=>[o.user_id,o.plan,money(o.amount),status(o.status),date(o.created_at)]))}</section>`}
  function mount(admin){
    const root=document.getElementById('billing-content'),message=document.getElementById('billing-message'),refresh=document.getElementById('billing-refresh'),id=owner();
    let busy=false,current;
    const valid=()=>root.isConnected&&owner()===id&&S.view===(admin?'adminBilling':'billing');
    async function run(action,extra={}){
      if(busy)return;busy=true;refresh.disabled=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);message.textContent=action==='checkout'?'Opening secure test checkout…':'Checking billing…';
      try{const data=await request(action,extra);if(!valid())return;
        if(data.url){const url=new URL(data.url);if(url.protocol!=='https:'||url.hostname!=='checkout.paymongo.com'||url.username||url.password)throw Error('Checkout returned an invalid address.');location.assign(url.href);return}
        current=data;root.innerHTML=admin?adminHTML(data):userHTML(data);message.textContent='Test mode. No real money is collected.';
      }catch(e){if(valid())message.textContent=e.name==='TimeoutError'?'Confirmation is taking longer than expected. Refresh payment status before trying another payment.':e.message;}
      finally{busy=false;if(valid()){refresh.disabled=false;if(current)root.querySelectorAll('button').forEach(b=>b.disabled=!current.enabled)}}
    }
    refresh.onclick=()=>run(admin?'admin':current?.enabled?'refresh':'status');
    root.onclick=e=>{
      if(e.target.closest('#billing-trial'))return run('trial');
      const button=e.target.closest('[data-billing-plan]');if(!button||busy)return;
      const plan=button.dataset.billingPlan,key='presenttrack:billing:'+id+':'+plan;
      let requestId;try{requestId=sessionStorage.getItem(key);if(current?.orders?.some(o=>o.id===requestId&&o.status==='paid'))requestId=null;if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem(key,requestId)}}catch{message.textContent='Enable session storage to safely resume your checkout.';return}
      run('checkout',{plan,requestId});
    };
    run(admin?'admin':'status');
  }
  B.billing=()=>mount(false);B.adminBilling=()=>mount(true);
})();
