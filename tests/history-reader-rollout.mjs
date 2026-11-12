import fs from 'node:fs';import assert from 'node:assert/strict';import {stripTypeScriptTypes} from 'node:module';
const source=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');const start=source.indexOf('async function baseStateForRevision('),end=source.indexOf('// FINAL_SESSION_STATUS_BEGIN',start);assert.ok(start>0&&end>start);const body=stripTypeScriptTypes(source.slice(start,end));
function setup({enabled='',rpc={data:{source:'compatible'}},legacy={data:{data:{source:'legacy'}}}}={}){
 const calls=[];
 const admin={
  rpc:async(name,args)=>{calls.push(['rpc',name,args]);if(rpc instanceof Error)throw rpc;return rpc},
  from:table=>{
   calls.push(['table',table]);
   return {select:fields=>{
    assert.equal(fields,'data');
    return {eq:(field,revision)=>{
     assert.equal(field,'revision');assert.equal(revision,2);
     return {maybeSingle:async()=>legacy};
    }};
   }};
  }
 };

 const reader=new Function('admin','Deno','cloneValue',body+';return baseStateForRevision;')(admin,{env:{get:key=>{assert.equal(key,'ZUKAIT_HISTORY_READER_COMPAT');return enabled}}},structuredClone);return {reader,calls};
}
{
 const h=setup(),value={nested:{value:1}};const out=await h.reader(4,4,value);assert.deepEqual(out,value);assert.notEqual(out,value);out.nested.value=2;assert.equal(value.nested.value,1);assert.deepEqual(h.calls,[],'current revision never fetches history');
}
for(const enabled of ['',undefined,'false']){const h=setup({enabled});assert.deepEqual(await h.reader(2,4,{}),{source:'legacy'});assert.deepEqual(h.calls,[['table','workshop_state_history']],'off/default adds no failing RPC or extra round trip')}
{
 const h=setup({enabled:'true'});assert.deepEqual(await h.reader(2,4,{}),{source:'compatible'});assert.equal(h.calls.length,1);assert.equal(h.calls[0][1],'zukait_history_revision_data');assert.deepEqual(h.calls[0][2],{p_revision:2});
}
{
 const h=setup({enabled:'true',rpc:{data:null,error:null}});assert.equal(await h.reader(2,4,{}),null);assert.equal(h.calls.length,1,'unknown revision does not silently fall back');
 const missing=setup({enabled:'true',rpc:{error:{code:'PGRST202'}}});assert.deepEqual(await missing.reader(2,4,{}),{source:'legacy'});assert.equal(missing.calls.length,2,'only schema-not-ready rolling upgrade falls back');
}
for(const code of ['P0001','42501','PGRST301','XX001']){const err={code,message:'fixture corruption or access failure'},h=setup({enabled:'true',rpc:{error:err}});await assert.rejects(h.reader(2,4,{}),e=>e===err);assert.equal(h.calls.length,1,'never mask corruption or permission failures with legacy reads')}
{
 const h=setup({enabled:'true',rpc:Error('network unavailable')});await assert.rejects(h.reader(2,4,{}),/network unavailable/);assert.equal(h.calls.length,1);
 const h2=setup({legacy:{error:Error('legacy read failed')}});await assert.rejects(h2.reader(2,4,{}),/legacy read failed/);
 const h3=setup({legacy:{data:null,error:null}});assert.equal(await h3.reader(2,4,{}),null);
}
console.log('PASS compatible history rollout: default legacy/no extra RPC, cloned current data, opt-in RPC, null/missing revisions, rolling-schema fallback, corruption/access/network fail-closed.');
