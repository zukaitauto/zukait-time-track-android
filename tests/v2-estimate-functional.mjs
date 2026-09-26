import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const code=fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8');
const native=fs.readFileSync('app/src/main/java/com/zukait/timetrack/MainActivity.java','utf8');
const bridgeCalls=[];
const bridge={
  printHtml:html=>bridgeCalls.push(['print',html]),
  printHtmlNamed:(html,title)=>bridgeCalls.push(['print-named',title,html]),
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
    customerSuppliedParts:'Headlamp\nBracket',notes:'Subject to inspection.',
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
const plPrintable=api.printable({
  id:'EPL',estimateNo:'Zi-Qt002',date:'2026-09-26',type:'PL',vatEnabled:true,
  customerName:'PL Customer',mobile:'92222222',makeModel:'Lexus LX570',year:'2025',
  registration:'PL-1',vin:'VIN-PL',claimNo:'CLAIM-PL',jobCard:'',
  labourRows:[{id:'A',description:'Denting',amount:120},{id:'B',description:'Painting',amount:30}],
  partRows:[{id:'P1',description:'Headlamp',qty:2,unitPrice:50},{id:'P2',description:'Bracket',qty:3,unitPrice:10}],
  misc:20,createdBy:'SUP1'
});
for(const text of ['LABOUR','SPARE PARTS','Denting','Painting','Headlamp','Bracket','Qty','Unit Price','Total Labour','Total Parts','Subtotal','VAT 5%','GRAND TOTAL','315.000']){
  assert.ok(plPrintable.includes(text),'PL printable missing '+text);
}
const plNoVat=api.printable({
  id:'EPL2',estimateNo:'Zi-Qt003',date:'2026-09-26',type:'PL',vatEnabled:false,
  customerName:'No VAT',mobile:'',makeModel:'Toyota Hilux',year:'2024',registration:'NV1',vin:'',claimNo:'',jobCard:'',
  labourRows:[{id:'A',description:'Labour',amount:10}],
  partRows:[{id:'P',description:'Part',qty:1,unitPrice:5}],misc:0,createdBy:'SUP1'
});
assert.equal(plNoVat.includes('VAT 5%'),false,'No-VAT PL print must hide VAT row');

const longParts=Array.from({length:120},(_,i)=>({id:'PX'+i,description:'Part '+String(i+1).padStart(3,'0'),qty:1,unitPrice:1}));
const longPl=api.estimateDocumentHtml({
  id:'ELONG',estimateNo:'Zi-Qt004',date:'2026-09-26',type:'PL',vatEnabled:true,
  customerName:'Long Estimate',mobile:'',makeModel:'Vehicle',year:'2025',registration:'LONG1',vin:'',claimNo:'',jobCard:'',
  labourRows:[{id:'L',description:'Long labour',amount:10}],partRows:longParts,misc:0,createdBy:'SUP1'
});
assert.ok(longPl.includes('Part 001'),'Long PL output must contain first part');
assert.ok(longPl.includes('Part 120'),'Long PL output must contain final part');
assert.ok(native.includes('int pageCount = Math.max(1'),'Android PDF renderer must calculate multiple pages');
assert.ok(native.includes('pageIndex < pageCount'),'Android PDF renderer must render every calculated page');

const printable=api.printable(state.estimates[0]);
for(const text of ['ZUKAIT INTERNATIONAL LLC','REPAIR ESTIMATE','Zi-Qt001','Test Customer','Toyota Camry','Tel No.','Frame / VIN No.','Description','R.O.','Bz.','Total Labour / Lumpsum','SPARE PARTS REQUIRED — TO BE SUPPLIED BY CUSTOMER','Headlamp<br>Bracket','NOTES / CONDITIONS','Subject to inspection.','ESTIMATE VALID FOR 15 DAYS.','VAT 5%']){
  assert.ok(printable.includes(text),'Printable estimate missing '+text);
}
assert.ok(printable.includes('<tr class="grand summary-row"><th>TOTAL</th><td class="money-cell">210</td><td class="money-cell">000</td></tr>'),'LS total must print in R.O. / Bz. columns');
assert.ok(printable.includes('<tr class="summary-row"><th>VAT 5%</th><td class="money-cell">10</td><td class="money-cell">000</td></tr>'),'LS VAT must print in R.O. / Bz. columns');

api.printEstimate('E1');
assert.deepEqual(bridgeCalls[0].slice(0,2),['print-named','Estimate Zi-Qt001']);
assert.match(bridgeCalls[0][2],/REPAIR ESTIMATE/);

api.pdfEstimate('E1');
assert.deepEqual(bridgeCalls[1].slice(0,2),['pdf','Zi-Qt001.pdf']);

api.whatsApp('E1');
assert.deepEqual(bridgeCalls[2].slice(0,2),['whatsapp-pdf','Zi-Qt001.pdf']);
assert.match(bridgeCalls[2][2],/REPAIR ESTIMATE/);

await api.shareEstimate('E1');
assert.equal(bridgeCalls[3][0],'share');
assert.equal(bridgeCalls[3][1],'Estimate Zi-Qt001');
assert.match(bridgeCalls[3][2],/Total: OMR 210\.000/);

for(const required of ['public void printHtmlNamed(String html, String title)','public void shareHtmlAsPdfWhatsApp(String html, String filename)','whatsApp.setPackage("com.whatsapp")','whatsAppBusiness.setPackage("com.whatsapp.w4b")','public void openExternalUrl(String url)','public void shareText(String title, String text)','int pageCount = Math.max(1','for (int pageIndex = 0; pageIndex < pageCount; pageIndex++)']) {
  assert.ok(native.includes(required),'Android Estimate integration missing '+required);
}
console.log('V2 Estimate functional calculations + Android bridge: ok');
