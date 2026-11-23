import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const doc=JSON.parse(readFileSync(new URL('../config/consumables-material-master-2026-10-12.json',import.meta.url),'utf8'));
const rows=doc.rows;
assert.equal(rows.length,37,'Approved PDF must contain exactly 37 material/brand combinations');
const keys=rows.map(r=>r.material.trim().toLowerCase()+'|'+r.brand.trim().toLowerCase());
assert.equal(new Set(keys).size,37,'Duplicate material/brand combination');
for(const r of rows){
 assert.ok(r.material&&r.brand);
 assert.ok(['Liter','kg','Piece'].includes(r.unit));
 assert.ok(['Paint','Consumable'].includes(r.category));
 assert.ok(Number.isFinite(r.priceOMR)&&r.priceOMR>=0);
 assert.match(r.effectiveFrom,/^\d{4}-\d{2}-\d{2}$/);
}
for(const [name,unit,price] of [['BASE BLACK','Liter',4.5],['2K BLACK','Liter',4],['Block 80','Piece',0.2]]){
 const r=rows.find(r=>r.material===name&&r.brand===(name==='Block 80'?'3M':name));
 assert.ok(r,name+' not found');assert.equal(r.unit,unit);assert.equal(r.priceOMR,price);
}
console.log('PASS: 37 approved PDF rows, unique identifiers, units and required price corrections');
