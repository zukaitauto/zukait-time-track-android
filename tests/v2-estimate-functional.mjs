import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const code=fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8');
const native=fs.readFileSync('app/src/main/java/com/zukait/timetrack/MainActivity.java','utf8');
const bridgeCalls=[];let modalHtml='',messages=[];const recovery=new Map();
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
  localStorage:{getItem:key=>recovery.get(key)||null,setItem:(key,value)=>recovery.set(key,value),removeItem:key=>recovery.delete(key)},
  alert:text=>messages.push(text),
  openModal:html=>modalHtml=html,
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
assert.ok(native.includes('zukaitReportPdf.generate('),'Android print renderer must retain every document page');
assert.ok(native.includes('verifyVisiblePdf(pdfFile)'),'Android export must validate visible PDF content before sharing');

const printable=api.printable(state.estimates[0]);
for(const text of ['ZUKAIT INTERNATIONAL LLC','REPAIR ESTIMATE','Zi-Qt001','Test Customer','Toyota Camry','Phone','VIN','Description','Amount OMR','Total Labour / Lumpsum','SPARE PARTS REQUIRED — TO BE SUPPLIED BY CUSTOMER','Headlamp<br>Bracket','NOTES / CONDITIONS','Subject to inspection.','ESTIMATE VALID FOR 15 DAYS.','VAT 5%']){
  assert.ok(printable.includes(text),'Printable estimate missing '+text);
}
assert.match(printable,/<tr class="grand summary-row"><th>TOTAL[^]*?<\/th><td class="money-cell">210\.000<\/td><\/tr>/,'LS total must print three OMR decimal places in one amount column');
assert.match(printable,/<tr class="summary-row"><th>VAT 5%[^]*?<\/th><td class="money-cell">10\.000<\/td><\/tr>/,'LS VAT must print three OMR decimal places');

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

for(const required of ['public void printHtmlNamed(String html, String title)','public void shareHtmlAsPdfWhatsApp(String html, String filename)','whatsApp.setPackage("com.whatsapp")','whatsAppBusiness.setPackage("com.whatsapp.w4b")','public void openExternalUrl(String url)','public void shareText(String title, String text)','WebViewAssetLoader.AssetsPathHandler','verifyVisiblePdf(pdfFile)','zukaitReportPdf.generate(']) {
  assert.ok(native.includes(required),'Android Estimate integration missing '+required);
}
console.log('V2 Estimate functional calculations + Android bridge: ok');

// The same self-contained branding/footer must survive native WebViews with a null base URL.
const branded=api.estimateDocumentHtml(state.estimates[0]);
assert.match(branded,/<image href="data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+" width="529.6" height="142"\/>/);
assert.match(branded,/viewBox="0 0 529.6 142"/,'Crop only the source side margins so branding aligns with the content borders');
assert.match(branded,/class="letterhead-artwork"/);
for(const text of ['P.O. Box 1921','Barka','Postal Code 130','C.R.N. 1194220','92403420, 72440918','Authorized Signed']) assert.ok(branded.includes(text),text);
assert.ok(!plPrintable.includes('<b>Type:</b>'));
assert.ok(!plPrintable.includes('<b>VAT:</b>'));
assert.ok(plNoVat.includes('NOTES / CONDITIONS'),'Notes area remains present when empty');
assert.ok(!plNoVat.includes('<b>VAT:</b>'));
const escaped=api.estimateDocumentHtml({...state.estimates[0],customerName:'<script>alert(1)</script>',notes:'<img src=x onerror=alert(1)>',lsRows:[{description:'<unsafe>',amount:1}]});
assert.ok(escaped.includes('&lt;script&gt;'));
assert.ok(escaped.includes('&lt;unsafe&gt;'));
assert.ok(!escaped.includes('<script>'));
assert.match(branded,/\.estimate-print thead\{display:table-header-group\}/);
console.log('V2 Estimate self-contained print branding, footer, empty notes and escaping: ok');

