// Execute the real Reception mutator across fresh JS runtimes and shared device storage.
// Transport is mocked; this is not physical-device or real Edge acceptance.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const source=fs.readFileSync('app/src/main/assets/v2/features/insurance/reception.js','utf8');
assert.equal(source.split('  window.zukaitReception = {').length,2);
const instrumented=source.replace('  window.zukaitReception = {','  window.qa = {mutate, shell, dispatch};\n  window.zukaitReception = {');
function start(storage,transport,id='QA-MANAGER') {
  let banner=null;const errors={textContent:''};
  const root={parentElement:{matches:()=>false},addEventListener(){},appendChild(box){banner=box;}};
  const window={me:{id,role:'Manager'},zukaitAuth:{getToken:()=> 'session-'+id},openModal(){}};
  const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  vm.runInNewContext(instrumented,{window,localStorage,openModal:window.openModal,document:{documentElement:{},getElementById:id=>id==='rc-style'?{}:id==='rc-root'?root:id==='rc-retry'?banner:id==='rc-error'?errors:null,createElement:()=>({setAttribute(){},remove(){banner=null;}})},crypto:{randomUUID},MutationObserver:class{observe(){}},setTimeout(){},fetch:transport});
  return {window,qa:window.qa,banner:()=>banner,errors,localStorage};
}
const read=args=>JSON.parse(args.body).command;
for(const operation of ['CREATE','SAVE_PARTS','LINK_ESTIMATE','APPROVE','CREATE_JOB','EDIT','MOVE','SAVE_ADDITIONAL_REQUEST','LINK_ADDITIONAL_ESTIMATE','APPROVE_ADDITIONAL','CANCEL_JOB','CLOSE','ACCESS']) {
  const storage=new Map(),cache=new Map(),commands=[];let lost=true;
  const transport=async(_url,args)=>{
    const c=read(args);commands.push(c);
    if(!cache.has(c.request_id))cache.set(c.request_id,{ok:true});
    if(lost){lost=false;throw Error('response lost after commit');}
    return Response.json(cache.get(c.request_id));
  };
  const command={operation,rc_no:'RC-QA',expected_revision:1,reason:'QA original'};
  const first=start(storage,transport);
  await assert.rejects(first.qa.mutate(command),/response lost/);
  assert.equal(storage.size,1);
  const fresh=start(storage,transport); // No in-memory request state survives.
  assert.equal(commands.length,1,'Restart must never automatically replay a mutation');
  await assert.rejects(fresh.qa.mutate({...command,reason:'changed'}),/saved Reception action/);
  assert.equal(commands.length,1,'Changed form must not replace an unresolved request');
  await fresh.qa.mutate(command);
  assert.deepEqual(commands[0],commands[1],operation+': original payload and UUID must survive');
  assert.equal(cache.size,1,operation+': exactly one committed request');
  assert.equal(storage.size,0,'Confirmed response clears the journal');
  await fresh.qa.mutate(command);
  assert.notEqual(commands[2].request_id,commands[1].request_id,'A later confirmed action gets a new UUID');
}
{
  const storage=new Map(),commands=[];
  const lost=async(_,args)=>{commands.push(read(args));throw Error('offline');};
  const a=start(storage,lost,'QA-A');await assert.rejects(a.qa.mutate({operation:'MOVE',rc_no:'RC-A'}));
  const b=start(storage,lost,'QA-B');await assert.rejects(b.qa.mutate({operation:'MOVE',rc_no:'RC-B'}));
  assert.equal(storage.size,2);assert.notEqual(commands[0].request_id,commands[1].request_id);
  const again=start(storage,async(_,args)=>{commands.push(read(args));return Response.json({ok:true});},'QA-A');
  await again.qa.mutate({operation:'MOVE',rc_no:'RC-A'});
  assert.equal(commands[2].request_id,commands[0].request_id);assert.equal(storage.size,1);
}
{
  const storage=new Map();let sent=0;
  const client=start(storage,async()=>{sent++;return Response.json({ok:false,code:'reception_stale_revision'},{status:409});});
  await assert.rejects(client.qa.mutate({operation:'EDIT'}),/another device/);
  assert.equal(storage.size,0,'Definitive rejection permits a fresh reviewed command');
  client.localStorage.setItem=()=>{throw Error('storage unavailable');};
  await assert.rejects(client.qa.mutate({operation:'EDIT'}),/storage unavailable/);assert.equal(sent,1);
  client.localStorage.setItem=()=>{};
  await assert.rejects(client.qa.mutate({operation:'EDIT'}),/No request was sent/);assert.equal(sent,1);
}
{
  const storage=new Map(),commands=[];let lost=true;
  const transport=async(_,args)=>{const c=read(args);commands.push(c);if(lost){lost=false;return new Response('truncated',{status:200});}return Response.json({ok:true});};
  await assert.rejects(start(storage,transport).qa.mutate({operation:'CREATE'}));
  assert.equal(storage.size,1,'Malformed response must retain request identity');
  await start(storage,transport).qa.mutate({operation:'CREATE'});assert.deepEqual(commands[0],commands[1]);
}
{
  const storage=new Map();const client=start(storage,async()=>Response.json({ok:false,code:'temporary_failure'},{status:503}));
  await assert.rejects(client.qa.mutate({operation:'CREATE'}));assert.equal(storage.size,1,'Server failure remains unresolved');
  const key=[...storage.keys()][0];storage.set(key,'corrupt');let sent=false;
  await assert.rejects(start(storage,async()=>{sent=true;}).qa.mutate({operation:'CREATE'}),/could not be read/);
  assert.equal(sent,false);assert.equal(storage.get(key),'corrupt','Do not discard unreconciled evidence');
}
for (const [status,code] of [[401,'invalid_session'],[403,'reception_manager_required'],[409,'reception_request_conflict']]) {
  const storage=new Map(),commands=[];
  const transport=async(_,args)=>{commands.push(read(args));return Response.json({ok:false,code},{status});};
  await assert.rejects(start(storage,transport).qa.mutate({operation:'CREATE'}));
  assert.equal(storage.size,1,'Authorization/conflicting request does not resolve a previously lost response');
  await start(storage,async(_,args)=>{commands.push(read(args));return Response.json({ok:true});}).qa.mutate({operation:'CREATE'});
  assert.deepEqual(commands[0],commands[1]);
}
{
  const storage=new Map();const first=start(storage,async()=>{throw Error('lost');});
  await assert.rejects(first.qa.mutate({operation:'ACCESS',user_id:'QA-EMP',active:true}));
  let sent;
  const restored=start(storage,async(_,args)=>{const c=read(args);if(c.operation==='ACCESS'){sent=c;return Response.json({ok:true});}return Response.json({ok:true,rows:[]});});
  // Recovery is reachable through the same dispatch used by the visible button.
  restored.qa.shell('QA','');assert.match(restored.banner().innerHTML,/Confirm Saved Action/);
  await restored.qa.dispatch({preventDefault(){},target:{closest:()=>({dataset:{rcAction:'retry-pending'}})}});
  assert.equal(sent.operation,'ACCESS');assert.equal(storage.size,0);
}
console.log('Reception restart retry: 13 mutation operations retain payload/UUID; changed commands blocked; actor isolation, definitive rejection, storage failure, corrupt/truncated responses, no auto-replay and explicit recovery passed. Mocked transport only.');
