import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('app/src/main/assets/mechanical_consumables_ui.js','utf8');
function setup(role='Mechanical Supervisor',enabled=true){
 const map=new Map();
 const el=id=>{if(!map.has(id))map.set(id,{value:'',textContent:'',innerHTML:'',disabled:false});return map.get(id)};
 const payloads=[];let attempts=0;
 const state={consumables:{
   materials:[{id:'oil',name:'Engine Oil 5W-30',unit:'Liter'},{id:'wd',name:'WD-40 Can',unit:'Piece'}],
   brands:[{id:'brand1',name:'Brand A'},{id:'brand2',name:'Brand B'}],
   prices:[{materialId:'oil',brandId:'brand1',pricePerUnit:5.5},
           {materialId:'oil',brandId:'brand2',pricePerUnit:7},
           {materialId:'wd',brandId:'brand1',pricePerUnit:2}]
 }};
 let lastHtml='';
 const ctx={me:{id:'MS1',role},state,navigator:{onLine:true},console,
   openModal:html=>{lastHtml=html},closeModal:()=>{},
   document:{getElementById:el,querySelector:()=>null},
   ZUKAIT_MECHANICAL_STOCK_ENABLED:enabled,
   zukaitCloud:{
     async stockRequest(x){
       payloads.push(x);
       if(x.operation==='BALANCE')return {ok:true,item:{physical:10,reserved:2,unit:'Liter'}};
       if(x.operation==='WRITE'){
         attempts++;
         if(attempts===1)throw Error('Simulated connection timeout');
         return {ok:true,receipt:{jobCard:x.data.jobCard,lineCount:x.data.lines.length,final:true,totalCost:27.5,issueId:100}};
       }
       throw Error('Unexpected action');
     }
   }
 };
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,el,payloads,html:()=>lastHtml,attempts:()=>attempts};
}
const {ctx,el,payloads,html,attempts}=setup();
ctx.openMechanicalConsumablesSection('issued');
assert.match(html(),/Mechanical Job Card/);
assert.match(html(),/id="mcConsSubmit"/);
assert.doesNotMatch(html(),/not enabled/);
el('mcConsJc').value='JC12500';
el('mcConsMaterial').value='oil';
el('mcConsBrand').value='brand1';
el('mcConsQuantity').value='4.5';
ctx.mechanicalConsumablesAddLine();
assert.equal(el('mcConsSubmit').disabled,false);
assert.match(el('mcConsDraft').innerHTML,/Brand A/);
await ctx.mechanicalConsumablesSubmitIssue();
assert.match(el('mcConsWarning').textContent,/Retry uses the same request ID/);
assert.match(el('mcConsDraft').innerHTML,/Brand A/);
await ctx.mechanicalConsumablesSubmitIssue();
assert.match(el('mcConsWarning').textContent,/ISSUED — JC12500/);
assert.match(el('mcConsDraft').innerHTML,/No materials added/);
assert.equal(el('mcConsSubmit').disabled,true);
assert.equal(attempts(),2);
const writes=payloads.filter(x=>x.operation==='WRITE');
assert.equal(writes.length,2);
assert.equal(writes[0].requestId,writes[1].requestId,'retry must reuse request ID');
assert.equal(writes[0].command,'MECHANICAL_ISSUE');
assert.deepEqual(JSON.parse(JSON.stringify(writes[0].data)),{
 jobCard:'JC12500',kind:'issued',
 lines:[{materialId:'oil',brandId:'brand1',quantity:4.5}]
});
assert.equal(payloads.filter(x=>x.operation==='BALANCE').length,2,'only selected brand queried on open and after issue');
const disabled=setup('Mechanical Supervisor',false);
disabled.ctx.openMechanicalConsumablesSection('issued');
assert.match(disabled.html(),/ISSUE MATERIALS \(not enabled\)/);
assert.equal(disabled.payloads.length,0,'disabled-by-default: no reads or writes');
const other=setup('Supervisor',true);
other.ctx.openMechanicalConsumablesSection('issued');
other.el('mcConsMaterial').value='oil';other.el('mcConsBrand').value='brand1';
other.el('mcConsQuantity').value='1';other.ctx.mechanicalConsumablesAddLine();
assert.equal(other.el('mcConsSubmit').disabled,true,'Bodyshop Supervisor cannot issue Mechanical materials');
assert.equal(other.payloads.length,0);
console.log('Mechanical one-tap issue: stock lookup, one batch, retry-id preservation and default-off safeguards PASSED');
