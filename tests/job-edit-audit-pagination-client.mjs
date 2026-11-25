import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const source=fs.readFileSync('app/src/main/assets/job_card_edit.js','utf8');
const dom=new JSDOM('<div id="modal"></div>',{url:'https://qa.invalid',runScripts:'outside-only'});
const w=dom.window;
w.me={id:'QA',role:'Manager'};
w.zukaitAuth={getToken:()=> 'qa-session'};
w.openModal=html=>w.document.querySelector('#modal').innerHTML=html;
w.closeModal=()=>w.document.querySelector('#modal').replaceChildren();
w.alert=message=>{throw Error(message)};
w.state={jobEdits:[{job:'JC1',at:1,reason:'Cached record'},{job:'JC2',reason:'Other job'}]};
let calls=[],mode='normal';
const item=(audit_position,reason)=>({audit_position,payload:{job:'JC1',at:1,reason,old:{notes:'before'},newValue:{notes:'after'}}});
w.fetch=async(_url,opts)=>{
 const body=JSON.parse(opts.body);calls.push(body);
 if(body.operation==='GET')return {ok:true,status:200,json:async()=>({ok:true,job:{no:'JC1'}})};
 let status=200,result;
 if(mode==='denied'){status=403;result={ok:false,code:'job_edit_forbidden'};}
 else if(mode==='offline'){status=503;result={ok:false,code:'audit_history_unavailable'};}
 else if(mode==='stale'&&body.before_position){status=409;result={ok:false,code:'audit_revision_changed'};}
 else if(body.before_position)result={ok:true,revision:7,rows:[item(3,'Older record')],next_position:null};
 else result={ok:true,revision:7,rows:[item(5,'<img src=x onerror=alert(1)>'),item(4,'Recent record')],next_position:4};
 return {ok:status===200,status,json:async()=>result};
};
const click=async id=>{w.document.getElementById(id).click();await new Promise(resolve=>setTimeout(resolve,0));};
const panel=()=>w.document.querySelector('#jce-history-panel');
try{
 w.eval(source);
 await w.zukaitJobEdit.view('JC1');
 assert.equal(calls.length,1,'history must be fetched only on demand');
 await click('jce-view-history');
 assert.equal(calls.at(-1).action,'job_edit_audit_page');
 assert.equal(calls.at(-1).limit,25);
 assert.equal(panel().querySelectorAll('details').length,2);
 assert.equal(panel().querySelector('img'),null,'untrusted audit content must be escaped');
 await click('jce-history-next');
 assert.equal(calls.at(-1).before_position,4);
 assert.equal(calls.at(-1).expected_revision,7);
 assert.equal(panel().querySelectorAll('details').length,3);
 assert.equal(w.document.getElementById('jce-history-next'),null);
 mode='stale';await w.zukaitJobEdit.view('JC1');await click('jce-view-history');await click('jce-history-next');
 assert.match(panel().textContent,/Workshop data changed/);
 assert.equal(panel().querySelectorAll('details').length,0);
 mode='offline';await w.zukaitJobEdit.view('JC1');await click('jce-view-history');
 assert.match(panel().textContent,/cached records only/i);
 assert.equal(panel().querySelectorAll('details').length,1);
 assert.doesNotMatch(panel().textContent,/Other job/);
 mode='denied';await w.zukaitJobEdit.view('JC1');await click('jce-view-history');
 assert.match(panel().textContent,/History access denied/);
 assert.equal(panel().querySelectorAll('details').length,0);
 w.me.role='Supervisor';await w.zukaitJobEdit.view('JC1');
 assert.equal(w.document.getElementById('jce-view-history'),null);
 console.log('Job edit audit history: lazy load, pagination, stale reset, fallback, permission denial and escaped output passed.');
}finally{dom.window.close();}
