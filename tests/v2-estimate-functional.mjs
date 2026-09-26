import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const code=fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8');
const bridgeCalls=[];
const bridge={
  printHtml:html=>bridgeCalls.push(['print',html]),
  shareHtmlAsPdf:(html,name)=>bridgeCalls.push(['pdf',name,html]),
  openExternalUrl:url=>bridgeCalls.push(['url',url]),
  shareText:(title,text)=>bridgeCalls.push(['share',title,text])
};
const state={
  estimates:[{
    id:'E1',estimateNo:'Zi-Qt001',date:'2026-09-26',type:'LS',vatEnabled:true,
    customerName:'Test Customer',mobile:'90000000',makeModel:'Toyota Camry',year:'2024',
    registration:'TEST1',vin:'VIN1',claimNo:'CL1',jobCard:'',
    lsRows:[{id:'L1',description:'Repair',amount:100},{id:'L2',description:'Paint',amount:50}],
    labourRows:[],partRows:[],lsSpareParts:30,misc:20,createdBy:'SUP1'
  }],
  estimateAudit:[]
};
const documentStub={
  getElementById(){return null},
  addEventListener(){},
  createElement(){return {set id(v){this._id=v},get id(){return this._id},textContent:'',className:'',style:{},setAttribute(){},appendChild(){}}},
  head:{appendChild(){}},
  documentElement:{},
  querySelectorAll(){return[]}
};
const ctx={
  window:{AndroidBridge:bridge},
  AndroidBridge:bridge,
  state,
  me:{id:'SUP1',role:'Supervisor',name:'Supervisor'},
  document:documentStub,
  MutationObserver:class{constructor(){} observe(){}},
  navigator:{onLine:true,clipboard:{writeText:async()=>{}}},
  localStorage:{getItem(){return null},setItem(){}},
  alert(){},
  openModal(){},
  closeModal(){},
  save(){},
  user(id){return {id,name:id}},
  setTimeout(){return 0},
  clearTimeout(){},
  Date,
  Math,
  JSON,
  String,
  Number,
  Boolean,
  Array,
  Object,
  RegExp,
  encodeURIComponent,
  decodeURIComponent,
  console,
  crypto:{randomUUID:()=> 'uuid-test'}
};
ctx.window.window=ctx.window;
vm.createContext(ctx);
vm.runInContext(code,ctx);

const api=ctx.window.zukaitEstimate;
assert.ok(api,'Estimate API not exported');

const ls=api.totals({
  type:'LS',vatEnabled:true,
  lsRows:[{amount:100},{amount:50}],
  lsSpareParts:30,misc:20
});
assert.equal(ls.labour,150);
assert.equal(ls.parts,30);
assert.equal(ls.misc,20);
assert.equal(ls.subtotal,200);
assert.equal(ls.vat,10);
assert.equal(ls.total,210);

const lsNoVat=api.totals({
  type:'LS',vatEnabled:false,
  lsRows:[{amount:100},{amount:50}],
  lsSpareParts:30,misc:20
});
assert.equal(lsNoVat.total,200);
assert.equal(lsNoVat.vat,0);

const pl=api.totals({
  type:'PL',vatEnabled:true,
  labourRows:[{amount:120},{amount:30}],
  partRows:[{qty:2,unitPrice:50},{qty:3,unitPrice:10}],
  misc:20
});
assert.equal(pl.labour,150);
assert.equal(pl.parts,130);
assert.equal(pl.subtotal,300);
assert.equal(pl.vat,15);
assert.equal(pl.total,315);

const printable=api.printable(state.estimates[0]);
for(const text of ['ZUKAIT INTERNATIONAL LLC','REPAIR ESTIMATE','Zi-Qt001','Test Customer','Toyota Camry','VAT 5%','210.000']){
  assert.ok(printable.includes(text),'Printable estimate missing '+text);
}

api.printEstimate('E1');
assert.equal(bridgeCalls[0][0],'print');
assert.match(bridgeCalls[0][1],/REPAIR ESTIMATE/);

api.pdfEstimate('E1');
assert.deepEqual(bridgeCalls[1].slice(0,2),['pdf','Zi-Qt001.pdf']);

api.whatsApp('E1');
assert.equal(bridgeCalls[2][0],'url');
assert.match(bridgeCalls[2][1],/^https:\/\/wa\.me\/\?text=/);

await api.shareEstimate('E1');
assert.equal(bridgeCalls[3][0],'share');
assert.equal(bridgeCalls[3][1],'Estimate Zi-Qt001');
assert.match(bridgeCalls[3][2],/Total: OMR 210\.000/);

console.log('V2 Estimate functional calculations + Android bridge: ok');
