import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';import {stripTypeScriptTypes} from 'node:module';
const source=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8'),a=source.indexOf('// ID001_ASSIGNMENT_RULE_BEGIN'),b=source.indexOf('// ID001_ASSIGNMENT_RULE_END');
const rules=vm.createContext({});vm.runInContext(stripTypeScriptTypes(source.slice(a,b)),rules);const check=rules.id001AssignmentConflict;
const hold=(id,emp='EMP008',extra={})=>({id,emp,job:'ID001',idealSafeVersion:130,completed:false,cancelled:false,...extra});
for(const emp of ['EMP001','EMP008','EMP099']){const old={assign:[hold('A',emp)]},next={assign:[...old.assign,hold('B',emp)]},saved=JSON.stringify([old,next]);assert.equal(check(next,old).employee,emp);assert.equal(JSON.stringify([old,next]),saved);assert.equal(check({assign:[hold('A',emp),hold('B','OTHER')]},old),null);}
assert.equal(check({assign:[hold('A'),hold('B',' emp008 ',{job:' id001 '})]},{assign:[hold('A')]}).employee,'EMP008');
const legacy={assign:[hold('A'),hold('B')]};assert.equal(check(structuredClone(legacy),legacy),null,'existing duplicates cannot block unrelated daily saves');assert.equal(check({assign:[hold('B')]},legacy),null,'audited removal of an unused duplicate remains possible');
assert.equal(check({assign:[hold('A'),hold('B','EMP008',{completed:true})]},{assign:[]}),null,'history may contain multiple completed records');
assert.equal(check({assign:[hold('A'),hold('B','EMP008',{cancelled:true})]},{assign:[]}),null);
assert.ok(check({assign:[hold('A'),hold('B')]},{assign:[hold('A'),hold('B','EMP008',{completed:true})]}),'reactivation cannot create another unfinished assignment');
// Execute the actual Edge handler and its current import dependencies with an isolated DB transport.
const deps={};for(const m of source.matchAll(/^import \{[^\n]+\} from ['"]([^'"]+\.js)['"];?$/gm))Object.assign(deps,await import(new URL('../supabase/functions/workshop-api/'+m[1],import.meta.url)));
await import('../supabase/functions/workshop-api/paint_order_rules.js');
let serve,state,base,revision,role='Manager',race=false,commits=0;
const admin={from(table){const chain={select:()=>chain,eq:()=>chain,in:()=>chain,update:()=>chain,insert:()=>chain,order:()=>chain,
 maybeSingle:async()=>table==='staff_sessions'?{data:{user_id:'M',last_seen_at:new Date().toISOString(),staff_credentials:{user_id:'M',display_name:'Manager',role,active:true,must_change:false}}}:{data:{data:structuredClone(base)}},
 single:async()=>({data:{revision,data:structuredClone(state)}}),then:resolve=>resolve({data:[]})};return chain;},async rpc(name,args){assert.equal(name,'zukait_commit_workshop_state_v2');commits++;if(race){race=false;state.assign.push(hold('OTHER_DEVICE'));revision++;return {data:{ok:false,code:'conflict'}};}state=structuredClone(args.p_data);revision++;return {data:{ok:true,revision}};}};
const globals={...deps,zukaitPaintOrderRules:globalThis.zukaitPaintOrderRules,createClient:()=>admin,Deno:{env:{get:k=>k==='SUPABASE_PUBLISHABLE_KEY'?'qa-key':''},serve:f=>serve=f},crypto:webcrypto,TextEncoder,Response,Date,structuredClone,console:{error(){}}};
vm.runInNewContext(stripTypeScriptTypes(source.replace(/^import[^\n]*\n/gm,'')),globals);
const reset=(assign=[])=>{state={users:[{id:'EMP008',name:'QA',role:'Employee'}],jobs:[{no:'ID001'}],assign,sessions:[]};base=structuredClone(state);revision=1;commits=0;race=false;};
async function save(data){const r=await serve(new Request('https://qa.invalid',{method:'POST',headers:{apikey:'qa-key','x-zukait-session':'QA'},body:JSON.stringify({action:'save',expected_revision:1,data})}));return {status:r.status,body:await r.json()};}
for(const actor of ['Manager','Supervisor']){role=actor;reset([hold('A')]);const next=structuredClone(state);next.assign.push(hold('B'));const r=await save(next);assert.equal(r.status,409);assert.equal(r.body.code,'id001_already_assigned');assert.equal(commits,0,'rejection occurs before any commit');assert.equal(state.assign.length,1);}
role='Manager';reset();const next=structuredClone(state);next.assign.push(hold('THIS_DEVICE'));race=true;const raced=await save(next);assert.equal(raced.status,409);assert.equal(raced.body.code,'id001_already_assigned');assert.equal(commits,1,'CAS retry rechecks uniqueness after other device wins');assert.equal(state.assign[0].id,'OTHER_DEVICE');
console.log('All-staff ID001 uniqueness: Manager/Supervisor real handler, staff normalization, history preservation, unrelated-save compatibility and two-device CAS race passed');
