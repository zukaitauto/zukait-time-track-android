import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Regression for V415: a real linked balance should never invite a second link.
let html='';
const calls=[],fields={};
const cases=[
 {materialId:'black2k',brandId:'b1',name:'2K BLACK',brand:'2K BLACK',unit:'Liter',category:'Consumable',department:'Painting',linked:true},
 {materialId:'hardener',brandId:'z99',name:'2K Hardener',brand:'Z99',unit:'Liter',category:'Consumable',department:'Painting',linked:false}
];
const window={
 openModal(value){html=value},
 zukaitCloud:{async stockRequest(cmd){
  calls.push(cmd);
  if(cmd.operation==='LEGACY_PREVIEW')return {ok:true,preview:{readOnly:true,items:cases,hasMore:false}};
  if(cmd.operation==='MASTER_LINK'){
   const entry=cases.find(x=>x.materialId===cmd.materialId&&x.brandId===cmd.brandId);
   if(!entry)throw Error('unexpected material');
   entry.linked=true;
   return {ok:true,linked:{linked:true}};
  }
  throw Error('unexpected operation: '+cmd.operation);
 }}
};
const context={window,me:{id:'Manager',role:'Manager'},document:{getElementById:id=>fields[id]||null}};
runInNewContext(readFileSync('app/src/main/assets/consumables_stock_ui.js','utf8'),context);
await window.zukStockLegacyReview();
assert.match(html,/Already linked to Stock — no setup needed/);
assert.doesNotMatch(html,/Stock entry exists/);
assert.doesNotMatch(html,/A new brand starts at ZERO/);
assert.match(html,/linking does not prove or set a physical quantity/i);

let cards=html.split('<div class="zs-card">').slice(1);
assert.equal(cards.length,2);
assert.match(cards[0],/2K BLACK — 2K BLACK/);
assert.match(cards[0],/Current: Painting/);
assert.doesNotMatch(cards[0],/Choose department/);
assert.doesNotMatch(cards[0],/Link Material/);
assert.match(cards[1],/2K Hardener — Z99/);
assert.match(cards[1],/Not linked to Stock/);
assert.match(cards[1],/Choose department/);
assert.match(cards[1],/Link Material/);

await window.zukStockLegacyLink(0);
assert.equal(calls.filter(x=>x.operation==='MASTER_LINK').length,0,'linked item handler cannot send a duplicate request');
fields['zs-legacy-origin-1']={value:'Painting'};
await window.zukStockLegacyLink(1);
const writeCalls=calls.filter(x=>x.operation==='MASTER_LINK');
assert.equal(writeCalls.length,1,'only genuinely unlinked material is linkable');
assert.equal(writeCalls[0].materialId,'hardener');
assert.equal(writeCalls[0].origin,'Painting');
assert.match(html,/2K Hardener — Z99/);
assert.equal((html.match(/Already linked to Stock — no setup needed/g)||[]).length,2);
assert.doesNotMatch(html,/Link Material/);
console.log('PASS linked Stock entries show status only; no duplicate link; unlinked items require explicit department; no stock quantities fabricated');
