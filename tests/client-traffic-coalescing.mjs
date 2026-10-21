import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
let token='A',calls=0,replies=[];
const storage=new Map();
const c={me:{id:'M',role:'Manager'},sessionToken:()=>token,clone:structuredClone,localStorage:{getItem:k=>storage.get(k)||null,removeItem:k=>storage.delete(k)},cloudRevision:7,cloudDirty:true,cloudPushing:false,navigator:{onLine:true},payloadState:()=>({jobs:[{no:'12079'}]}),status:()=>{},api:()=>{calls++;return new Promise(resolve=>replies.push(resolve))}};
vm.createContext(c);
vm.runInContext(slice('  const API_URL','  let cloudRevision=')+slice('  // Share only overlapping requests.','  async function v2SearchJobCards')+slice('  async function push(retry=0)','  window.cloudScheduleSave='),c);
const opts={report:'SPARE_PARTS',filters:{job:'12079'}};
let a=c.v2ReportPage(opts),b=c.v2ReportPage(opts);
assert.equal(calls,1);replies.shift()({ok:true,rows:[{id:1}]});
const [ra,rb]=await Promise.all([a,b]);ra.rows[0].id=9;assert.equal(rb.rows[0].id,1);
a=c.v2ReportPage(opts);assert.equal(calls,2,'completed result never cached');replies.shift()({ok:true,rows:[]});await a;
a=c.v2ReportPage(opts);b=c.v2ReportPage({...opts,cursor:'next'});assert.equal(calls,4,'different pages isolated');replies.shift()({ok:true});replies.shift()({ok:true});await Promise.all([a,b]);
a=c.v2ReportPage(opts);token='B';b=c.v2ReportPage(opts);assert.equal(calls,6,'login token isolated');replies.shift()({ok:true});replies.shift()({ok:true});await Promise.all([a,b]);
a=c.v2ReportPage(opts);b=c.v2ReportPage(opts);const errors=Promise.allSettled([a,b]);replies.shift()({ok:false,code:'TIMEOUT'});assert.ok((await errors).every(r=>r.status==='rejected'));
a=c.v2ReportPage(opts);assert.equal(calls,8,'failed request can retry');replies.shift()({ok:true});await a;
// Exact acknowledged snapshot skips a redundant upload without claiming connectivity.
vm.runInContext("acknowledgedUpload={scope:uploadScope(),revision:7,snapshot:JSON.stringify(payloadState())}",c);
const before=calls;assert.equal(await c.push(),true);assert.equal(calls,before);assert.equal(c.cloudDirty,false);
const unchanged=()=>vm.runInContext('unchangedAcknowledgedUpload(payloadState())',c);
assert.equal(unchanged(),true);
storage.set('zukait_cloud_pending_conflict_v42','pending');assert.equal(unchanged(),false);storage.clear();
vm.runInContext('deniedSnapshot={user:"M",data:{different:true}}',c);assert.equal(unchanged(),false);vm.runInContext('deniedSnapshot=null',c);
c.cloudRevision++;assert.equal(unchanged(),false);c.cloudRevision--;
token='C';assert.equal(unchanged(),false);token='B';c.me.role='Employee';assert.equal(unchanged(),false);c.me.role='Manager';
c.payloadState=()=>({jobs:[{no:'12079',stopped:true}]});assert.equal(unchanged(),false);
console.log('PASS overlapping reports, fresh subsequent reads, pagination/account isolation, error retry, result isolation; exact acknowledged upload guard and pending/denied/revision/account/edit barriers');

// Exercise acknowledgement creation through the real successful push path.
c.payloadState=()=>({jobs:[{no:'12079'}]});
Object.assign(c,{cloudDirty:true,dirtyGeneration:1,clone:structuredClone,reconcileConsumablesDuplicates:x=>x,state:c.payloadState(),lastSyncedState:null,conflictAlerted:false,pushTimer:null,clearTimeout:()=>{},setTimeout:()=>{},lastSyncError:'',consecutiveSyncErrors:0,setServerConnection:()=>{},console});
c.localStorage.setItem=(k,v)=>storage.set(k,v);
vm.runInContext('acknowledgedUpload=null',c);
const save=c.push();assert.equal(calls,before+1);replies.shift()({ok:true,server_revision:8});assert.equal(await save,true);
c.cloudDirty=true;assert.equal(await c.push(),true);assert.equal(calls,before+1,'acknowledged repeat creates no second save');
console.log('PASS actual save acknowledgement followed by unchanged-upload suppression');
