import fs from 'node:fs';
import assert from 'node:assert/strict';

const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');

assert.match(api,/function preservePaintPurchasingHistory\(/,'paint purchasing must have server preservation');
assert.match(api,/\["orders","audit"\]/,'orders and audit must be preserved');
assert.match(api,/candidate\.paintCosting=\{\.\.\.cloneValue\(serverCost\),\.\.\.cloneValue\(incomingCost\)\}/,'server paint costing must survive stale clients');
assert.match(api,/preservePaintPurchasingHistory\(preserveConsumablesHistory\(/,'paint protection must run on every full-state save');

function clone(x){return JSON.parse(JSON.stringify(x));}
function preserve(candidate,current){
  const existing=current?.paintPurchasing;
  const incoming=candidate?.paintPurchasing&&typeof candidate.paintPurchasing==='object'?candidate.paintPurchasing:{};
  if(existing&&typeof existing==='object'){
    for(const key of ['orders','audit']){
      const nextRows=Array.isArray(incoming[key])?incoming[key]:[];
      const serverRows=Array.isArray(existing[key])?existing[key]:[];
      const identity=row=>row?.id?'id:'+String(row.id):'json:'+JSON.stringify(row);
      const byId=new Map(nextRows.map((row,index)=>[identity(row),index]));
      for(const row of serverRows){const id=identity(row);if(!byId.has(id)){byId.set(id,nextRows.length);nextRows.push(clone(row));}}
      if(nextRows.length||serverRows.length||Array.isArray(incoming[key]))incoming[key]=nextRows;
    }
    incoming.schemaVersion=Math.max(Number(incoming.schemaVersion||0),Number(existing.schemaVersion||0),1);
    candidate.paintPurchasing=incoming;
  }
  const serverCost=current?.paintCosting&&typeof current.paintCosting==='object'?current.paintCosting:{};
  const incomingCost=candidate?.paintCosting&&typeof candidate.paintCosting==='object'?candidate.paintCosting:{};
  if(Object.keys(serverCost).length||Object.keys(incomingCost).length)candidate.paintCosting={...clone(serverCost),...clone(incomingCost)};
  return candidate;
}

const po={id:'paint-po-1',poNumber:'PO-Zi001',jobCard:'JC001',status:'Received',receivedAt:123,lines:[{id:'line-1',quantity:.6,pricePerLitre:8,lineTotal:4.8}],returns:[]};
const audit={id:'paint-audit-1',type:'RECEIVED_CONFIRMED',orderId:po.id};
const current={paintPurchasing:{schemaVersion:1,orders:[po],audit:[audit]},paintCosting:{JC001:{netPaintCost:4.8}}};

// Simulate an old/stale device that has never heard of the paint module.
const stale=preserve({jobs:[{no:'JC002'}]},current);
assert.equal(stale.paintPurchasing.orders.length,1);
assert.equal(stale.paintPurchasing.orders[0].receivedAt,123);
assert.equal(stale.paintPurchasing.audit.length,1);
assert.equal(stale.paintCosting.JC001.netPaintCost,4.8);

// A newer device may add another PO without deleting the first.
const newer=preserve({paintPurchasing:{orders:[{id:'paint-po-2',poNumber:'PO-Zi002',jobCard:'JC002'}],audit:[]},paintCosting:{}},current);
assert.deepEqual(new Set(newer.paintPurchasing.orders.map(x=>x.id)),new Set(['paint-po-1','paint-po-2']));
assert.equal(newer.paintPurchasing.audit[0].id,'paint-audit-1');

console.log('paint purchasing stale-device authority regression: PASS');
