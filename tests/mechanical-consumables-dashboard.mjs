import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {mountMechanicalWorkspace} from '../app/src/main/assets/mechanical_workspace.js';

const source=readFileSync('app/src/main/assets/mechanical_supervisor.js','utf8');
assert.match(source,/mount\('\.\/mechanical_consumables_host\.js'/);
assert.match(source,/if\(section==='consumables'\)return consumablesView\(\)/);
assert.match(source,/openConsumables:consumablesView/);
assert.doesNotMatch(readFileSync('app/src/main/assets/mechanical_consumables_host.js','utf8'),/^\s*import\b.*(?:workshop_state|cloud_sync\.js|consumables_ui\.js)/im,
 'Dedicated host must not import a large workshop snapshot or the Painting UI');

const dom=new JSDOM('<div id="root"></div>',{url:'https://qa.invalid'}),w=dom.window;
const root=w.document.getElementById('root'),calls=[],opens=[];
let session={id:'SUP003',role:'Mechanical Supervisor',key:'qa'};
const options={
  enabled:true,deviceId:'MCHOST',uuid:()=>String(Math.random()),storage:w.localStorage,
  getSession:()=>session,online:()=>true,
  api:async body=>{calls.push(body.action);return {ok:true,capabilities:['MC_CREATE'],
    recordsRevision:1,workshopRevision:1,checklists:[],mechanics:[],qcAvailable:false,deliveryAvailable:false}},
  openSection:async key=>opens.push(key),
  openConsumables:async()=>opens.push('consumables-open')
};
let ctl=await mountMechanicalWorkspace(root,options);
const card=root.querySelector('[data-mc-card="consumables"]');
assert.ok(card,'Mechanical Supervisor dashboard must show Consumables card');
assert.match(card.textContent,/Mechanical Consumables/);
assert.deepEqual(calls,['mechanical_dashboard'],'No extra stock/database requests just to draw the card');
card.click();
await new Promise(resolve=>setImmediate(resolve));
assert.deepEqual(opens,['consumables'],'Tap routes to Mechanical-only Consumables section');
ctl.destroy();
ctl=await mountMechanicalWorkspace(root,{...options,openConsumables:undefined});
assert.equal(root.querySelector('[data-mc-card="consumables"]'),null,
 'Generic/Manager-host dashboard with no dedicated route cannot show a broken card');
ctl.destroy();dom.window.close();
console.log('Mechanical dashboard Consumables card: dedicated host route, no initial queries or accidental generic navigation PASS');
