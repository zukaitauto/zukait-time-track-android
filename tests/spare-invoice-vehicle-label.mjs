import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
const helperStart=source.indexOf('function job(no){');
const helperEnd=source.indexOf('function assignedToJob(no,uid){',helperStart);
assert.ok(helperStart>=0&&helperEnd>helperStart,'Invoice identity helpers must be present');
const helpers=source.slice(helperStart,helperEnd);
const list={listNo:'PL049',jobCard:'12137',vehicle:'KIA CREDOS',model:'CREDOS',year:'2021',registration:'OLD-REG'};
const win={zukaitJobCardMaster:{display:()=>({no:'12137',make:'KIA',model:'Seltos',vehicle:'KIA Seltos',year:'2021',reg:'67286-A'})}};
const ctx={window:win};
vm.runInNewContext(helpers+';globalThis.resolveInvoiceIdentity=invoiceEntryVehicleIdentity;',ctx);
const identity=ctx.resolveInvoiceIdentity(list);
assert.equal(identity.vehicle,'KIA Seltos');
assert.equal(identity.year,'2021');
assert.equal(identity.registration,'67286-A');
assert.equal(list.vehicle,'KIA CREDOS','Viewing must not modify historical Parts List');
assert.equal(list.model,'CREDOS');

win.zukaitJobCardMaster.display=()=>({make:'KIA',model:'Sportage',year:'2022',reg:'NEW-REG'});
assert.equal(ctx.resolveInvoiceIdentity(list).vehicle,'KIA Sportage','Later Job Card edits should appear without Parts List rewrites');
assert.equal(ctx.resolveInvoiceIdentity(list).registration,'NEW-REG');

delete win.zukaitJobCardMaster;
assert.equal(ctx.resolveInvoiceIdentity(list).vehicle,'KIA CREDOS','When Job Card cannot be loaded, fall back to the original parts snapshot without duplicate model');
assert.equal(ctx.resolveInvoiceIdentity({...list,vehicle:'KIA',model:'Seltos'}).vehicle,'KIA Seltos','Legacy make/model fields should combine without duplication');
assert.equal(ctx.resolveInvoiceIdentity(list).registration,'OLD-REG');

const listing=source.slice(source.indexOf('async function openInvoiceEntry(){'),source.indexOf('function invoiceSearchRows(){'));
assert.match(listing,/invoiceEntryVehicleIdentity\(x\.list\)/,'Invoice index must resolve current Job Card identity');
assert.match(listing,/identity\.vehicle,identity\.year/,'Invoice index displays authoritative make, model, year');
assert.match(listing,/identity\.registration,identity\.vehicle/,'Invoice search indexes the updated registration and vehicle');
assert.doesNotMatch(listing,/\[x\.list\.vehicle,x\.list\.model,x\.list\.year\]/,'Invoice listing must not render stale list vehicle/model');
const detail=source.slice(source.indexOf('async function openInvoiceEntryList('),source.indexOf('async function invoiceEntryClick(',source.indexOf('async function openInvoiceEntryList(')));
assert.match(detail,/invoiceEntryVehicleIdentity\(list\)/,'Invoice detail must use same vehicle source');
assert.match(detail,/identity\.registration/,'Invoice detail registration must be refreshed');
assert.match(detail,/saveSupervisorInvoicePrice|Final invoice price/,'Invoice detail price entry is retained');
console.log('PASS: Spare Parts Invoice Entry follows current Job Card vehicle name, model, year and registration; no duplicate snapshot names.');
