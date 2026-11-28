import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),core=require('../app/src/main/assets/vehicle_index.js');
const data=core.validate(JSON.parse(fs.readFileSync('app/src/main/assets/vehicle_index_reviewed.json','utf8')));
assert.equal(data.version,3);assert.equal(data.makes.length,29);assert.equal(data.models.length,294);assert.equal(data.aliases.length,0);
const seed=fs.readFileSync('docs/vehicle-index-reviewed-seed.sql','utf8');
for(const row of [...data.makes,...data.models])assert.ok(seed.includes("'"+row.id+"'"),row.id);
const index=core.create(data);assert.equal(index.resolve('Nissan','Patrol').model,'Patrol');assert.equal(index.resolve('Nissan','Petrol').status,'REVIEW_REQUIRED');assert.equal(index.resolve('Toyota','Land Cruiser').status,'MATCH');assert.ok(index.searchMakes('L').some(x=>x.name==='Lexus'));assert.ok(index.searchMakes('L').some(x=>x.name==='Land Rover'));
console.log('Reviewed QA catalogue: 25 brands and 259 models, seed IDs and exact scoped search verified');

assert.equal(index.resolve('Toyota','Corolla').status,'MATCH');assert.equal(index.resolve('Toyota','Camry').status,'MATCH');assert.equal(index.resolve('Mitsubishi','Pajero').status,'MATCH');assert.equal(index.resolve('Nissan','Altima').status,'MATCH');assert.equal(index.resolve('Lincoln','Navigator').status,'MATCH');assert.ok(index.searchMakes('range rover').some(x=>x.name==='Land Rover'));assert.equal(index.resolve('Range Rover','Sport').status,'REVIEW_REQUIRED');
