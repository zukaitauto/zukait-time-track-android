import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from '../scripts/import-vehicle-index.mjs';
const seed=JSON.parse(fs.readFileSync('app/src/main/assets/vehicle_index_pilot.json','utf8'));
const original=JSON.stringify(seed);
const uri=id=>({value:'http://www.wikidata.org/entity/'+id});
const binding=(model,make,label,makeLabel)=>({model:uri(model),make:uri(make),modelLabel:{value:label},makeLabel:{value:makeLabel}});
const rows=[
 binding('Q101','Q201','Toyota Corolla','Toyota'),
 binding('Q102','Q202','Lexus LS','Lexus'),
 binding('Q103','Q203','Lamborghini Miura','Lamborghini'),
 binding('Q104','Q204','Range Rover','Jaguar Land Rover'),
 binding('Q105','Q201','Toyota Corolla','Toyota'),
 binding('Q106','Q202','Lexus IS','Lexus'),
 binding('Q106','Q205','Lexus IS','Different Company'),
 binding('Q107','Q201','Toyota Hilux','Toyota'),
 binding('Q1141487','Q206','Nissan Patrol','Nissan')
];
const raw={results:{bindings:rows}};
const {catalogue:c,report:r}=build(seed,raw,'2026-11-28');
assert.equal(c.makes.length,4);
assert.equal(c.models.length,7);
assert.equal(r.addedModels,4);
assert.equal(r.addedMakes,2);
assert.equal(c.models.find(m=>m.id==='wikidata:Q101').makeId,'make:toyota');
assert.equal(c.models.find(m=>m.id==='wikidata:Q102').name,'LS');
assert.equal(c.models.find(m=>m.id==='wikidata:Q103').name,'Miura');
assert.equal(c.models.find(m=>m.id==='wikidata:Q107').name,'Hilux');
assert.ok(r.skipped.some(x=>x.reason==='make_label_mismatch'));
assert.ok(r.skipped.some(x=>x.reason==='name_collision'));
assert.ok(r.skipped.some(x=>x.reason==='ambiguous_make_or_label'));
assert.ok(r.skipped.some(x=>x.reason==='existing_model_id'));
assert.equal(JSON.stringify(seed),original);
assert.deepEqual(build(seed,{results:{bindings:rows.slice().reverse()}},'2026-11-28').catalogue,c);
assert.throws(()=>build(seed,{results:{bindings:[]}},'2026-11-28'));
assert.throws(()=>build(seed,{results:{bindings:Array(15001).fill(rows[0])}},'2026-11-28'));
assert.equal(c.aliases.length,0);
console.log('Vehicle importer: stable IDs, seed preservation, deterministic deduplication, ambiguous row review, and truncation guard passed');
