import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';

const source = readFileSync(process.argv[2] ?? 'supabase/functions/staff-auth/index.ts', 'utf8')
  .replace(/^import .+;\r?$/gm, '');
const staff = {
  user_id:'TEST', display_name:'QA staff', role:'Manager', department:'Painting',
  active:true, must_change:false
};
let handler, sessionResult, staffResult;
const server = {
  from(table) {
    assert.ok(['staff_sessions','staff_credentials'].includes(table));
    return {
      select(){return this;},
      eq(){return this;},
      async maybeSingle(){return table==='staff_sessions'?sessionResult:staffResult;},
      update(){return this;}
    };
  }
};
runInNewContext(stripTypeScriptTypes(source), {
  createClient:()=>server,
  Deno:{env:{get:key=>key==='SUPABASE_PUBLISHABLE_KEY'?'test-publishable-key':''},serve:fn=>{handler=fn;}},
  Request,Response,TextEncoder,crypto,
  console:{error(){}}
});
const verify=()=>handler(new Request('https://test.invalid', {
  method:'POST',headers:{apikey:'test-publishable-key','content-type':'application/json'},
  body:JSON.stringify({action:'session',session_token:'test-session'})
}));
const validSession={data:{user_id:'TEST',revoked_at:null},error:null};
const validStaff={data:staff,error:null};
const outage={data:null,error:{code:'57014',message:'Database request deadline exceeded'}};

for(const [session, credentials] of [[outage,validStaff],[validSession,outage]]) {
  sessionResult=session;
  staffResult=credentials;
  const response=await verify();
  assert.equal(response.status,500);
  assert.deepEqual(await response.json(),{ok:false,code:'server_error'});
}
for(const [session, credentials] of [
  [{data:null,error:null},validStaff],
  [{data:{...validSession.data,revoked_at:'2026-11-21'},error:null},validStaff],
  [validSession,{data:{...staff,active:false},error:null}]
]) {
  sessionResult=session;
  staffResult=credentials;
  const response=await verify();
  assert.equal(response.status,401);
  assert.deepEqual(await response.json(),{ok:false,code:'invalid_session'});
}
sessionResult=validSession;
staffResult=validStaff;
const response=await verify();
assert.equal(response.status,200);
assert.equal((await response.json()).user.id,'TEST');
console.log('Staff session verification preserves temporary database failures and rejects invalid sessions');
