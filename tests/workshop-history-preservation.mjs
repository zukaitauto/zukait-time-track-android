import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const start=source.indexOf('function preserveOperationalHistory(');
const end=source.indexOf('\nfunction threeWayMerge(',start);
assert.ok(start>=0&&end>start,'Preservation function must be present');
const fn=source.slice(start,end).replaceAll(': any','').replaceAll(' as const','');
const context={cloneValue:(x)=>structuredClone(x)};
vm.createContext(context);
vm.runInContext(fn,context);
const current={
 jobs:[{no:'12001'}],assign:[],sessions:[],
 employeeTimeActionAudit:[{id:'time1',action:'START'},{id:'time2',action:'PAUSE'}],
 jobIdentityAudit:[{id:'identity1',job:'12001'}],
 systemNotifications:[{id:'notice1',type:'MATERIAL'},{id:'notice2',type:'QC'}],
 jobEdits:[{id:'edit1'}],
};
for(const missing of ['absent','empty']){
 const proposed={jobs:[{no:'12001'}],assign:[],sessions:[],jobEdits:[]};
 if(missing==='empty'){
   proposed.employeeTimeActionAudit=[];
   proposed.jobIdentityAudit=[];
   proposed.systemNotifications=[];
 }
 const result=context.preserveOperationalHistory(proposed,current,{role:'Manager',id:'MGR001'});
 for(const key of ['employeeTimeActionAudit','jobIdentityAudit','systemNotifications','jobEdits']){
  assert.deepEqual(JSON.parse(JSON.stringify(result[key])),current[key],key+' must survive '+missing+' stale snapshot');
 }
}
const proposed={jobs:[{no:'12001'}],assign:[],sessions:[],systemNotifications:[{id:'notice1',type:'MATERIAL'},{id:'notice3',type:'NEW'}]};
const result=context.preserveOperationalHistory(proposed,current,{role:'Supervisor',id:'SUP001'});
assert.deepEqual(result.systemNotifications.map(x=>x.id),['notice1','notice3','notice2']);
assert.equal(new Set(result.systemNotifications.map(x=>x.id)).size,3,'Notification ids must not duplicate');
console.log('PASS: legacy saves retain server audits and notifications without duplicates');
