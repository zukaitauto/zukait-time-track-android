import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const code=fs.readFileSync('app/src/main/assets/v2/features/notifications/center.js','utf8');
const storage=new Map();
const window={me:{id:'SUP1',role:'Supervisor'},state:{},zukaitV2:{}};
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
assert.equal(rows.length,2,'Manager must see both new-entry and arrived operational events');
assert.deepEqual(rows.map(x=>x.id).sort(),['parts-event-E1','parts-event-E3']);

assert.match(code,/reports\.page\('SPARE_PARTS'/,'notification refresh must use authoritative Spare Parts event history');
assert.match(code,/setInterval\(refresh,POLL_MS\)/);
assert.match(code,/const POLL_MS=5000/);
console.log('V2 notification center event history: ok');
