import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),core=require('../app/src/main/assets/vehicle_index.js');
const data=core.validate(JSON.parse(fs.readFileSync('app/src/main/assets/vehicle_index_reviewed.json','utf8')));
assert.equal(data.version,5);assert.equal(data.makes.length,51);assert.equal(data.models.length,429);assert.equal(data.aliases.length,0);
const seed=fs.readFileSync('docs/vehicle-index-reviewed-seed.sql','utf8');
for(const row of [...data.makes,...data.models])assert.ok(seed.includes("'"+row.id+"'"),row.id);
const index=core.create(data);assert.equal(index.resolve('Nissan','Patrol').model,'Patrol');assert.equal(index.resolve('Nissan','Petrol').status,'REVIEW_REQUIRED');assert.equal(index.resolve('Toyota','Land Cruiser').status,'MATCH');assert.ok(index.searchMakes('L').some(x=>x.name==='Lexus'));assert.ok(index.searchMakes('L').some(x=>x.name==='Land Rover'));
console.log('Reviewed QA catalogue: 51 brands and 429 models, seed IDs and exact scoped search verified');

assert.equal(index.resolve('Toyota','Corolla').status,'MATCH');assert.equal(index.resolve('Toyota','Camry').status,'MATCH');assert.equal(index.resolve('Mitsubishi','Pajero').status,'MATCH');assert.equal(index.resolve('Nissan','Altima').status,'MATCH');assert.equal(index.resolve('Lincoln','Navigator').status,'MATCH');assert.ok(index.searchMakes('range rover').some(x=>x.name==='Land Rover'));assert.equal(index.resolve('Range Rover','Sport').status,'REVIEW_REQUIRED');

for(const [make,model] of [["MG","ZS"],["Isuzu","D-MAX"],["Renault","Duster"],["Chery","Tiggo 7"],["GAC","GS3 Emzoom"],["GMC","Sierra"],["Mitsubishi","L200"],["Hyundai","Elantra"],["Mazda","CX-5"]])assert.equal(index.resolve(make,model).status,'MATCH');

const mazda=data.makes.find(x=>x.name==='Mazda');assert.equal(index.resolve('Mazda','2').status,'MATCH');assert.equal(index.resolve('Mazda','CX-9').status,'MATCH');assert.ok(index.searchModels(mazda.id,'cx9').some(x=>x.name==='CX-9'));assert.equal(index.resolve('Mazda','CX9').status,'REVIEW_REQUIRED');

for(const [make,model] of [["Jetour","T2 i-DM"],["BAIC","BJ30 Hybrid"],["JAC","JS3 Pro"],["Skoda","Kodiaq"],["Peugeot","2008"],["Volvo","XC40"],["Volvo","XC90"],["Cadillac","XT4"],["Dodge","Hornet"],["Dodge","Challenger"],["Ram","1500"],["Hummer","H1"],["Saab","92"],["Mercury","Cougar"],["Pontiac","GTO"],["Oldsmobile","Cutlass 442"],["Jaguar","F-PACE"],["MINI","Cooper"],["Infiniti","Q50"],["Infiniti","QX60"],["Infiniti","QX70"]])assert.equal(index.resolve(make,model).status,'MATCH',make+' '+model);
assert.equal(index.resolve('Hummer','H3').status,'MATCH');assert.equal(index.resolve('GMC','Hummer EV SUV').status,'MATCH');assert.equal(index.resolve('GMC','H3').status,'REVIEW_REQUIRED');
