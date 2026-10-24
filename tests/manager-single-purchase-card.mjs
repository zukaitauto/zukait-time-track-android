import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const suite=fs.readFileSync('tests/spare-parts-expense-filters.mjs','utf8');
const prefix=suite.slice(0,suite.indexOf('const body='));
const {context,fields}=await import('data:text/javascript;base64,'+Buffer.from(prefix+'\nexport {context,fields};').toString('base64'));
const source=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
context.Date=class extends Date{constructor(...a){super(...(a.length?a:['2026-10-05T08:00:00Z']))}static now(){return Date.parse('2026-10-05T08:00:00Z')}};
context.state.sublets=[{id:'s1',jobCard:'11975',date:'2026-10-05',amountMills:5000},{id:'s2',jobCard:'11975',date:'2026-10-01',amountMills:2000}];
const panel={innerHTML:''},root={querySelector:()=>panel};
context.document.getElementById=id=>id==='managerView'?root:fields.get(id);
let removed=0;
context.document.querySelectorAll=selector=>selector.includes('.v134-capacity')&&removed===0?[{remove(){removed++}}]:[];
const begin=source.indexOf('/* V134 MANAGER AVAILABLE CAPACITY TODAY'),end=source.indexOf('window.v134ManagerCapacity=true;',begin)+'window.v134ManagerCapacity=true;'.length;
vm.runInContext(source.slice(source.indexOf('(function()',begin),source.indexOf('})();',end)+5),context);
context.v134ApplyManagerCapacity();context.v134ApplyManagerCapacity();assert.equal(removed,1,'legacy duplicate is removed safely on repeated refreshes');
const snapshot=JSON.stringify(context.state);
for(const [range,amount,subtitle] of [['month','37.000','This Month'],['today','5.000','Today'],['month','37.000','This Month']]){
 context.v123ManagerPerformanceRange(range);
 assert.equal((panel.innerHTML.match(/<span>Purchase Expenses<\/span>/g)||[]).length,1,'one purchase card per render');
 assert.doesNotMatch(panel.innerHTML,/Total Purchase Amount/);
 assert.match(panel.innerHTML,new RegExp(amount.replace('.','\\.')+' OMR'));
 assert.ok(panel.innerHTML.includes(subtitle+' · Parts + Sublet'));
 let modal='';context.openModal=html=>modal=html;
 await context.v123ManagerPerformanceOpen('purchase');
 assert.ok(modal.includes('<option value="'+range+'" selected>'),'detail period matches selected dashboard period');
}
assert.equal(JSON.stringify(context.state),snapshot,'presentation changes preserve all purchase records');
console.log('Single Manager purchase card: duplicate cleanup, Today/Month parts + sublet amounts, matching detail period and read-only behavior passed.');
