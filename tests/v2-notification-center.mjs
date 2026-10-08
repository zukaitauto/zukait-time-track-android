import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const code=fs.readFileSync('app/src/main/assets/v2/features/notifications/center.js','utf8');
const storage=new Map();
const window={me:{id:'SUP1',role:'Supervisor'},state:{},zukaitV2:{},addEventListener(){}};
const document={addEventListener(){},querySelectorAll(){return[]},querySelector(){return null},getElementById(){return null},documentElement:{}};
class MutationObserver{observe(){}}
const sandbox={window,document,navigator:{onLine:false},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},MutationObserver,setTimeout(){},setInterval(){},Date,console};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
const n=window.zukaitNotificationCenter;

const received=n.normalizeServerEvent({event_id:'E1',event_type:'SPARE_PART_STATUS_CHANGED',sort_time:'2026-09-27T15:00:00Z',payload:{partId:'P1',listNo:'PL001',jobCard:'JC100',name:'Bumper',from:'ORDERED',to:'RECEIVED',targetRole:'Supervisor'}});
const verified=n.normalizeServerEvent({event_id:'E2',event_type:'SPARE_PART_STATUS_CHANGED',sort_time:'2026-09-27T15:01:00Z',payload:{partId:'P1',listNo:'PL001',jobCard:'JC100',name:'Bumper',from:'RECEIVED',to:'SUPERVISOR_VERIFIED'}});
let rows=n.eventPartsNotifications([verified,received]);
assert.equal(rows.length,1,'Supervisor must still see RECEIVED even after a later status event');
assert.equal(rows[0].id,'parts-event-E1');
assert.equal(rows[0].listNo,'PL001');

window.me.role='Purchaser';
const listed=n.normalizeServerEvent({event_id:'E3',event_type:'SPARE_PART_LISTED',sort_time:'2026-09-27T14:59:00Z',payload:{partId:'P2',listNo:'PL001',jobCard:'JC100',name:'Lamp',targetRole:'Purchaser'}});
rows=n.eventPartsNotifications([listed,received]);
assert.equal(rows.length,1);
assert.equal(rows[0].title,'New Parts Entry');

window.me.role='Manager';
rows=n.eventPartsNotifications([listed,received,verified]);
assert.equal(rows.length,0,'Manager must not receive routine Purchaser/Supervisor handoff notifications');

assert.match(code,/reports\.page\('SPARE_PARTS'/,'notification refresh must use authoritative Spare Parts event history');
assert.match(code,/setInterval\(refresh,POLL_MS\)/);
assert.match(code,/const POLL_MS=5000/);
assert.match(code,/const beforeParts=purchaser&&sp\?\.reportRows\?JSON\.stringify\(sp\.reportRows\(\)\):''/,'Purchaser refresh must detect authoritative Spare Parts changes without rebuilding on unchanged polls');
assert.match(code,/renderPurchaserDashboard\?\.\(true\)/,'Visible Purchaser dashboard must refresh from the hydrated server cache when Spare Parts change');
assert.match(code,/refreshManagerSparePartsSummary\?\.\(true\)/,'Manager Spare Parts summary must refresh from the same hydrated server cache');
assert.match(code,/if\(b\.innerHTML!==html\)b\.innerHTML=html/,'notification observer must not rewrite an unchanged bell and recursively trigger itself');
assert.match(code,/const u=meNow\(\);if\(!u\|\|!u\.id\)/,'notification refresh must use the shared logged-in user resolver');
assert.match(code,/if\(!u\|\|!u\.id\)\{inject\(\);updateBadges\(\);return\}/,'notification network hydration must stay off the unauthenticated Web login path');
assert.match(code,/if\(typeof closeModal==='function'\)closeModal\(\)/,'notification actions must close the notification modal before routing');
assert.match(code,/sp\.openList\(no\)/,'notification actions must open the concerned Spare Parts list');
console.log('V2 notification center event history: ok');

assert.match(code,/r==='Purchaser'&&x\.eventType==='SPARE_PART_LISTED'/,'new Parts List event must target Purchaser');
assert.match(code,/r==='Supervisor'&&x\.eventType==='SPARE_PART_STATUS_CHANGED'&&x\.to==='RECEIVED'/,'Purchaser Received event must target Supervisor');

const main=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
const shell=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
assert.match(main,/async function renderPurchaserDashboard\(skipHydrate=false\)/,'Purchaser dashboard must support a cache-only live refresh path');
assert.match(main,/const rows=skipHydrate\?read\(\):await hydrateAuthoritativeLists\(\)/,'Cache-only Purchaser refresh must reuse the just-hydrated authoritative data');
assert.match(shell,/async function refreshManagerSparePartsSummary\(skipHydrate=false\)/,'Manager summary must support a no-duplicate-fetch live refresh path');
assert.match(shell,/if\(!skipHydrate\)try\{await window\.zukaitV2\?\.sparePartsMain\?\.hydrateAuthoritativeLists\?\.\(\)\}/,'Manager live summary must avoid a second server fetch after notification hydration');
assert.match(main,/function partsListWhatsAppText\(r\)/);
assert.match(main,/const lines=\[vehicle\|\|'Vehicle'\]/,'WhatsApp must begin with vehicle only');
assert.doesNotMatch(main,/const lines=\[\(vehicle\|\|'Vehicle'\)\+'\.'/,'WhatsApp vehicle line must not add punctuation');
assert.match(main,/function whatsAppQuotation\(no\)\{return whatsAppPartsList\(no\)\}/,'quotation WhatsApp must use the same minimal parts-only format');
assert.match(main,/function partFullyArrived\(item\).*SUPERVISOR_VERIFIED/,'Supervisor verification must complete purchasing for the part');

window.me.role='Purchaser';
const rejected=n.normalizeServerEvent({event_id:'E-rejected',event_type:'SPARE_PART_STATUS_CHANGED',sort_time:'2026-10-08T15:00:00Z',payload:{partId:'P1',listNo:'PL001',jobCard:'JC100',name:'Lamp',from:'RECEIVED',to:'ORDERED',reason:'Not physically received',targetRole:'Purchaser'}});
rows=n.eventPartsNotifications([rejected]);
assert.equal(rows.length,1);assert.equal(rows[0].title,'Arrival Rejected');
assert.match(rows[0].message,/Not physically received/);assert.equal(rows[0].listNo,'PL001');
window.me.role='Supervisor';assert.equal(n.eventPartsNotifications([rejected]).length,0);
window.me.role='Manager';assert.equal(n.eventPartsNotifications([rejected]).length,0);
