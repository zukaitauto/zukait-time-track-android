import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm, {SourceTextModule,SyntheticModule} from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import {createDatabaseFetch} from '../supabase/functions/workshop-api/database_fetch.js';
import * as archiveWire from '../supabase/functions/workshop-api/extensions/job_edit_archive_wire.js';
const fixture={jobs:Array.from({length:2000},(_,i)=>({no:'QA-'+i,vehicle:'Synthetic vehicle '+i%40,reg:'TEST-'+i,status:i%2?'Open':'Completed',notes:createHash('sha256').update('fixture-'+i).digest('hex')})),assign:[],sessions:[],leaves:[]};
const payload=JSON.stringify({ok:true,revision:42,data:fixture,user:{id:'TEST',role:'Manager'}});
let handler,mode,reads=[],activeFixture=fixture,compactEnabled=false,prefixReads=0;
const prefix=[{job:'QA-1',at:1},{job:'QA-1',at:1}],tail=[{job:'QA-2',at:2}];
const compactFixture={...fixture,jobEditArchive:{snapshotRevision:40,prefixCount:2},jobEdits:tail};
const source=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const staff={user_id:'TEST',display_name:'QA',role:'Employee',department:'QA',active:true,must_change:false};
const admin={
 rpc:async(name,args)=>{if(name==='zukait_job_edit_archive_prefix'){prefixReads++;assert.equal(args.p_snapshot_revision,40);assert.equal(args.p_prefix_count,2);return {data:{ok:true,snapshotRevision:40,prefixCount:2,entries:prefix}}}return {data:{ok:true,revision:42,user:{id:'TEST',role:'Employee'}}}},
 from:table=>{let columns;const chain={select(value){columns=value;return chain},eq(){return chain},
  maybeSingle:async()=>({data:mode==='invalid'?null:{user_id:'TEST',revoked_at:null,last_seen_at:new Date().toISOString(),staff_credentials:{...staff,role:mode==='reception'?'Receptionist':mode==='accountant'?'Accountant':'Employee'}}}),
  single:async()=>{reads.push({table,columns});return{data:columns.includes('data')?{revision:mode==='race'?43:42,data:activeFixture}:{revision:42}}},
 };return chain}
};
globalThis.Deno={env:{get:k=>({SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'qa-service',SUPABASE_PUBLISHABLE_KEY:'qa-key',ZUKAIT_JOB_EDIT_COMPACT_SYNC_ENABLED:compactEnabled?'true':'false'}[k])},serve:fn=>{handler=fn}};
const module=new SourceTextModule(stripTypeScriptTypes(source));
await module.link(async spec=>{
 const line=source.split('\n').find(s=>s.includes('from')&&s.includes(spec));
 const names=line?.match(/import\s*\{([^}]+)\}/)?.[1].split(',').map(n=>n.trim())||[];
 return new SyntheticModule(names,function(){for(const name of names)this.setExport(name,spec.endsWith('/job_edit_archive_wire.js')?archiveWire[name]:name==='createDatabaseFetch'?createDatabaseFetch:name==='createClient'?()=>admin:name==='accountantApi'?async()=>({body:{ok:false,code:'accountant_forbidden'},status:403}):()=>{throw Error('unexpected import '+name)})});
});
await module.evaluate();
async function call(body,scenario='valid',key='qa-key'){
 mode=scenario;reads=[];
 const req=new Request('https://example.invalid',{method:'POST',headers:{apikey:key,'x-zukait-session':'synthetic-token','content-type':'application/json','accept-encoding':'gzip'},body:JSON.stringify(body)});
 const res=await handler(req);
 return{status:res.status,body:await res.json(),reads:reads.slice()};
}
let r=await call({action:'load'});assert.equal(r.status,200);assert.deepEqual(r.body.data,fixture);assert.equal(r.reads.length,1);
r=await call({action:'load',known_revision:42});assert.equal(r.body.not_modified,true);assert.equal(r.body.data,undefined);assert.equal(r.reads.length,1);assert.ok(!r.reads[0].columns.split(',').includes('data'));
r=await call({action:'load',known_revision:41});assert.deepEqual(r.body.data,fixture);assert.equal(r.reads.length,2);
r=await call({action:'load',known_revision:41},'race');assert.equal(r.body.revision,43);assert.deepEqual(r.body.data,fixture);
for(const value of [null,'42',-1,1.5,{}]){r=await call({action:'load',known_revision:value});assert.deepEqual(r.body.data,fixture);assert.equal(r.reads.length,1)}
r=await call({action:'load',known_revision:42},'invalid');assert.equal(r.status,401);assert.equal(r.reads.length,0);
r=await call({action:'load',known_revision:42},'reception');assert.equal(r.status,403);assert.equal(r.reads.length,0);
r=await call({action:'load',known_revision:42},'accountant');assert.equal(r.status,403);assert.equal(r.reads.length,0);
r=await call({action:'load',known_revision:42},'valid','wrong');assert.equal(r.status,401);assert.equal(r.reads.length,0);

