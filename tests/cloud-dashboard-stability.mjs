import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const helperBegin=src.indexOf('  function roleStructuralSnapshot');
const begin=src.indexOf('  async function pull(force){');
const end=src.indexOf('  async function probeRevision(){',begin);
assert.ok(begin>=0&&end>begin);
const helperEnd=src.indexOf('  function status(',helperBegin);
const pullSource=src.slice(helperBegin,helperEnd)+src.slice(begin,end);

async function run(remote,initial,baseline=null,afterPull=null,who={role:'Employee',id:'EMP1'}){
  const statuses=[];
  let renders=0;
  const ctx={
    state:structuredClone(initial),cloudRevision:1,cloudDirty:false,dirtyGeneration:0,pullInFlight:false,
    initialDone:true,lastSyncedState:baseline,lastSuccessfulSyncAt:0,lastSyncError:'',
    consecutiveSyncErrors:0,conflictAlerted:false,cloudApplying:false,
    me:who,navigator:{onLine:true},document:{visibilityState:'visible'},REV_KEY:'revision',
    localStorage:{setItem(){}},sessionToken:()=>true,
    setServerConnection:()=>{},status:(s)=>statuses.push(s),clone:structuredClone,
    api:async()=>({ok:true,revision:2,data:remote}),
    normalizeRemote:(data)=>{ctx.state=structuredClone(data)},
    render:()=>{renders++},dashboardRenderTimer:null,clearTimeout, setTimeout:(fn)=>{fn();return 1},window:{v42AfterCloudPull:afterPull?()=>afterPull(ctx):undefined,zukaitLiveStatusAuthority:{apply(){}}},console
  };
  vm.runInNewContext(pullSource+';globalThis.pull=pull;',ctx);
  await ctx.pull(true);
  return {renders,statuses,state:ctx.state,revision:ctx.cloudRevision,lastSyncedState:ctx.lastSyncedState};
}

const same=await run({jobs:[{no:'JC1'}]},{jobs:[{no:'JC1'}]});
assert.equal(same.renders,0,'a forced identical pull must preserve the visible dashboard');
assert.deepEqual(same.statuses,['SYNCED'],'background refresh must not flash the status badge');
assert.equal(same.revision,2,'an unchanged snapshot still acknowledges its server revision');

const reconciled=await run({jobs:[{no:'JC1'}]},{jobs:[{no:'JC1'}],localSessionAdjustment:true},{jobs:[{no:'JC1'}]});
assert.equal(reconciled.renders,0,'local render adjustments must not make an unchanged server snapshot flash again');

const afterHook=await run({jobs:[{no:'JC1'}]},{jobs:[{no:'JC1'}]},{jobs:[{no:'JC1'}]},ctx=>{ctx.state.localSessionAdjustment=true});
assert.equal(afterHook.renders,0,'a sync hook must not cause a redraw when server data is unchanged');
assert.equal(afterHook.lastSyncedState.localSessionAdjustment,undefined,'the comparison baseline must remain the authoritative server snapshot');

const unrelated=await run({jobs:[{no:'JC1'},{no:'JC2'}],assign:[{id:'A2',job:'JC2',emp:'EMP2'}]},{jobs:[{no:'JC1'}],assign:[]});
assert.equal(unrelated.renders,0,'unrelated workshop job changes must not rebuild an Employee dashboard');
assert.equal(unrelated.state.jobs.length,2,'unrelated shared updates must still enter local state');

const own=await run({jobs:[{no:'JC1'}],assign:[{id:'A1',job:'JC1',emp:'EMP1'}]},{jobs:[{no:'JC1'}],assign:[]});
assert.equal(own.renders,1,'an Employee assignment change must refresh that Employee dashboard');

const manager=await run({jobs:[{no:'JC1'},{no:'JC2'}],assign:[{id:'A2',job:'JC2',emp:'EMP2'}]},{jobs:[{no:'JC1'}],assign:[]},null,null,{role:'Manager',id:'MGR'});
assert.equal(manager.renders,0,'remote workshop churn must not tear down the Manager dashboard root');
const supervisor=await run({jobs:[{no:'JC1'},{no:'JC2'}],assign:[{id:'A2',job:'JC2',emp:'EMP2'}]},{jobs:[{no:'JC1'}],assign:[]},null,null,{role:'Supervisor',id:'SUP'});
assert.equal(supervisor.renders,0,'remote workshop churn must not tear down the Supervisor dashboard root');
console.log('Cloud dashboard stability: mounted role roots and Employee-scoped structural updates passed');

// Sync acknowledgements/conflict reconciliation must route through the structural render gate.
const cloudSrc=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const pushStart=cloudSrc.indexOf('  async function push('),pushEnd=cloudSrc.indexOf('  function schedulePush',pushStart);
const pushBlock=cloudSrc.slice(pushStart,pushEnd);
assert.doesNotMatch(pushBlock,/if\(me\)try\{render\(\)\}/,'push acknowledgements must never directly rebuild dashboard roots');
assert.match(pushBlock,/scheduleDashboardRender\(beforeAckRender,state\)/,'successful acknowledgements must use the structural render gate');
assert.match(pushBlock,/scheduleDashboardRender\(beforeConflictRender,state\)/,'conflict reconciliation must use the structural render gate');
console.log('Cloud push stability: acknowledgements cannot directly rebuild dashboards');
