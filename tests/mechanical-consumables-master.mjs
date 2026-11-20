import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const C=require('../app/src/main/assets/consumables.js');
const elements=new Map();
const el=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',dataset:{}});return elements.get(id)};
let shown='',saves=0;
const alerts=[];
const state={jobs:[],assign:[]};
const ctx={
 console,me:{id:'M1',role:'Manager'},state,ZukaitConsumables:C,users:[],
 navigator:{onLine:true},window:null,
 alert:x=>alerts.push(String(x)),confirm:()=>true,prompt:()=> 'Stock master entry verified',
 save:()=>{saves++},render:()=>{},setTimeout:fn=>fn(),
 openModal:html=>{shown=html},closeModal:()=>{},
 document:{
  head:{appendChild(){}},createElement:()=>({style:{},classList:{add(){},remove(){}}}),
  getElementById:id=>el(id),querySelectorAll:()=>[]
 }
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('app/src/main/assets/consumables_ui.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('app/src/main/assets/mechanical_consumables_ui.js','utf8'),ctx);
const fill=values=>Object.entries(values).forEach(([id,v])=>el(id).value=v);
ctx.openMechanicalConsumables();
assert.match(shown,/Brands &amp; Price/);
ctx.openMechanicalConsumablesSection('master');
assert.match(shown,/Material Name/);
assert.match(shown,/Brand Name/);
assert.match(shown,/Price \/ Unit OMR/);
assert.match(shown,/Effective From/);
assert.match(shown,/cmCategory/);
assert.match(shown,/<option selected>Consumable<\/option>/,'Mechanical new materials default to Consumable');
assert.match(shown,/onclick="openMechanicalConsumables\(\)"/);

fill({cmMaterial:'Engine Oil 5W-30',cmBrand:'Brand A',cmUnit:'Liter',
 cmCategory:'Consumable',cmPrice:'3.250',cmDate:'2026-11-20'});
ctx.consSaveMaster();
let c=C.ensureState(state);
assert.equal(c.materials.length,1);
assert.equal(c.brands.length,1);
assert.equal(c.prices.length,1);
assert.equal(c.materials[0].unit,'Liter');
assert.equal(c.prices[0].pricePerUnit,3.25);
assert.equal(saves,1);

fill({cmMaterial:'Engine Oil 5W-30',cmBrand:'Brand B',cmUnit:'Liter',
 cmCategory:'Consumable',cmPrice:'3.650',cmDate:'2026-11-20'});
ctx.consSaveMaster();
c=C.ensureState(state);
assert.equal(c.materials.length,1,'second brand does not duplicate material');
assert.equal(c.brands.length,2);
assert.equal(c.prices.length,2);
assert.equal(saves,2);

fill({cmMaterial:'Engine Oil 5W-30',cmBrand:'Brand B',cmUnit:'Liter',
 cmCategory:'Consumable',cmPrice:'4.000',cmDate:'2026-11-20'});
ctx.consSaveMaster();
assert.equal(c.prices.length,2,'duplicate brand + effective date blocked');
assert.equal(saves,2);
assert.ok(alerts.some(x=>x.includes('PRICE_DATE_DUPLICATE')));

fill({cmMaterial:'Engine Oil 5W-30',cmBrand:'Brand B',cmUnit:'Piece',
 cmCategory:'Consumable',cmPrice:'4.000',cmDate:'2026-11-21'});
ctx.consSaveMaster();
assert.equal(c.materials[0].unit,'Liter','material unit cannot be silently changed');
assert.equal(saves,2);

ctx.consOpenMaster(); // nested edit/cancel flow retains mechanical origin
assert.match(shown,/onclick="openMechanicalConsumables\(\)"/);
ctx.openMechanicalConsumablesSection('materialHistory');
assert.match(shown,/VIEW HISTORY/);
assert.match(shown,/onclick="openMechanicalConsumables\(\)"/);
ctx.openConsumablesManager('master');
assert.doesNotMatch(shown,/<option selected>Consumable<\/option>/,'Painting retains its original category default');
assert.match(shown,/onclick="openPaintingConsumables\(\)"/,
 'painting master keeps its original return target');
ctx.openConsumablesManager('material');
assert.match(shown,/onclick="openPaintingConsumables\(\)"/,
 'painting material search keeps its original return target');

ctx.me={id:'S1',role:'Supervisor'};
ctx.openMechanicalConsumables();
assert.doesNotMatch(shown,/Brands & Price/);
const previous=shown;
ctx.openMechanicalConsumablesSection('master');
assert.equal(shown,previous,'Supervisor cannot open Manager master from Mechanical menu');
ctx.consOpenMaster('mechanical');
assert.equal(shown,previous,'Painting master itself remains Manager-only');
assert.equal(saves,2,'no extra data saved by navigation');

console.log('Mechanical Manager Master: shared material creation, 2 brands, units, date guards, Painting navigation and Supervisor denial PASS');
