import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const full=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
new vm.Script(full); // Guard the whole loaded file, not only an extracted module.
const source=full.slice(full.indexOf('/* V270 MANAGER OVERDUE TIME REVIEW'),full.indexOf('/* V271 SUPERVISOR'))+full.slice(full.indexOf('/* V273 MANAGER TIME ATTENTION'));
let modal='',saved=0;const timers=[];
const context={console,Date,Math,Set,String,Number,Array,state:{jobs:[{no:'JC1',vehicle:'Test Car',reg:'123'}],assign:[{id:'a1',job:'JC1',emp:'e1',completed:true,suggested:60}],sessions:[{assignmentId:'a1',job:'JC1',emp:'e1',start:1,end:5400001}]},me:{id:'m1',role:'Manager'},
 user:()=>({name:'Worker'}),totalForAssignment:()=>90,fmt:m=>m+'m',openModal:s=>modal=s,save(){saved++},confirm:()=>true,alert:s=>{throw Error(s)},
 setTimeout:f=>timers.push(f),document:{getElementById:()=>null,head:{appendChild(){}},createElement:()=>({})},window:{render(){}}};
context.window=context;vm.runInNewContext(source,context);
context.v273OpenTimeAttention('completed');assert.match(modal,/REVIEW/);
context.v270OpenReview('a1');assert.match(modal,/Completed Overdue Review/);assert.match(modal,/Test Car/);assert.match(modal,/90m/);
for(const [,handler] of modal.matchAll(/onclick="([^"]*)"/g))new vm.Script(handler.replace(/&#39;/g,"'"));
context.v270MarkReviewed('a1');assert.equal(saved,1);assert.match(modal,/No completed overdue reviews pending/);
console.log('PASS: full script parses, actual/suggested review details, legacy routes, executable action handlers, reviewed return to Completed Overdue.');
