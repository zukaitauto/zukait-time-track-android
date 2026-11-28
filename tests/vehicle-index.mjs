import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),api=require('../app/src/main/assets/vehicle_index.js');
const seed=JSON.parse(fs.readFileSync('app/src/main/assets/vehicle_index_pilot.json','utf8'));
const copy=()=>structuredClone(seed),index=api.create(seed);
assert.equal(index.searchMakes('n')[0].name,'Nissan');
assert.equal(index.searchModels('make:toyota','land')[0].name,'Land Cruiser');
assert.equal(index.searchModels('make:nissan','land').length,0);
assert.equal(index.searchModels('make:toyota','J80')[0].id,'wikidata:Q110899968');
assert.equal(index.searchMakes('').length,0);
assert.equal(index.searchMakes('t',1).length,1);
assert.deepEqual(index.resolve(' NISSAN ','patrol'),{status:'MATCH',makeId:'make:nissan',modelId:'wikidata:Q1141487',make:'Nissan',model:'Patrol'});
assert.deepEqual(index.resolve('Nissan','Petrol'),{status:'REVIEW_REQUIRED',enteredMake:'Nissan',enteredModel:'Petrol'});
const approved=copy();
approved.aliases.push({kind:'model',targetId:'wikidata:Q1141487',value:'Petrol',status:'APPROVED',approvedBy:'test-manager',approvedAt:'2026-11-28T00:00:00Z'});
const aliases=api.create(approved);
assert.equal(aliases.resolve('Nissan','Petrol').model,'Patrol');
assert.equal(aliases.resolve('Toyota','Petrol').status,'REVIEW_REQUIRED');
assert.equal(aliases.searchModels('make:nissan','pet')[0].name,'Patrol');
for(const mutate of [
 s=>{s.models[0].makeId='missing'},
 s=>{s.models.push({...s.models[0]})},
 s=>{s.sources[0].license='UNKNOWN'},
 s=>{s.aliases=[{...approved.aliases[0],status:'PENDING'}]},
 s=>{s.aliases=[{...approved.aliases[0],approvedBy:''}]},
 s=>{s.aliases=[{...approved.aliases[0],value:'Patrol'}]},
 s=>{s.aliases=[approved.aliases[0],approved.aliases[0]]}
]){const bad=copy();mutate(bad);assert.throws(()=>api.create(bad))}
const storage={value:null,getItem(){return this.value},setItem(k,v){this.value=v}};
for(const cached of ['{broken',JSON.stringify({...seed,version:999}),JSON.stringify({...approved,version:1}),JSON.stringify({...seed,version:0})]){
 storage.value=cached;const loaded=api.load(seed,storage);
 assert.equal(loaded.version,1);assert.equal(loaded.resolve('Nissan','Petrol').status,'REVIEW_REQUIRED');assert.deepEqual(JSON.parse(storage.value),seed);
}
assert.equal(api.load(seed,{getItem(){throw Error('denied')},setItem(){throw Error('quota')}}).version,1);
assert.throws(()=>{index.searchMakes('n')[0].name='Changed'},TypeError);
assert.equal(seed.makes[0].name,'Nissan');
// Browser script runs without DOM, network, application state or storage access.
const sandbox={window:{},state:Object.freeze({jobs:Object.freeze([])})};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('app/src/main/assets/vehicle_index.js','utf8'),sandbox);
assert.equal(sandbox.window.zukaitVehicleIndex.create(seed).resolve('Nissan','Patrol').status,'MATCH');
console.log('Vehicle index: scoped search, review boundary, provenance validation, immutable rows and cache recovery passed');