const partsHidden=api.printable({...state.estimates[0],showCustomerSuppliedParts:false});
assert.ok(!partsHidden.includes('SPARE PARTS REQUIRED — TO BE SUPPLIED BY CUSTOMER'));
assert.ok(!partsHidden.includes('Headlamp<br>Bracket'));
assert.ok(api.printable({...state.estimates[0],showCustomerSuppliedParts:true}).includes('Headlamp<br>Bracket'));
assert.ok(!api.printable({...state.estimates[0],customerSuppliedParts:''}).includes('SPARE PARTS REQUIRED — TO BE SUPPLIED BY CUSTOMER'));
for(const removed of ['ISSUED TO','VEHICLE DETAILS','All amounts in OMR','background:#202523','background:#f0f2f1']) assert.ok(!branded.includes(removed),removed);
assert.ok(plPrintable.includes('Unit Price OMR'));
assert.ok(plPrintable.includes('Amount OMR'));
assert.ok(branded.includes('Amount OMR'));
domValues.estShowCustomerParts={checked:false};
domValues.estCustomerParts=input('Keep this optional text');
domValues.estCustomerPartsBox={hidden:false};
ctx.document.getElementById=id=>domValues[id]||null;
ctx.window.__zukaitEstimateCurrent='E1';
api.toggleCustomerParts();
assert.equal(domValues.estCustomerPartsBox.hidden,true);
const hiddenDraft=api.currentOutputEstimate('E1');
assert.equal(hiddenDraft.showCustomerSuppliedParts,false);
assert.equal(hiddenDraft.customerSuppliedParts,'Keep this optional text');
assert.ok(!api.estimateDocumentHtml(hiddenDraft).includes('Keep this optional text'));
domValues.estShowCustomerParts.checked=true;
api.toggleCustomerParts();
assert.equal(domValues.estCustomerPartsBox.hidden,false);
const visibleDraft=api.currentOutputEstimate('E1');
assert.equal(visibleDraft.showCustomerSuppliedParts,true);
assert.ok(api.estimateDocumentHtml(visibleDraft).includes('Keep this optional text'));
assert.equal(state.estimates[0].customerSuppliedParts,'Headlamp\nBracket','Toggling a draft must not erase saved text');
ctx.document.getElementById=()=>null;
ctx.window.__zukaitEstimateCurrent='';
console.log('V2 Estimate optional customer parts checkbox and simplified presentation: ok');

// Print-only blank lines must not become saved items or alter totals.
assert.equal((plPrintable.match(/class="blank-print-row"/g)||[]).length,0);
assert.equal((printable.match(/class="blank-print-row"/g)||[]).length,0);
assert.ok(!longPl.includes('class="blank-print-row"'));
assert.match(branded,/size:A4;margin:0/);
assert.equal(api.totals(state.estimates[0]).total,210);
console.log('V2 Estimate content-driven tables, A4 margins and unchanged totals: ok');


const zeroParts=api.printable({...state.estimates[0],lsSpareParts:0});
assert.ok(!zeroParts.includes('Spare Parts / Lumpsum'),'Zero lump-sum parts must not create an empty parts section');
assert.ok(api.printable({...state.estimates[0],lsSpareParts:30}).includes('Spare Parts / Lumpsum'));
assert.ok(!zeroParts.includes('R.O.')&&!zeroParts.includes('Bz.'),'Amount headings must use a single OMR column');

state.estimates[0].status='Saved';
state.estimates.push({...structuredClone(state.estimates[0]),id:'UNSAVED',estimateNo:'Zi-Qt016',status:'Draft',makeModel:'RAV4'});
await api.openRecent();assert.ok(!modalHtml.includes('Zi-Qt016'),'Unsaved draft must not appear in Recent Estimates');
await api.openDrafts();assert.ok(modalHtml.includes('Zi-Qt016'));assert.ok(modalHtml.includes('Draft — not saved'));
let dirty=false,syncCalls=0;
ctx.save=()=>{dirty=true};
ctx.window.zukaitCloud={get dirty(){return dirty},async syncNow(){syncCalls++;dirty=false}};
ctx.document.getElementById=id=>domValues[id]||null;
ctx.document.querySelectorAll=sel=>sel==='[data-est-lab-row]'?[labRow]:sel==='[data-est-part-row]'?[partRow]:[];
ctx.window.__zukaitEstimateCurrent='UNSAVED';
await api.saveCurrent('UNSAVED');
assert.ok(messages.at(-1).includes('saved on the server'));assert.equal(syncCalls,1);assert.equal(state.estimates.find(e=>e.id==='UNSAVED').status,'Saved');
assert.ok(recovery.get('zukait_estimate_recovery_v1:SUP1').includes('UNSAVED'),'Confirmed estimate must retain a separate local recovery copy');
ctx.window.zukaitCloud.syncNow=async()=>{dirty=false;state.estimates=state.estimates.filter(e=>e.id!=='UNSAVED')};
await api.saveCurrent('UNSAVED');
assert.ok(!messages.at(-1).includes('saved on the server'),'Remote loss must not be reported as a successful save');
assert.equal(state.estimates.find(e=>e.id==='UNSAVED').status,'Draft','Missing remote quote must remain recoverable as local draft');
console.log('PASS: Draft/Recent separation, server-confirmed save, failed confirmation and local recovery');

