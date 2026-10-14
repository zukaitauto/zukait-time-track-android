import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
import {receptionDashboardProjection} from '../supabase/functions/workshop-api/reception_dashboard_rules.js';
import {jobViewProjection,jobEditTransition} from '../supabase/functions/workshop-api/job_edit_rules.js';
const original={jobs:[
 {no:'99999',jobType:'Cash',createdAt:1000,updatedAt:9999999,notes:'Old edited record'},
 {no:'12',jobType:'Credit',createdAt:'2026-10-14T12:00:00Z'},
 {no:'13',jobType:'Insurance',createdAt:Date.parse('2026-10-14T12:00:00Z')},
 {no:'MISSING',jobType:'Cash',updatedAt:999999999},
 {no:'11',jobType:'Cash',createdAt:Date.parse('2026-10-14T13:00:00Z')}
]};
const preserved=structuredClone(original);
for(let i=0;i<3;i++)assert.deepEqual(receptionDashboardProjection(original,[],{section:'jobs'}).rows.map(r=>r.job_card),['11','13','12','99999','MISSING']);
assert.deepEqual(receptionDashboardProjection(original,[],{section:'jobs',month:'2026-10',search:'1'}).rows.map(r=>r.job_card),['11','13','12']);
assert.deepEqual(original,preserved,'Sorting and filtering must not edit dates or records');
const many={jobs:Array.from({length:75},(_,i)=>({no:String(10000-i),jobType:'Cash',createdAt:Date.parse('2026-10-14T12:00:00Z')+i}))};
const paged=[...receptionDashboardProjection(many,[],{section:'jobs',page:0}).rows,...receptionDashboardProjection(many,[],{section:'jobs',page:1}).rows];
assert.equal(paged.length,75);assert.equal(paged[0].job_card,'9926');assert.equal(paged[74].job_card,'10000');
const long='Repair panel and repaint.\n'.repeat(180)+'FINAL DESCRIPTION MARKER';
const record={no:'12079',createdAt:Date.parse('2026-10-14T13:00:00Z'),jobType:'Insurance',make:'Toyota',model:'RAV4',year:'2020',reg:'TEST-80',vin:'JTMRF9EV6HJ151476',color:'White',customer:'Customer Eight',mobile:'99990000',insuranceCompany:'Company Eight',claimNo:'CL-8',notes:long,workDescription:'Original complete scope',amount:80,status:'Approval Pending',receptionNo:'RC-SEPARATE',paintCost:999,financialAudit:[{private:'not a read field'}]};
assert.equal(jobViewProjection(record).paintCost,undefined);assert.equal(jobViewProjection(record).financialAudit,undefined);
for(const role of ['Receptionist','Supervisor','Manager'])for(const type of ['Cash','Credit','Insurance'])for(const delivered of [false,true]){
 const dom=new JSDOM('<div id="modal"></div>',{runScripts:'outside-only',url:'https://qa.invalid'}),w=dom.window;
 const data={...record,jobType:type,delivered};let fetched=[],printed=[],back=0,alerts=[];
 w.me={role,id:'QA'};w.alert=m=>alerts.push(m);w.zukaitAuth={getToken:()=> 'test'};
 w.openModal=html=>w.document.getElementById('modal').innerHTML='<div class="modal-box">'+html+'</div>';w.closeModal=()=>w.document.getElementById('modal').replaceChildren();
 w.AndroidBridge={printHtmlNamed:(html,title)=>printed.push({html,title})};
 w.fetch=async(_url,options)=>{const body=JSON.parse(options.body);fetched.push(body);assert.equal(body.operation,'GET');assert.equal(body.jobCard,data.no);return {ok:true,json:async()=>({ok:true,job:jobViewProjection(data)})}};
 w.eval(fs.readFileSync('app/src/main/assets/job_card_edit.js','utf8'));
 await w.zukaitJobEdit.view(data.no,{onBack:async()=>back++});
 const text=w.document.querySelector('.jce-view').textContent;
 for(const value of [data.no,type,'Toyota','RAV4','2020','TEST-80',data.vin,'White','Customer Eight','99990000','CL-8','Company Eight','80.000','FINAL DESCRIPTION MARKER','Original complete scope','RC-SEPARATE'])assert.ok(text.includes(value),'View must retain saved field '+value);
 assert.match(text,delivered?/Delivered/:/Approval Pending/);assert.equal(w.document.querySelector('.jce-view-value').textContent,'12079');
 w.document.getElementById('jce-view-print').click();assert.equal(printed[0].title,'Job Card 12079');assert.ok(printed[0].html.includes('FINAL DESCRIPTION MARKER'));assert.ok(printed[0].html.includes('80.000'));assert.ok(!printed[0].html.includes('jce-view-print'));
 w.document.getElementById('jce-view-back').click();await Promise.resolve();assert.equal(back,1);assert.equal(w.document.querySelector('.jce-view'),null);assert.equal(fetched.length,1,'View/Back/Print must not write or duplicate records');
 assert.deepEqual(alerts,[]);
 const edit=jobEditTransition({jobs:[data]}, {role,id:'QA'},{jobCard:data.no,operation:'EDIT',expectedEditRevision:0,patch:{notes:'Correction'},reason:'Test'},1);
 assert.equal(edit.ok,!(delivered&&role!=='Manager'),'Delivered editing remains Manager-only');
 dom.window.close();
}
const dom=new JSDOM('<div id="modal"></div>',{runScripts:'outside-only',url:'https://qa.invalid'}),w=dom.window;
w.me={role:'Receptionist'};w.openModal=html=>w.document.getElementById('modal').innerHTML=html;w.closeModal=()=>w.document.getElementById('modal').replaceChildren();w.alert=()=>{};
w.fetch=async()=>({ok:true,json:async()=>({ok:true,job:{no:'EMPTY',jobType:'Cash',amount:null}})});w.eval(fs.readFileSync('app/src/main/assets/job_card_edit.js','utf8'));let resumed=0;
await w.zukaitJobEdit.view('EMPTY',{onBack:async()=>resumed++});assert.match(w.document.body.textContent,/Not recorded/);assert.match(w.document.body.textContent,/Not entered/);w.document.getElementById('jce-view-close').click();await Promise.resolve();assert.equal(resumed,1,'Reception Close cannot leave an empty workspace');dom.window.close();
console.log('Feature 8 passed: creation dates/ties/pagination/filtering preserved, all job types and roles, full saved fields, long descriptions, missing fields, delivered restrictions, Back/Close/Print and read-only access');