// The actual authenticated handler, with an immutable mock archive.
activeFixture=compactFixture;
const optIn={action:'load',job_edit_sync_mode:'compact-v1'};
r=await call({action:'load'});assert.equal(r.status,200);assert.deepEqual(r.body.data.jobEdits,[...prefix,...tail]);assert.equal(r.body.data.jobEditArchive,undefined);
r=await call(optIn);assert.equal(r.body.job_edit_sync_mode,'legacy-v1');assert.deepEqual(r.body.data.jobEdits,[...prefix,...tail]);
compactEnabled=true;
const beforePrefix=prefixReads;
r=await call(optIn);assert.equal(r.body.job_edit_sync_mode,'compact-v1');assert.deepEqual(r.body.data,compactFixture);assert.equal(prefixReads,beforePrefix);
r=await call({...optIn,known_revision:42,known_job_edit_sync_mode:'legacy-v1'});assert.deepEqual(r.body.data,compactFixture);assert.equal(r.body.not_modified,undefined);
r=await call({...optIn,known_revision:42,known_job_edit_sync_mode:'compact-v1'});assert.equal(r.body.not_modified,true);assert.equal(r.body.data,undefined);
r=await call({action:'load',known_revision:42});assert.equal(r.body.not_modified,true);assert.equal(r.body.job_edit_sync_mode,'legacy-v1');
compactEnabled=false;
r=await call({...optIn,known_revision:42,known_job_edit_sync_mode:'compact-v1'});assert.deepEqual(r.body.data.jobEdits,[...prefix,...tail]);assert.equal(r.body.not_modified,undefined);
activeFixture=fixture;
const client=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const start=client.indexOf('  async function pull(force){'),end=client.indexOf('  async function probeRevision(){',start);
async function clientPull({baseline=fixture,response={ok:true,revision:42,not_modified:true},dirty=false,revision=42,onRequest}={}){
 const sent=[];let ctx;
 ctx={sessionEpoch:0,stale:()=>false,state:structuredClone(fixture),lastSyncedState:baseline?structuredClone(baseline):null,cloudRevision:revision,cloudDirty:false,dirtyGeneration:0,pullInFlight:false,initialDone:true,cloudApplying:false,
 me:{id:'TEST',role:'Employee'},navigator:{onLine:true},sessionToken:()=>true,status(){},clone:structuredClone,
 api:async body=>{sent.push(body);if(onRequest)onRequest(ctx);if(dirty){ctx.state.leaves.push({id:'pending'});ctx.cloudDirty=true;ctx.dirtyGeneration++}return structuredClone(response)},
 normalizeRemote(data){ctx.state=structuredClone(data)},REV_KEY:'revision',localStorage:{setItem(){}},window:{},scheduleDashboardRender(){},setServerConnection(){},Date,console};
 vm.createContext(ctx);vm.runInContext(client.slice(start,end)+';this.pull=pull',ctx);
 const result=await ctx.pull(true);return{ctx,sent,result};
}
let c=await clientPull();assert.equal(c.sent[0].known_revision,42);assert.equal(c.sent[0].known_job_edit_sync_mode,'legacy-v1');assert.deepEqual(c.ctx.state,fixture);
c=await clientPull({baseline:null,response:{ok:true,revision:42,data:fixture}});assert.equal(c.sent[0].known_revision,undefined);
c=await clientPull({dirty:true});assert.equal(c.result,false);assert.equal(c.ctx.state.leaves[0].id,'pending');
c=await clientPull({onRequest:ctx=>{ctx.cloudRevision=43;ctx.dirtyGeneration++}});assert.equal(c.result,false);assert.equal(c.ctx.cloudRevision,43);
c=await clientPull({response:{ok:true,revision:43,data:{...fixture,leaves:[{id:'remote'}]}}});assert.equal(c.ctx.cloudRevision,43);assert.equal(c.ctx.state.leaves[0].id,'remote');
c=await clientPull({response:{ok:true,revision:42,data:fixture}});assert.deepEqual(c.ctx.state,fixture,'updated client supports old server');
await assert.rejects(clientPull({baseline:null}),/INVALID_NOT_MODIFIED/);
await assert.rejects(clientPull({response:{ok:true,revision:43,not_modified:true}}),/INVALID_NOT_MODIFIED/);
console.log(JSON.stringify({result:'legacy compatibility, conditional reads, role isolation, client race and baseline checks passed',unchangedFullSnapshotBytes:Buffer.byteLength(payload),unchangedConditionalBytes:Buffer.byteLength(JSON.stringify({ok:true,revision:42,not_modified:true,user:{id:'TEST',role:'Employee'}}))},null,2));