await import('./estimate-history-authority.mjs');

ctx.window.confirm=()=>true;let deletedCalls=0;
ctx.window.zukaitReception={async action(body){deletedCalls++;return {ok:true,deleted_id:body.estimate_id}}};
ctx.window.zukaitCloud.syncNow=async()=>{dirty=false};
for(const role of ['Manager','Supervisor','Receptionist']){
 ctx.me.role=role;
 const id='draft-'+role;
 state.estimates.push({...structuredClone(state.estimates[0]),id,estimateNo:'Draft-'+role,status:'Draft',createdBy:'SUP1'});
 await api.deleteDraft(id);assert.ok(!state.estimates.some(e=>e.id===id),role+' can delete a draft');
 await api.openDrafts();assert.ok(!state.estimates.some(e=>e.id===id),'Deleted draft must not return from recovery cache');
}
const beforeDelete=deletedCalls;ctx.me.role='Manager';await api.deleteDraft('E1');assert.equal(deletedCalls,beforeDelete,'Saved estimate cannot be deleted');
ctx.me.role='Employee';await api.deleteDraft('anything');assert.equal(deletedCalls,beforeDelete,'Employee cannot delete drafts');
console.log('PASS: Manager/Supervisor/Receptionist draft delete, durable confirmation, recovery suppression and saved protection');

await import('./technician-time-vehicle-share.mjs');

// Run the Reception record/date/permission matrix with estimate acceptance.
await import('./reception-feature8.mjs');

const printDate=api.estimateDocumentHtml({...state.estimates[0],date:'2026-10-15',mobile:'',jobCard:'',claimNo:''});
assert.match(printDate,/<b>Date[^]*?:<\/b> 15-10-2026/);
assert.doesNotMatch(printDate,/93211154/);
assert.match(printDate,/<th>Phone \/ <bdi[^>]*>رقم الهاتف<\/bdi><\/th><td(?: colspan="2")?><\/td>/);
assert.match(printDate,/<th>JC\.NO<\/th><td(?: colspan="2")?><\/td>/);
assert.match(printDate,/<th>Claim No\. \/ <bdi[^>]*>رقم المطالبة<\/bdi><\/th><td(?: colspan="2")?><\/td>/);
assert.match(printDate,/font:14px\/1\.45 Arial/);
assert.equal(state.estimates[0].date,'2026-09-26','Display formatting must not mutate stored dates');
console.log('Estimate print correction: vector header, larger type, both contact numbers, DD-MM-YYYY and blank optional fields passed');

for(const [en,ar] of [['Make','الماركة'],['Year','سنة الصنع'],['Name','الاسم'],['Phone','رقم الهاتف'],['Description','الوصف'],['Amount OMR','المبلغ'],['TOTAL','الإجمالي']])assert.ok(printDate.includes(en+' / <bdi lang="ar" dir="rtl">'+ar+'</bdi>'),en+' must have an isolated Arabic translation');
assert.ok(printDate.includes('Test Customer'),'Customer values remain as entered');
assert.ok(printDate.includes('Toyota Camry'),'Combined stored make/model stays intact');
console.log('Bilingual estimate labels passed: English / Arabic, blank values, unchanged customer data and amounts');

assert.equal((printDate.match(/92403420/g)||[]).length,1);
assert.equal((printDate.match(/72440918/g)||[]).length,1);

assert.ok(!printDate.includes('Model /'));
assert.ok(printDate.includes('<th>JC.NO</th>'));
