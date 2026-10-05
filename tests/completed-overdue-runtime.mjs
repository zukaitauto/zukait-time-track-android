import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const full=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
new vm.Script(full); // Guard the whole loaded file, not only an extracted module.
const source=full.slice(full.indexOf('/* V270 MANAGER OVERDUE TIME REVIEW'),full.indexOf('/* V271 SUPERVISOR'))+full.slice(full.indexOf('/* V273 MANAGER TIME ATTENTION'));
let modal='',saved=0;const timers=[];
const context={console,Date,Math,Set,String,Number,Array,state:{jobs:[{no:'JC1',delivered:true,vehicle:'Test Car',reg:'123'}],assign:[{id:'a1',job:'JC1',emp:'e1',completed:true,suggested:60}],sessions:[{assignmentId:'a1',job:'JC1',emp:'e1',start:1,end:5400001}]},me:{id:'m1',role:'Manager'},
 user:()=>({name:'Worker'}),totalForAssignment:()=>90,fmt:m=>m+'m',openModal:s=>modal=s,save(){saved++},confirm:()=>true,alert:s=>{throw Error(s)},
 setTimeout:f=>timers.push(f),document:{getElementById:()=>null,head:{appendChild(){}},createElement:()=>({})},window:{render(){}}};
context.window=context;vm.runInNewContext(source,context);
context.v273OpenTimeAttention('completed');assert.match(modal,/REVIEW/);
context.v270OpenReview('a1');assert.match(modal,/Delivered Vehicle Time Review/);assert.match(modal,/Test Car/);assert.match(modal,/90m/);
for(const [,handler] of modal.matchAll(/onclick="([^"]*)"/g))new vm.Script(handler.replace(/&#39;/g,"'"));
context.v270MarkReviewed('a1');assert.equal(saved,1);assert.match(modal,/No delivered vehicles are waiting for time review/);
const tile={id:'',type:'',className:'',style:{},textContent:'⚠ Attention0Jobs needing review›',innerHTML:'',closest:()=>null};
const duplicate={...tile,style:{},textContent:'⚠ Attention0Jobs needing review›'};
let placements=0;
const request={textContent:'Employee Requests',nextElementSibling:null,insertAdjacentElement(position,element){assert.equal(position,'afterend');assert.equal(element,tile);this.nextElementSibling=element;placements++},closest:()=>null};
const root={querySelector:s=>s==='#v273TimeAttentionTile'&&tile.id==='v273TimeAttentionTile'?tile:null,querySelectorAll:()=>[tile,duplicate,request]};
context.document.getElementById=id=>id==='managerView'?root:null;
context.v273SettleTimeAttention();assert.equal(tile.id,'v273TimeAttentionTile');assert.equal(tile.style.display,'');assert.equal(duplicate.style.display,'none');
// Real textContent has no whitespace between the title and count, and the
// subtitle itself contains "over-allocated". Neither may hide the canonical tile.
tile.textContent='⚠ Time Attention0Completed overdue · over-allocated · other›';
context.v273SettleTimeAttention();context.v270Inject();assert.equal(tile.style.display,'');
assert.equal(placements,1,'review is a stable sibling after Employee Requests');
assert.equal(request.nextElementSibling,tile);assert.match(tile.className,/v273-delivered-review/);
assert.match(full,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
tile.onclick({preventDefault(){},stopPropagation(){}});assert.match(modal,/Delivered Vehicle Time Review/);
assert.doesNotMatch(modal,/v273-tabs/);
console.log('PASS: full script parses, actual/suggested review details, legacy routes, executable action handlers, reviewed return to Completed Overdue.');
