import assert from 'node:assert/strict';
import fs from 'node:fs';

const v54=fs.readFileSync('app/src/main/assets/v54_improvements.js','utf8');
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const v74=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
const extract=(source,begin,end)=>{
 const a=source.indexOf(begin),b=source.indexOf(end,a);
 assert.ok(a>=0&&b>a,begin+' must exist');
 return source.slice(a,b);
};

// This badge runs from a MutationObserver on every dashboard. A second call
// with unchanged network state must not create more child mutations.
let writes=0,badge=null;
const row={appendChild(el){badge=el}};
const app={classList:{contains(){return false}},querySelector(){return row}};
const document={
 getElementById(id){return id==='app'?app:id==='v54OnlineStatus'?badge:null},
 createElement(){return {
   _html:'',className:'',title:'',
   get innerHTML(){return this._html},
   set innerHTML(value){this._html=value;writes++},
   querySelector(selector){return selector==='.dot'&&this._html.includes('<span class="dot"></span>')?{nextSibling:{textContent:this._html.split('</span>')[1]}}:null}
 }}
};
const navigator={onLine:true};
const indicator=new Function('document','navigator',extract(v54,'function ensureOnlineIndicator(){',"window.addEventListener('online',ensureOnlineIndicator);")+'return ensureOnlineIndicator;')(document,navigator);
indicator();indicator();indicator();
assert.equal(writes,1,'unchanged online badge must not retrigger the dashboard observer');
navigator.onLine=false;indicator();indicator();
assert.equal(writes,2,'a real network transition must update the badge exactly once');

// The Manager spare parts card has another document-wide observer.
let detailWrites=0,detail='';
const small={get textContent(){return detail},set textContent(value){detail=value;detailWrites++}};
const card={setAttribute(){},querySelector(){return small}};
const update=new Function(extract(html,'function updateSparePartsCard(card,detail){','async function refreshManagerSparePartsSummary()')+'return updateSparePartsCard;')();
update(card,'2 parts waiting');update(card,'2 parts waiting');
assert.equal(detailWrites,1,'unchanged spare parts summary must not loop through its observer');

// The shared vehicle observer owns these decorators; each pass must settle.
for(const [start,end] of [
 ['/* V158 EV CARD AUTHORITY','/* V159 HEAVY VEHICLE CLASS AUTHORITY'],
 ['/* V159 HEAVY VEHICLE CLASS AUTHORITY','/* V160 HEAVY BRAND AUTHORITY'],
 ['/* V160 HEAVY BRAND AUTHORITY','/* V161 OMAN BRAND AUTHORITY'],
 ['/* V161 OMAN BRAND AUTHORITY','/* V166 CONSOLIDATED DOM DECORATION OBSERVER']
]){
 const block=extract(v74,start,end);
 assert.doesNotMatch(block,/new MutationObserver/,'vehicle decorators must not create competing observers');
}
assert.match(v74,/if\(badge\.textContent!==cls\)badge\.textContent=cls/);
assert.match(v74,/window\.v160ApplyHeavyBrandAuthority=apply/);
assert.match(v74,/window\.v161ApplyOmanBrandAuthority=apply/);
assert.match(v74,/box\.classList\.contains\('v132-explicit-brand'\)&&img\?\.getAttribute\('src'\)===/,'an unchanged Employee logo must remain mounted');
assert.match(v74,/if\(count\.textContent!==label\)count\.textContent=label/,'the recurring Employee count must not rewrite unchanged content');
console.log('Dashboard mutation stability: online badge, Manager card, and vehicle decorators passed');


// Periodic server status must have a single authority; the retired legacy
// reconcile loop must not wake the shared dashboard every second.
assert.doesNotMatch(v74,/setInterval\(reconcileUI,1000\)/,'legacy one-second status reconciliation must stay retired');
assert.match(v74,/addEventListener\('zukait-live-status',reconcileUI\)/,'status reconciliation must be event-driven by server-live updates');
assert.match(v74,/v149Pending/,'shared colour observer must coalesce mutation bursts');
assert.match(v74,/v184Pending/,'global employee-colour observer must coalesce mutation bursts');
console.log('Dashboard periodic-writer stability: single live authority and coalesced observers passed');
