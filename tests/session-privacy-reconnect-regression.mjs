// ZUKAIT connection privacy regression — Node.js, no external dependencies.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app/src/main/assets/session_privacy.js','utf8');
const baseUrl='https://pjknotnjkufadqavcmii.supabase.co/functions/v1/workshop-api';

function harness({online=true}={}){
  const user={id:'MGR001',role:'Manager'};
  const map=new Map([['zukait_secure_session_v42',JSON.stringify({token:'qa-test-token',user})]]);
  const storage={
    getItem:k=>map.get(k)||null,
    setItem:(k,v)=>map.set(k,String(v)),
    removeItem:k=>map.delete(k),
    key:i=>[...map.keys()][i],
    get length(){return map.size},
  };
  const elements=new Map();
  const root={
    locked:false,
    setAttribute(){this.locked=true},
    removeAttribute(){this.locked=false},
  };
  const document={
    documentElement:root,
    head:{appendChild(){}},
    body:{appendChild(node){if(node.id)elements.set(node.id,node)}},
    getElementById:id=>elements.get(id)||null,
    createElement(){
      return {textContent:'',style:{},appendChild(node){if(node.id)elements.set(node.id,node)},setAttribute(){}};
    },
    addEventListener(){},
  };
  class FakeAbortController{
    constructor(){this.signal={addEventListener(){},removeEventListener(){}}}
    abort(){}
  }
  let status=200,requests=0,retryTimers=0;
  const window={
    me:user,
    addEventListener(){},
    fetch:async()=>({
      status,
      json:async()=>{
        requests++;
        return status===200?{ok:true,user}:{ok:false,code:status===401?'invalid_session':'upstream_unavailable'};
      }
    })
  };
  vm.runInNewContext(source,{
    window,document,
    navigator:{onLine:online},
    localStorage:storage,
    sessionStorage:storage,
    setTimeout(){return ++retryTimers},
    clearTimeout(){},
    AbortController:FakeAbortController,
    location:{reload(){},replace(){}},
    console,
  });
  return {window,root,elements,setStatus(value){status=value},requests:()=>requests,retryTimers:()=>retryTimers};
}

{
  const h=harness();
  h.window.zukaitSessionPrivacy.unlock();
  h.window.zukaitSessionPrivacy.lock('Workshop connection interrupted.');
  h.setStatus(503);
  assert.equal(await h.window.zukaitSessionPrivacy.reconnect(true),false);
  assert.equal(h.root.locked,true);
  assert.match(h.elements.get('sessionPrivacyMessage').textContent,/503/);
  h.setStatus(200);
  assert.equal(await h.window.zukaitSessionPrivacy.reconnect(true),true);
  assert.equal(h.root.locked,false);
  assert.equal(h.requests(),2);
}
{
  const h=harness();
  h.window.zukaitSessionPrivacy.unlock();
  h.window.zukaitSessionPrivacy.lock('Connection unavailable.');
  h.setStatus(401);
  assert.equal(await h.window.zukaitSessionPrivacy.reconnect(true),false);
  assert.equal(h.root.locked,true);
  assert.match(h.elements.get('sessionPrivacyMessage').textContent,/expired/i);
}
{
  const h=harness();
  assert.ok(h.retryTimers()>0,'failed cold startup should auto retry');
}
{
  const h=harness({online:false});
  assert.equal(await h.window.zukaitSessionPrivacy.reconnect(true),false);
  assert.match(h.elements.get('sessionPrivacyMessage').textContent,/no internet/i);
}
console.log('session privacy reconnect regression: PASS');
