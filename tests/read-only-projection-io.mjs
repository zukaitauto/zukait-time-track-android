import fs from 'node:fs';
import assert from 'node:assert/strict';
import {receptionDashboardProjection} from '../supabase/functions/workshop-api/reception_dashboard_rules.js';
import {qcWork} from '../supabase/functions/workshop-api/qc_delivery_rules.js';
import {receptionistDeliveryList} from '../supabase/functions/workshop-api/receptionist_delivery_rules.js';
import {insuranceProjection} from '../supabase/functions/workshop-api/insurance_management_rules.js';

// A server-side JSON projection must preserve list results exactly, not merely
// keep matching row counts. Real customer data is never used by this test.
const state = {
  jobs: [
    {no:'QA-JC001',receptionNo:'RC001',vehicle:'Toyota Camry',reg:'1001-A',
      jobType:'INSURANCE',insuranceCompany:'QA Insurance',status:'Completed',
      createdAt:Date.parse('2026-11-10T10:00:00+04:00'),qcWorkflow:{revision:2}},
    {no:'QA-JC002',receptionNo:'RC002',vehicle:'Nissan Sunny',reg:'1002-B',
      jobType:'CASH',status:'Open',createdAt:Date.parse('2026-11-09T10:00:00+04:00')},
    {no:'ID001',receptionNo:'RC003',vehicle:'Waiting',reg:'1003-C',jobType:'INSURANCE'},
  ],
  assign:[{id:'A1',job:'QA-JC001',emp:'TECH1',completed:true,completedAt:10}],
  sessions:[{id:'S1',job:'QA-JC001',start:1,end:10}],
  users:[{id:'TECH1',role:'Employee'}],
  expenses:Array.from({length:120},(_,i)=>({id:'unused-expense-'+i,description:'x'.repeat(5000)})),
  parts:{unrelated:'x'.repeat(20000)},
  v2Events:[{id:'unused',payload:'x'.repeat(20000)}],
};
state.jobs[0].qcWorkflow={
  revision:2,fingerprint:qcWork(state,'QA-JC001').fingerprint,
  painting:{result:'PASS'},final:{result:'PASS'},history:[]
};
const receiver={jobs:state.jobs,assign:state.assign,sessions:state.sessions};
const before=receptionistDeliveryList(state);
const after=receptionistDeliveryList(receiver);
assert.deepEqual(after,before,'Reception list QC, stage, vehicle identity and revision must be unchanged');
assert.equal(after[0].deliveryReady,true,'QC PASS must still allow delivery');
assert.equal(after.length,2,'ID001 must remain excluded');

const receptions=[
  {rc_no:'RC001',job_card:'QA-JC001',job_type:'INSURANCE',approval_status:'WAITING'},
  {rc_no:'RC002',job_card:'QA-JC002',job_type:'CASH'}
];
for(const section of ['jobs','delivered','pending','wip','collected']){
  const opts={section,month:'2026-11'};
  const expected=insuranceProjection(state,receptions,opts);
  const observed=insuranceProjection({jobs:state.jobs},receptions,opts);
  assert.deepEqual(observed,expected,'Insurance '+section+' must preserve all rows, counts, filters and summaries');
}
assert.ok(JSON.stringify(receiver).length<JSON.stringify(state).length/2,
  'Synthetic read-only projection must omit unrelated large expense/audit blobs');
assert.ok(JSON.stringify({jobs:state.jobs}).length<JSON.stringify(state).length/4,
  'Synthetic insurance projection must omit unrelated expenses and time data');

const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(api,/if\(action==='insurance_dashboard'\)[\s\S]*?select\('jobs:data->jobs'\)/,
  'Insurance dashboard must request jobs only');
assert.match(api,/if \(action === "receptionist_delivery_list" \|\| action === "receptionist_deliver"\)[\s\S]*?select\("jobs:data->jobs,assign:data->assign,sessions:data->sessions"\)/,
  'Reception delivery list must request jobs, assignments and sessions');
assert.match(api,/if \(action === "receptionist_delivery_list" \|\| action === "receptionist_deliver"\)[\s\S]*?if \(user.role !== "Receptionist"\)/,
  'Role boundary must stay server-side');
assert.match(api,/if\(action==='insurance_lpo'\)[\s\S]*?select\('revision,data'\)/,
  'Insurance LPO mutation must keep full-state CAS');
assert.match(api,/for \(let attempt=0; attempt<8; attempt\+\+\) \{[\s\S]*?select\("revision,data"\)/,
  'Reception delivery mutation must keep full-state CAS');
console.log('PASS: scoped read-only workshop-state projections preserve insurance and QC results; write CAS and permissions unchanged.');

// Reception dashboard computes readiness from jobs, assignments and sessions only.
const now=Date.parse('2026-11-25T10:00:00+04:00');
for(const section of ['checklists','jobs','waiting','approved','ctl','not-repaired','vwc-checklists','vwc-jobs','ready','delivered','followup']){
 for(const opts of [{},{company_filter:'insurance'},{search:'Camry'},{month:'2026-11'},{page:1}]){
  assert.deepEqual(receptionDashboardProjection(receiver,receptions,{section,...opts},now),receptionDashboardProjection(state,receptions,{section,...opts},now),section+' exact dashboard parity');
 }
}
assert.equal(receptionDashboardProjection(receiver,receptions,{section:'ready'},now).counts.ready,1);
const route=(a,b)=>api.slice(api.indexOf(a),api.indexOf(b,api.indexOf(a)));
const dash=route('    if (action === "reception_dashboard") {',"    if(action==='insurance_dashboard')");
assert.match(dash,/select\("jobs:data->jobs,assign:data->assign,sessions:data->sessions"\)/);
assert.doesNotMatch(dash,/select\("revision,data"\)/);
const edit=route('    if (action === "job_card_edit") {','    if (action === "sublet_add"');
assert.match(edit,/if\(body.operation==="GET"\)\{[\s\S]*?select\("jobs:data->jobs"\)[\s\S]*?for\(let attempt=0;attempt<8;attempt\+\+\)\{[\s\S]*?select\("revision,data"\)/,'GET is scoped; write still reads full state for CAS');
const estimate=route("    if(action==='reception_estimate'){",'    if (action === "reception")');
assert.match(estimate,/select\('estimateDraftDeletes:data->estimateDraftDeletes'\)/);
const reception=route('    if (action === "reception") {','    if (action === "employee_time_action")');
assert.match(reception,/select\("jobs:data->jobs"\)/);
const parts=route('    if (action === "v2_allocate_spare_part_list") {','    if (action === "v2_allocate_estimate_no")');
assert.match(parts,/select\("jobs:data->jobs"\)/);
console.log('PASS: 55 dashboard parity cases; Job Card GET, estimate deletion guard, linked delivery status and parts allocation lookup omit unrelated workshop state.');
