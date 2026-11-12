import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
export async function checkAdminMonitoring({evaluate,call}) {
 const wait=()=>new Promise(r=>setTimeout(r,150));
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await evaluate(`(()=>{
 PTCloud.user={id:'admin-monitor',email:'admin@example.com',app_metadata:{role:'admin',must_change_password:false}};
 PTCloud.client.auth={getSession:async()=>({data:{session:{access_token:'mock-admin'}}})};
 window.monitorCalls=[];window.monitorFailure=false;
 const original=window.fetch;
 window.fetch=async(url,options)=>{
   if(url!=='/api/admin')return original(url,options);
   const input=JSON.parse(options.body);monitorCalls.push(input);
   if(monitorFailure)return new Response(JSON.stringify({message:'System monitoring needs the 20261111_admin_monitoring.sql migration in Supabase.'}),{status:503});
   return new Response(JSON.stringify({generatedAt:'2026-11-11T03:00:00Z',summary:{users:26,students:25,admins:1,newUsers7d:6,signedIn7d:9,evaluatedStudents:15,pendingStudents:10,presentations:40,practiceReports:80},library:{total:4,published:3,drafts:1,uploaded:1},usage24h:{recordingAttempts:12,chatRequests:30,voiceRequests:20},configuration:{database:true,transcription:true,fillerCheck:false,speech:true},registrations:[{date:'2026-11-10',users:2},{date:'2026-11-11',users:4}],pagination:{page:input.page||1,pageSize:25,total:input.query?1:26},users:[{name:'<img src=x onerror=alert(1)>',email:input.page===2?'second@example.com':'first@example.com',role:'student',status:'confirmed',evaluated:input.filter!=='pending',presentations:2,reports:3,created_at:'2026-11-10T03:00:00Z',last_sign_in_at:null}]}));
 };
 podium.ext.go('admin');
 })()`);
 await wait();
 assert.equal(await evaluate(`document.querySelectorAll('.admin-metric').length`),6);
 assert.equal(await evaluate(`document.querySelector('.admin-metric strong').textContent`),'26');
 assert.match(await evaluate(`document.querySelector('.admin-config').textContent`),/Not configured/);
 assert.equal(await evaluate(`!!document.querySelector('#nav [data-go=adminUsers]')`),true);
 if(process.env.ADMIN_MONITOR_SCREENSHOTS){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(tmpdir(),'presenttrack-admin-overview.png'),Buffer.from(shot.data,'base64'));}
 await evaluate(`document.querySelector('#nav [data-go=library]').click()`);await wait();
 assert.equal(await evaluate('podium.ext.S.view'),'library');
 assert.equal(await evaluate(`!!document.getElementById('admin-upload')`),true);
 await evaluate(`document.querySelector('#nav [data-go=adminUsers]').click()`);await wait();
 assert.equal(await evaluate(`document.querySelector('.admin-table img')`),null,'user names escaped');
 assert.match(await evaluate(`document.getElementById('admin-users-results').textContent`),/first@example.com/);
 await evaluate(`document.getElementById('admin-users-next').click()`);await wait();
 assert.equal(await evaluate('monitorCalls.at(-1).page'),2);
 assert.match(await evaluate(`document.getElementById('admin-users-results').textContent`),/second@example.com/);
 await evaluate(`document.getElementById('admin-user-query').value='first';document.getElementById('admin-user-filter').value='pending';document.getElementById('admin-user-search').dispatchEvent(new Event('submit',{cancelable:true}))`);await wait();
 assert.deepEqual(await evaluate('monitorCalls.at(-1)'),{action:'overview',page:1,query:'first',filter:'pending'});
 assert.equal(await evaluate(`document.getElementById('admin-users-next').disabled`),true);
 assert.match(await evaluate(`document.getElementById('admin-users-results').textContent`),/Pending/);
 await evaluate(`monitorFailure=true;podium.ext.go('admin')`);await wait();
 assert.match(await evaluate(`document.getElementById('admin-overview-content').textContent`),/20261111_admin_monitoring.sql/);
 assert.equal(await evaluate(`document.querySelectorAll('.admin-metric').length`),0,'unavailable data is not presented as zero');
 await evaluate(`monitorFailure=false;document.getElementById('admin-refresh').click()`);await wait();
 assert.equal(await evaluate(`document.querySelectorAll('.admin-metric').length`),6);
 for(const view of ['admin','adminUsers']){
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`podium.ext.go('${view}')`);await wait();
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+2`),view+' fits mobile width');
  if(process.env.ADMIN_MONITOR_SCREENSHOTS){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(tmpdir(),'presenttrack-'+view+'-mobile.png'),Buffer.from(shot.data,'base64'));}
 }
 await evaluate(`PTCloud.user={id:'student'};podium.ext.go('adminUsers')`);await wait();
 assert.equal(await evaluate('podium.ext.S.view'),'library');
 assert.equal(await evaluate(`document.querySelectorAll('.admin-table').length`),0);
 console.log('Passed: admin overview, library navigation, user filtering/pagination, escaped user content, setup errors/retry, mobile layout and student isolation.');
}
