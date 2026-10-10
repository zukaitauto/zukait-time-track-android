// QA-only end-to-end delivery journal replay over real HTTPS.
// Run with protected JSON configuration on stdin. Never commit a token or journal.
// This is fresh-process JS runtime recovery, NOT physical Android/Safari validation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const QA_ROOT='https://omqgkqknbdcnotabffek.supabase.co';
const QA_KEY='sb_publishable_DBp6FI8Z4ThAq_4LXrZXSg_Xw2uPPgO';
const LIVE_ROOT='https://pjknotnjkufadqavcmii.supabase.co';
const LIVE_KEY='sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A';
const SESSION='zukait_secure_session_v42';
const config=JSON.parse(fs.readFileSync(0,'utf8'));
assert.equal(process.env.ZUKAIT_RECEPTION_ISOLATED,'1','Explicit QA mode required');
assert.equal(config.root,QA_ROOT,'Production/unknown project denied');
assert.equal(config.key,QA_KEY,'Exact QA publishable key required');
assert.deepEqual(config.user?.role,'Receptionist');
assert.equal(config.user?.id,'ZQA_RC_V305_RECEPTION','Only designated synthetic QA actor permitted');
assert.ok(typeof config.token==='string'&&config.token.length>0&&!/[\r\n"]/.test(config.token),'Protected QA session token required');
assert.ok(['preflight','prepare','offline','drop','truncated','verify','retry'].includes(config.mode),'Unknown mode denied');
assert.ok(typeof config.journal==='string'&&config.journal.length>0);
const journal=path.resolve(config.journal),repoPath=path.resolve('.');
assert.ok(!journal.startsWith(repoPath+path.sep)&&journal!==repoPath,'Journal must be outside checkout');
assert.ok(fs.existsSync(path.dirname(journal)),'Use an existing protected journal directory');
if(config.mode==='preflight'){
 console.log('PASS: QA-only delivery runner validation; no network, staff login or mutation.');
 process.exit(0);
}
if(['drop','truncated','retry'].includes(config.mode))
 assert.equal(process.env.ZUKAIT_DELIVERY_QA_ACCEPT,'1','Real QA delivery mutation needs a separate explicit opt-in');
if(!['prepare','preflight'].includes(config.mode)){
 const b=config.delivery;
 assert.ok(b&&Object.keys(b).sort().join(',')===
  ['action','operation','jobCard','expectedQcRevision','expectedVehicleIdentity','request_id'].sort().join(','));
 assert.equal(b.action,'receptionist_deliver');assert.equal(b.operation,'DELIVER');
 assert.match(b.jobCard,/^(?:ZQA|QA)[A-Z0-9-]{2,}$/i,'Only synthetic QA Job Cards may be delivered');
 assert.ok(Number.isSafeInteger(b.expectedQcRevision)&&b.expectedQcRevision>=0);
 assert.ok(typeof b.expectedVehicleIdentity==='string'&&b.expectedVehicleIdentity.length<10000);
 assert.match(b.request_id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
}
if(config.mode==='prepare')assert.match(config.jobCard,/^(?:ZQA|QA)[A-Z0-9-]{2,}$/i);
const keyPrefix='zukait_receptionist_delivery_v1:'+QA_ROOT+'/functions/v1/:';
const existing=fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal,'utf8')):[];
assert.ok(Array.isArray(existing)&&existing.every(x=>Array.isArray(x)&&x.length===2&&
 x[0]===keyPrefix+config.user.id&&typeof x[1]==='string'),
 'Existing journal is not a dedicated QA delivery journal');
const storage=new Map(existing),persist=()=>{
 fs.writeFileSync(journal,JSON.stringify([...storage]),{mode:0o600,flag:'w'});
};
let session=JSON.stringify({user:config.user,token:config.token});
const localStorage={
 getItem:k=>k===SESSION?session:(storage.get(k)??null),
 setItem(k,v){if(k===SESSION)session=String(v);else {assert.equal(k,keyPrefix+config.user.id);storage.set(k,String(v));persist();}},
 removeItem(k){if(k===SESSION)session=null;else {assert.equal(k,keyPrefix+config.user.id);storage.delete(k);persist();}}
};
const elements=new Map();
function element(id=''){
 if(!elements.has(id))elements.set(id,{id,textContent:'',innerHTML:'',value:'',disabled:false,onclick:null,
  classList:{add(){},remove(){}},appendChild(){},querySelector(){return {disabled:false};}});
 return elements.get(id);
}
const document={getElementById:element,createElement:()=>element('node-'+randomUUID())};
const navigator={onLine:true};
let deliveryPosts=0,deliveryResult=null,rows=null,serverCommit=false;
const transport=async(url,args)=>{
 assert.ok(url===QA_ROOT+'/functions/v1/staff-auth'||url===QA_ROOT+'/functions/v1/workshop-api','Endpoint not QA');
 assert.equal(args.headers.apikey,QA_KEY);
 const request=JSON.parse(args.body);
 assert.ok(['session','receptionist_delivery_list','receptionist_deliver'].includes(request.action),
  'Nonallowlisted action rejected');
 assert.equal(args.headers['x-zukait-session'],config.token);
 if(request.action==='receptionist_deliver') {
  deliveryPosts++;
  assert.deepEqual(request,config.delivery,'Original delivery JSON/UUID must survive restart');
 }
 // curl data and token are passed only through stdin, never logged or command-line arguments.
 const curl='url = '+JSON.stringify(url)+'\nrequest = "POST"\n'+
  'header = "Content-Type: application/json"\nheader = "apikey: '+QA_KEY+'"\n'+
  'header = "x-zukait-session: '+config.token+'"\ndata = '+JSON.stringify(args.body)+'\n';
 let raw;
 try{raw=execFileSync('curl',['--silent','--show-error','--max-time','45','--config','-',
  '--write-out','\n%{http_code}'],{input:curl,encoding:'utf8',maxBuffer:2000000,stdio:['pipe','pipe','pipe']});}
 catch{throw Error('Isolated QA HTTPS transport unavailable');}
 const i=raw.lastIndexOf('\n'),status=Number(raw.slice(i+1)),body=raw.slice(0,i);
 assert.ok(Number.isInteger(status)&&status>=100&&status<=599,'Invalid QA HTTP status');
 let parsed;
 try{parsed=JSON.parse(body);}catch{throw Error('Unparseable QA HTTPS response');}
 if(request.action==='receptionist_delivery_list'&&status===200)rows=parsed.rows;
 if(request.action==='receptionist_deliver'){
  deliveryResult={status,ok:parsed.ok===true,duplicate:parsed.duplicate===true,
   jobCard:parsed.job?.jobCard,delivered:parsed.job?.delivered===true,code:parsed.code||null};
  serverCommit=status===200&&deliveryResult.ok;
  if(serverCommit&&config.mode==='drop')throw Error('QA delivery response intentionally discarded after server commit');
  if(serverCommit&&config.mode==='truncated')return new Response('{incomplete',{status:200});
 }
 return new Response(body,{status});
};
let source=fs.readFileSync('app/src/main/assets/receptionist_session.js','utf8');
assert.equal(source.split(LIVE_ROOT).length,2,'Expected exactly one production endpoint for QA-only redirection');
assert.equal(source.split(LIVE_KEY).length,2,'Expected exactly one production key for QA-only redirection');
source=source.replace(LIVE_ROOT,QA_ROOT).replace(LIVE_KEY,QA_KEY);
assert.ok(!source.includes(LIVE_ROOT)&&!source.includes(LIVE_KEY),'No production endpoint may remain');
const window={zukaitReception:{open:async()=>{}},addEventListener(){},me:null};
const context={window,document,localStorage,navigator,AbortController,Response,
 setTimeout,clearTimeout,crypto:{randomUUID},confirm:()=>true,prompt:()=>null,fetch:transport};
vm.runInNewContext(source,context,{filename:'receptionist_session.qa.js'});
assert.equal(deliveryPosts,0,'Script loading must not send a delivery');
await window.zukaitReceptionist.restore();
assert.equal(window.me?.id,config.user.id,'QA session restore must verify expected actor');
assert.equal(deliveryPosts,0,'Restoring a session must not auto-deliver');
const pending=()=>window.zukaitReceptionist.pending();
if(config.mode==='prepare'){
 assert.equal(pending(),null,'Resolve old delivery first');
 await window.zukaitReceptionist.deliveries();
 const ready=(rows||[]).filter(r=>r.jobCard===config.jobCard&&r.deliveryReady===true&&r.delivered===false);
 assert.equal(ready.length,1,'Need exactly one ready-to-deliver synthetic QA job');
 const r=ready[0];
 console.log(JSON.stringify({mode:'prepare',delivery:{action:'receptionist_deliver',operation:'DELIVER',
  jobCard:r.jobCard,expectedQcRevision:r.expectedQcRevision,
  expectedVehicleIdentity:r.expectedVehicleIdentity,request_id:randomUUID()},mutation:false}));
}else if(config.mode==='verify'){
 assert.equal(pending()?.request_id,config.delivery.request_id,'Saved UUID lost before verification');
 await window.zukaitReceptionist.deliveries();
 const found=(rows||[]).filter(x=>x.jobCard===config.delivery.jobCard);
 assert.equal(found.length,1);assert.equal(found[0].delivered,true);
 assert.equal(found[0].deliveryReady,false);assert.equal(deliveryPosts,0);
 console.log(JSON.stringify({mode:'verify',jobCard:config.delivery.jobCard,delivered:true,
  pending:true,deliveryPosts:0,mutation:false}));
}else{
 if(config.mode==='offline')navigator.onLine=false;
 if(config.mode==='retry'){
  assert.equal(pending()?.request_id,config.delivery.request_id,'Cannot retry a different or missing UUID');
  assert.equal(JSON.stringify(pending()),JSON.stringify(config.delivery),'Saved delivery body changed');
 }else if(pending()){
  assert.equal(JSON.stringify(pending()),JSON.stringify(config.delivery),'Unrelated pending delivery blocks new submission');
 }
 await window.zukaitReceptionist.deliver(config.mode==='retry'?pending():config.delivery);
 const waiting=pending();
 if(config.mode==='retry'){
  assert.equal(waiting,null,'Server-confirmed retry must clear the saved delivery');
  assert.equal(deliveryPosts,1);assert.equal(deliveryResult?.ok,true);
  assert.equal(deliveryResult?.duplicate,true,'Original delivery receipt must deduplicate on replay');
  assert.equal(deliveryResult?.jobCard,config.delivery.jobCard);
 }else{
  assert.equal(waiting?.request_id,config.delivery.request_id,'Unconfirmed delivery UUID must remain');
  assert.equal(JSON.stringify(waiting),JSON.stringify(config.delivery),'Delivery payload must not be mutated');
  if(config.mode==='offline')assert.equal(deliveryPosts,0,'Offline must send no delivery');
  else {assert.equal(deliveryPosts,1);assert.equal(serverCommit,true,'Fault must follow real QA commit');}
 }
 console.log(JSON.stringify({mode:config.mode,jobCard:config.delivery.jobCard,
  deliveryPosts,serverCommit,duplicate:deliveryResult?.duplicate??null,
  pending:waiting!==null,expectedUuidPreserved:waiting?.request_id===config.delivery.request_id}));
}
