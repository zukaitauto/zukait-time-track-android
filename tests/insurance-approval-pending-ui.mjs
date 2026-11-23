import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {receptionDashboardProjection} from '../supabase/functions/workshop-api/reception_dashboard_rules.js';

const sample=[
 {rc_no:'RC0012',job_type:'INSURANCE',repair_status:'PENDING',approval_status:'WAITING',received_at:'2026-10-10T09:00:00Z',details:{make:'Toyota',model:'Camry',year:2020,registration:'TEST-12'},insurance_company:'Liva Insurance'},
 {rc_no:'RC0013',job_type:'INSURANCE',repair_status:'PENDING',approval_status:'WAITING',received_at:'2026-11-01T09:00:00Z',details:{make:'Nissan',model:'Altima',year:2023},insurance_company:'Oman Qatar Insurance'},
 {rc_no:'RC0014',job_type:'CASH',repair_status:'PENDING',approval_status:'WAITING',received_at:'2026-10-11T09:00:00Z',details:{make:'Honda'}}
];
assert.equal(receptionDashboardProjection({jobs:[]},sample,{section:'waiting',company_filter:'insurance'}).total,2);
assert.equal(receptionDashboardProjection({jobs:[]},sample,{section:'waiting',company_filter:'insurance',month:'2026-11'}).total,1);
assert.equal(receptionDashboardProjection({jobs:[]},sample,{section:'waiting',company_filter:'insurer:LIVA INSURANCE'}).total,1);

const source=fs.readFileSync('app/src/main/assets/insurance_management.js','utf8');
new vm.Script(source,{filename:'insurance_management.js'});
let html='',opened='',error='';
const requests=[],handlers={};
const view={isConnected:true,querySelector:()=>null};
const root={
 querySelector(sel){return sel==='#ins-results'||sel.includes('[data-ins-loading]')?view:null;},
 querySelectorAll(){return [];},
 addEventListener(key,cb){(handlers[key]??=[]).push(cb);}
};
const document={
 head:{appendChild(){}},activeElement:null,
 createElement(){return {id:'',textContent:''};},
 getElementById(id){return id==='rc-root'?root:id==='rc-error'?{set textContent(v){error=v;}}:null;},
 querySelector(){return null;}
};
const server=async req=>{
 requests.push({...req});
 if(req.action==='insurance_dashboard')return {ok:true,summary:{collected_amount:0,delivered_count:0,approval_pending:17,wip_count:3},companies:['Liva Insurance'],rows:[],total:0};
 if(req.action==='reception_dashboard')return {ok:true,section:'waiting',total:17,rows:[{rc_no:'RC0012',received_date:'2026-10-10',vehicle:'Toyota Camry 2020',registration:'TEST-12',insurance_company:'Liva Insurance',approval_status:'WAITING'}]};
 throw Error('Wrong route');
};
const window={
 me:{role:'Manager',id:'MGR'},
 zukaitReception:{action:server,dashboardShell:(name,body)=>{html=body;},openRecord:no=>{opened=no;}},
};
const ctx={window,document,Date,Number,String,Math,console,setTimeout,clearTimeout};
vm.runInNewContext(source,ctx);
await window.zukaitInsuranceManagement.open();
const click=async(data)=>{const cb=handlers.click.at(-1);assert.ok(cb);await cb({target:{closest:()=>({dataset:data})},preventDefault(){}});};
await click({ins:'summary',section:'approval'});
assert.equal(requests.at(-1).action,'reception_dashboard','Approval summary must use Reception waiting');
assert.equal(requests.at(-1).section,'waiting');
assert.equal(requests.at(-1).month,'','Approval Pending must default to all dates');
assert.equal(requests.at(-1).company_filter,'insurance');
assert.match(html,/Approval Pending · 17 checklists/);
assert.match(html,/RC0012/,'Show Checklist number instead of empty JC number');
assert.match(html,/2026-10-10/,'Use received date from Reception API');
assert.match(html,/Waiting Approval/);
assert.match(html,/Open Checklist/);
assert.ok(!html.includes('undefined'),'Never display undefined row fields');
await click({ins:'checklist',job:'RC0012'});
assert.equal(opened,'RC0012','Clicking a row must open its Checklist');
handlers.change.at(-1)({target:{dataset:{insFilter:'company'},value:'Liva Insurance'}});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(requests.at(-1).company_filter,'insurer:LIVA INSURANCE');
assert.equal(error,'','Approval screen must not emit an error');
console.log('PASS: approval count, all-dates card navigation, Checklist rows/open, company filter and request routing');
