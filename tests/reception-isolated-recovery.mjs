// Real QA HTTPS + the application's actual mutation journal, in a fresh JS process.
// Uses a minimal DOM/storage adapter. This is NOT physical/browser acceptance.
// Read private configuration from stdin; never pass credentials in CLI arguments.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const config=JSON.parse(fs.readFileSync(0,'utf8'));
assert.equal(process.env.ZUKAIT_RECEPTION_ISOLATED,'1');
assert.equal(config.root,'https://omqgkqknbdcnotabffek.supabase.co');
assert.equal(config.key,'sb_publishable_DBp6FI8Z4ThAq_4LXrZXSg_Xw2uPPgO');
assert.match(config.user.id,/^ZQA_RC_V305_(MANAGER|SUPERVISOR|RECEPTION)$/);
assert.ok(['Manager','Supervisor','Receptionist'].includes(config.user.role));
assert.ok(typeof config.token==='string'&&config.token.length>0);
assert.ok(!/[\r\n"]/.test(config.token),'Invalid session token format');
assert.ok(['offline','drop','truncated','retry'].includes(config.mode));
assert.ok(config.command&&typeof config.command.operation==='string');
assert.equal(config.command.request_id,undefined,'The actual client must assign and persist its UUID');
const journal=path.resolve(config.journal),repo=path.resolve('.');
assert.ok(!journal.startsWith(repo+path.sep),'Journal must stay outside the checkout');
const storage=new Map(fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal,'utf8')):[]);
const persist=()=>fs.writeFileSync(journal,JSON.stringify([...storage]),{mode:0o600});
const localStorage={getItem:k=>storage.get(k)??null,setItem(k,v){storage.set(k,v);persist();},removeItem(k){storage.delete(k);persist();}};
let source=fs.readFileSync('app/src/main/assets/v2/features/insurance/reception.js','utf8');
assert.equal(source.split('  window.zukaitReception = {').length,2);
source=source.replace('https://pjknotnjkufadqavcmii.supabase.co',config.root)
 .replace('sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A',config.key)
 .replace('  window.zukaitReception = {','  window.qaMutate = mutate;\n  window.zukaitReception = {');
let requests=0,sent=null,committed=null;
const transport=async(url,args)=>{
 assert.equal(url,config.root+'/functions/v1/workshop-api');
 assert.equal(args.headers.apikey,config.key);
 if(config.mode==='offline')throw Error('QA offline before submission');
 requests++;sent=JSON.parse(args.body).command;
 const cfg=`url = ${JSON.stringify(url)}\nrequest = "POST"\nheader = "Content-Type: application/json"\nheader = "apikey: ${config.key}"\nheader = "x-zukait-session: ${config.token}"\ndata = ${JSON.stringify(args.body)}\n`;
 let raw;
 try {raw=execFileSync('curl',['--silent','--show-error','--max-time','45','--config','-','--write-out','\n%{http_code}'],{input:cfg,encoding:'utf8',maxBuffer:2000000,stdio:['pipe','pipe','pipe']});}
 catch {throw Error('QA HTTPS transport unavailable');}
 const index=raw.lastIndexOf('\n'),status=Number(raw.slice(index+1)),body=raw.slice(0,index);
 committed=JSON.parse(body);
 if(status===200&&committed.ok&&config.mode==='drop')throw Error('QA response dropped after real commit');
 if(status===200&&committed.ok&&config.mode==='truncated')return new Response('{truncated',{status:200});
 return new Response(body,{status});
};
const window={me:config.user,zukaitAuth:{getToken:()=>config.token},openModal(){}};
vm.runInNewContext(source,{window,localStorage,openModal:window.openModal,
 document:{documentElement:{},getElementById:id=>id==='rc-style'?{}:null,createElement:()=>({setAttribute(){},remove(){}})},
 crypto:{randomUUID},MutationObserver:class{observe(){}},setTimeout(){},fetch:transport});
assert.equal(requests,0,'Loading the client must not replay pending work');
let result,error;
try {result=await window.qaMutate(config.command);}catch(e){error=e.message;}
if(config.mode==='retry'){
 assert.ok(result?.ok,error||'Retry did not confirm');assert.equal(storage.size,0);
}else{
 assert.ok(error,'Fault did not interrupt confirmation');assert.equal(storage.size,1);
 if(config.mode==='offline')assert.equal(requests,0);
 else assert.ok(committed?.ok,'Fault must follow a confirmed real commit');
}
const pending=storage.size?JSON.parse([...storage.values()][0]):null;
console.log(JSON.stringify({mode:config.mode,requests,request_id:sent?.request_id||pending?.request_id,
 pending:storage.size,result:result||null,committed:committed||null,error:error||null}));
