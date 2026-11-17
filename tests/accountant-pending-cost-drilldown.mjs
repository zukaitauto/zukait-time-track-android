import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const dom=new JSDOM(fs.readFileSync('app/src/main/assets/accountant.html','utf8'),{
 url:'https://qa.invalid/accountant.html',runScripts:'outside-only'
});
const w=dom.window;
w.ZUKAIT_ACCOUNTANT_CONFIG={url:'https://qa.invalid',key:'qa-key'};
w.localStorage.setItem('zukait_secure_session_v42',JSON.stringify({user:{id:'M',role:'Manager'},token:'qa-token'}));
const all=Array.from({length:31},(_,i)=>({
 job_card:String(1000+i),date:'2026-11-03',kind:'CASH',job_type:'CASH',registration:'32621-M',
 vehicle:'Toyota Corolla',company_name:'',invoice_amount_omr:150,labour_cost_omr:25,paint_cost_omr:10,
 consumables_cost_omr:5,parts_cost_omr:10,sublet_cost_omr:0,total_job_cost_omr:i>=29?null:50,
 net_profit_omr:i>=29?null:100,percentage:i>=29?null:66.67,costs_complete:i<29,
 parts_price_pending:i>=29,cost_partial:i>=29,cost_notes:i>=29?['Missing parts prices']:[],
 cost_estimated:i>=29
}));
const requests=[];
w.fetch=async(url,options)=>{
 const b=JSON.parse(options.body);requests.push(b);
 const result=b.action==='accountant_jc_detail'?{
  detail:{job_card:b.job_card,registration:'32621-M',vehicle:'Toyota Corolla',job_type:'CASH',
   invoice_amount_omr:150,job_invoice_amount_omr:150,job_total_cost_omr:null,job_profit_omr:null,
   job_profit_percentage:null,labour_cost_omr:25,paint_cost_omr:10,consumables_cost_omr:5,
   parts_cost_omr:10,sublet_cost_omr:0,cost_partial:true,cost_estimated:true},breakdown:{}
 }:b.action==='accountant_report'?{
  rows:all.slice(b.offset||0,(b.offset||0)+(b.limit||100)),total_count:all.length,
  next_offset:(b.offset||0)+(b.limit||100)<all.length?(b.offset||0)+(b.limit||100):null,
  summary:{records:all.length,revenue_omr:all.length*150,total_cost_omr:null,
   recorded_cost_omr:1550,provisional_profit_omr:3100,profit_percentage:null,
   pending_cost_records:2,costs_provisional:true},period_month:'2026-11',
  labour_mode:b.filters?.labour_mode||'with',snapshot_revision:9,finance_revision:0,as_of:'2026-11-17T10:00:00Z'
 }:url.endsWith('/staff-auth')?{user:{id:'M',role:'Manager',name:'QA Manager'}}:{
  summary:{},as_of:'2026-11-17T10:00:00Z',snapshot_revision:9,finance_revision:0
 };
 return {ok:true,status:200,json:async()=>({ok:true,...result})};
};
w.eval(fs.readFileSync('app/src/main/assets/accountant_exports.js','utf8'));
w.eval(fs.readFileSync('app/src/main/assets/accountant.js','utf8'));
const wait=async fn=>{for(let i=0;i<250;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}throw Error('Timed out: '+w.document.getElementById('message').textContent)};
await wait(()=>!w.document.getElementById('app').hidden);
w.document.querySelector('#navigation [data-report="profit"]').click();
await wait(()=>w.document.querySelector('[data-pending-costs]')?.textContent.includes('2'));
assert.equal(w.document.querySelectorAll('#rows .finance-report tbody tr').length,25,'normal report remains paged');
const card=w.document.querySelector('[data-pending-costs]');
assert.equal(card.tagName,'BUTTON');
assert.equal(card.disabled,false);
card.click();
await wait(()=>w.document.querySelectorAll('#rows .pending-cost-job').length===2);
assert.deepEqual([...w.document.querySelectorAll('#rows .pending-cost-job')].map(x=>x.dataset.job),['1029','1030'],'pending jobs beyond the initial 25-row page are included');
assert.match(w.document.querySelector('#rows').textContent,/Toyota Corolla/);
assert.match(w.document.querySelector('#rows').textContent,/Missing parts prices/);
assert.ok(requests.some(b=>b.action==='accountant_report'&&b.limit===500&&b.filters.labour_mode==='with'),'uses full verified report with current labour mode');
assert.equal(w.document.getElementById('pdf').disabled,true,'filtered view cannot export unfiltered records');
w.document.querySelector('#rows [data-job="1030"]').click();
await wait(()=>w.document.getElementById('financial-detail-dialog').open);
assert.match(w.document.getElementById('financial-detail-title').textContent,/1030/);
w.document.getElementById('close-detail').click();
w.document.querySelector('#rows [data-pending-all]').click();
await wait(()=>w.document.querySelectorAll('#rows .finance-report tbody tr').length===25);
assert.equal(w.document.getElementById('pdf').disabled,false);
w.document.getElementById('profit-without-labour').click();
await wait(()=>w.document.querySelector('[data-pending-costs]')&&!w.document.getElementById('profit-without-labour').getAttribute('aria-pressed').includes('false'));
w.document.querySelector('[data-pending-costs]').click();
await wait(()=>w.document.querySelectorAll('#rows .pending-cost-job').length===2);
assert.ok(requests.some(b=>b.action==='accountant_report'&&b.limit===500&&b.filters.labour_mode==='without'));
w.document.querySelector('#rows [data-job="1030"]').click();
await wait(()=>w.document.getElementById('financial-detail-dialog').open);
assert.match(w.document.getElementById('detail').textContent,/WITHOUT LABOUR/,'drilldown on a later page preserves selected calculation mode');
dom.window.close();
console.log('PASS pending-cost KPI drilldown: full period, late-page JCs, cost notes, financial details, labour mode, restore');
