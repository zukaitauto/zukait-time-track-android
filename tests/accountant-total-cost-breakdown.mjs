import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const dom=new JSDOM(fs.readFileSync('app/src/main/assets/accountant.html','utf8'),{
 url:'https://qa.invalid/accountant.html',runScripts:'outside-only'
});
const w=dom.window;
w.ZUKAIT_ACCOUNTANT_CONFIG={url:'https://qa.invalid',key:'qa-key'};
w.localStorage.setItem('zukait_secure_session_v42',
 JSON.stringify({user:{id:'M',role:'Manager'},token:'qa-token'}));
const jobs=Array.from({length:45},(_,i)=>({
 job_card:String(12000+i),date:'2026-11-03',kind:'CASH',job_type:'CASH',
 vehicle:'Toyota Corolla',registration:'32621-M',invoice_amount_omr:200,
 parts_cost_omr:50,paint_cost_omr:20,consumables_cost_omr:10,
 labour_cost_omr:15,sublet_cost_omr:5,costs_complete:true,cost_estimated:false,
 cost_partial:false,cost_notes:[]
}));
const requests=[];
let changedRevision=false;
w.fetch=async(url,options)=>{
 const body=JSON.parse(options.body);requests.push(body);
 const mode=body.filters?.labour_mode==='without'?'without':'with';
 const rows=jobs.map(r=>{
  const cost=mode==='with'?100:85;
  return {...r,total_job_cost_omr:cost,net_profit_omr:200-cost,
   percentage:((200-cost)/200)*100};
 });
 const response=body.action==='accountant_report'?{
  rows:rows.slice(body.offset||0,(body.offset||0)+(body.limit||100)),
  total_count:rows.length,
  next_offset:(body.offset||0)+(body.limit||100)<rows.length
   ?(body.offset||0)+(body.limit||100):null,
  summary:{records:rows.length,revenue_omr:9000,total_cost_omr:rows.length*(mode==='with'?100:85),
   recorded_cost_omr:rows.length*(mode==='with'?100:85),pending_cost_records:0,costs_provisional:false},
  period_month:'2026-11',labour_mode:mode,
  snapshot_revision:changedRevision?10:9,finance_revision:0,as_of:'2026-11-23T12:00:00Z'
 }:url.endsWith('/staff-auth')?{user:{id:'M',role:'Manager',name:'QA Manager'}}:{
  summary:{},as_of:'2026-11-23T12:00:00Z',snapshot_revision:9,finance_revision:0
 };
 return {ok:true,status:200,json:async()=>({ok:true,...response})};
};
w.eval(fs.readFileSync('app/src/main/assets/accountant_exports.js','utf8'));
w.eval(fs.readFileSync('app/src/main/assets/accountant.js','utf8'));
const wait=async fn=>{for(let i=0;i<250;i++){
 if(fn())return;await new Promise(r=>setTimeout(r,10));
}throw Error('Timed out: '+w.document.getElementById('message').textContent)};
await wait(()=>!w.document.getElementById('app').hidden);
w.document.querySelector('#navigation [data-report="profit"]').click();
await wait(()=>w.document.querySelector('[data-total-cost-breakdown]')!==null);
assert.equal(w.document.querySelectorAll('#rows .finance-report tbody tr').length,25,
 'Initial report remains paginated at 25 Job Cards');
let button=w.document.querySelector('[data-total-cost-breakdown]');
assert.equal(button.tagName,'BUTTON');
button.click();
await wait(()=>w.document.querySelector('#financial-detail-dialog').open);
let modal=w.document.getElementById('detail');
assert.match(modal.textContent,/45 Job Cards/,'Full period included in cost view');
assert.match(modal.textContent,/With Labour/);
assert.match(modal.querySelector('.total-cost-overview strong').textContent,/OMR 4500.000/);
for(const [name,value] of [
 ['parts','OMR 2250.000'],['paint','OMR 900.000'],
 ['consumables','OMR 450.000'],['labour','OMR 675.000'],['sublet','OMR 225.000']
]){
 assert.match(modal.querySelector('.total-cost-'+name).textContent,new RegExp(value.replace('.','\\.')),
  name+' aggregate must cover all 45 job cards');
}
assert.match(modal.textContent,/Included recorded categories: OMR 4500.000/);
assert.equal(requests.filter(q=>q.action==='accountant_report'&&q.limit===500).length,1,
 'Cost breakdown must request all selected report rows, not use only the first page');
modal.querySelector('#close-detail').click();
assert.equal(w.document.getElementById('financial-detail-dialog').open,false);
assert.equal(w.document.querySelectorAll('#rows .finance-report tbody tr').length,25,
 'Closing breakdown must return to normal financial report');

w.document.getElementById('profit-without-labour').click();
await wait(()=>w.document.querySelector('[data-total-cost-breakdown]')?.textContent.includes('3825.000'));
button=w.document.querySelector('[data-total-cost-breakdown]');
button.click();
await wait(()=>w.document.getElementById('financial-detail-dialog').open);
modal=w.document.getElementById('detail');
assert.match(modal.querySelector('.total-cost-overview strong').textContent,/OMR 3825.000/,
 'Labour exclusion must match the server');
assert.match(modal.querySelector('.total-cost-labour').textContent,/OMR 675.000/,
 'Recorded Labour remains visible');
assert.match(modal.querySelector('.total-cost-labour').textContent,/Excluded from selected Profit\/Loss calculation/,
 'Labour excluded only from selected calculation');
assert.match(modal.textContent,/Included recorded categories: OMR 3825.000/);
assert.ok(requests.some(q=>q.action==='accountant_report'&&q.limit===500&&q.filters.labour_mode==='without'));
modal.querySelector('#close-detail').click();

changedRevision=true;button=w.document.querySelector('[data-total-cost-breakdown]');
button.click();
await wait(()=>w.document.getElementById('message').textContent.includes('Financial records changed'));
assert.equal(w.document.getElementById('financial-detail-dialog').open,false,
 'Stale financial revisions cannot be displayed as verified cost data');
assert.equal(requests.some(q=>q.action==='accountant_command'),false,
 'New cost breakdown must be read-only');
w.close();
console.log('PASS Profit/Loss total cost: full filtered cohort, five categories, labour mode, safe detail dialog, revision guard, read-only');
