import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const helperBegin=src.indexOf('  function roleStructuralSnapshot');\nconst begin=src.indexOf('  async function pull(force){');
const end=src.indexOf('  async function probeRevision(){',begin);
assert.ok(begin>=0&&end>begin);
const pullSource=src.slice(helperBegin,begin)+src.slice(begin,end);

async function run(remote,initial,baseline=null,afterPull=null){
  const statuses=[];
  let renders=0;
  const ctx={
    state:structuredClone(initial),cloudRevision:1,cloudDirty:false,pullInFlight:false,
    initialDone:true,lastSyncedState:baseline,lastSuccessfulSyncAt:0,lastSyncError:'',
    consecutiveSyncErrors:0,conflictAlerted:false,cloudApplying:false,
    me:{role:'Employee',id:'EMP1'},navigator:{onLine:true},document:{visibilityState:'visible'},REV_KEY:'revision',
    localStorage:{setItem(){}},sessionToken:()=>true,
    status:(s)=>statuses.push(s),clone:structuredClone,
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

const changed=await run({jobs:[{no:'JC1'},{no:'JC2'}]},{jobs:[{no:'JC1'}]});
assert.equal(changed.renders,1,'a real shared update must still refresh the dashboard');
assert.equal(changed.state.jobs.length,2,'a real update must be applied');
console.log('Cloud dashboard stability: identical, locally adjusted, and changed server snapshots passed');
