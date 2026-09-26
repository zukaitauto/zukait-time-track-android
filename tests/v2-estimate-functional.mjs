import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const code=fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8');
const native=fs.readFileSync('app/src/main/java/com/zukait/timetrack/MainActivity.java','utf8');
const bridgeCalls=[];
const bridge={
  printHtml:html=>bridgeCalls.push(['print',html]),
  shareHtmlAsPdf:(html,name)=>bridgeCalls.push(['pdf',name,html]),
  shareHtmlAsPdfWhatsApp:(html,name)=>bridgeCalls.push(['whatsapp-pdf',name,html]),
  openExternalUrl:url=>bridgeCalls.push(['url',url]),
  shareText:(title,text)=>bridgeCalls.push(['share',title,text])
};
const state={
  estimates:[{
    id:'E1',estimateNo:'Zi-Qt001',date:'2026-09-26',type:'LS',vatEnabled:true,
    customerName:'Test Customer',mobile:'90000000',makeModel:'Toyota Camry',year:'2024',
    registration:'TEST1',vin:'VIN1',claimNo:'CL1',jobCard:'',
    customerSuppliedParts:'Headlamp\\nBracket',notes:'Subject to inspection.',
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

function input(value){return {value:String(value),classList:{contains(){return false}}}}
const domValues={
  estDate:input('2026-09-27'),
  estName:input('Unsaved Customer'),
  estMobile:input('91111111'),
  estMakeModel:input('Lexus LX570'),
  estYear:input('2025'),
  estReg:input('UNSAVED1'),
  estVin:input('VIN-UNSAVED'),
  estClaim:input('CLAIM-NEW'),
  estJobCard:input('JC-NEW'),
  estMiscPl:input('5'),
  estMiscLs:input('0'),
  estLsParts:input('0'),
  estTypePL:{classList:{contains:x=>x==='active'}},
  estVatYes:{classList:{contains:()=>false}}
};
const labRow={getAttribute:()=> 'LAB-X',querySelector:q=>q==='.est-desc'?input('Panel labour'):q==='.est-amount'?input('100'):null};
const partRow={getAttribute:()=> 'PART-X',querySelector:q=>q==='.est-desc'?input('Lamp'):q==='.est-qty'?input('2'):q==='.est-unit'?input('25'):null};
ctx.document.getElementById=id=>domValues[id]||null;
ctx.document.querySelectorAll=sel=>sel==='[data-est-lab-row]'?[labRow]:sel==='[data-est-part-row]'?[partRow]:[];
ctx.window.__zukaitEstimateCurrent='E1';
const unsaved=api.currentOutputEstimate('E1');
assert.equal(unsaved.customerName,'Unsaved Customer');
assert.equal(unsaved.type,'PL');
assert.equal(unsaved.vatEnabled,false);
assert.equal(api.totals(unsaved).total,155);
ctx.document.getElementById=()=>null;
ctx.document.querySelectorAll=()=>[];
ctx.window.__zukaitEstimateCurrent='';

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
for(const text of ['ZUKAIT INTERNATIONAL LLC','REPAIR ESTIMATE','Zi-Qt001','Test Customer','Toyota Camry','Tel No.','Frame / VIN No.','Description','R.O.','Bz.','Total Labour / Lumpsum','SPARE PARTS REQUIRED — TO BE SUPPLIED BY CUSTOMER','Headlamp<br>Bracket','NOTES / CONDITIONS','Subject to inspection.','ESTIMATE VALID FOR 15 DAYS.','VAT 5%','210.000']){
  assert.ok(printable.includes(text),'Printable estimate missing '+text);
}

api.printEstimate('E1');
assert.equal(bridgeCalls[0][0],'print');
assert.match(bridgeCalls[0][1],/REPAIR ESTIMATE/);

api.pdfEstimate('E1');
assert.deepEqual(bridgeCalls[1].slice(0,2),['pdf','Zi-Qt001.pdf']);

api.whatsApp('E1');
assert.deepEqual(bridgeCalls[2].slice(0,2),['whatsapp-pdf','Zi-Qt001.pdf']);
assert.match(bridgeCalls[2][2],/REPAIR ESTIMATE/);

await api.shareEstimate('E1');
assert.equal(bridgeCalls[3][0],'share');
assert.equal(bridgeCalls[3][1],'Estimate Zi-Qt001');
assert.match(bridgeCalls[3][2],/Total: OMR 210\.000/);

for(const required of ['public void shareHtmlAsPdfWhatsApp(String html, String filename)','whatsApp.setPackage("com.whatsapp")','whatsAppBusiness.setPackage("com.whatsapp.w4b")','public void openExternalUrl(String url)','public void shareText(String title, String text)','int pageCount = Math.max(1','for (int pageIndex = 0; pageIndex < pageCount; pageIndex++)']) {
  assert.ok(native.includes(required),'Android Estimate integration missing '+required);
}
console.log('V2 Estimate functional calculations + Android bridge: ok');
