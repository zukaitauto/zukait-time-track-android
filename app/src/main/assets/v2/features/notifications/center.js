(function(){'use strict';
const POLL_MS=5000;
let serverPartsEvents=null;
function meNow(){try{return (typeof me!=='undefined'&&me)||window.me||null}catch(_){return window.me||null}}
function role(){return String(meNow()?.role||'')}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function readKey(){return 'zukait-notification-read-'+String(meNow()?.id||role()||'guest')}
function readAt(){return Number(localStorage.getItem(readKey())||0)}
function paintReadIds(){try{return new Set(JSON.parse(localStorage.getItem(readKey()+'-paint')||'[]'))}catch(_){return new Set()}}
function stateNow(){try{return (typeof state!=='undefined'&&state)||window.state||{}}catch(_){return window.state||{}}}
function paintNotifications(){
 if(role()!=='Manager')return [];
 const s=stateNow(),out=[],staff=(()=>{try{return typeof users!=='undefined'?users:window.users||[]}catch(_){return []}})();
 const supervisor=x=>x.createdByRole?x.createdByRole==='Supervisor':staff.some(u=>u.id===x.createdBy&&u.role==='Supervisor');
 for(const [kind,rows] of [['material',s.consumables?.issues||[]],['paint-order',s.paintPurchasing?.orders||[]]])for(const x of rows){
  if(!x?.id||x.voided||!supervisor(x)||!x.locked)continue;
  if(kind==='material'&&(x.type!=='issued'||(x.department&&x.department!=='Painting')))continue;
  const at=eventTime(x.createdAt);if(!at)continue;
  out.push({id:kind+'-'+x.id,type:kind==='material'?'PAINT_MATERIAL_LIST_CREATED':'PAINT_PURCHASE_ORDER_CREATED',kind,recordId:String(x.id),at,title:kind==='material'?'Paint Material List Created':'Paint Purchase Order Created',message:[x.poNumber,x.jobCard?'JC '+x.jobCard:'',x.vehicle||x.make,x.createdByName||x.supervisorName||x.createdBy].filter(Boolean).join(' · ')});
 }
 return out;
}
function markPaintRead(id){const ids=paintReadIds();ids.add(id);localStorage.setItem(readKey()+'-paint',JSON.stringify([...ids]));updateBadges()}
function openPaintRecord(id){
 if(role()!=='Manager')return;
 const n=paintNotifications().find(x=>x.id===id);if(!n)return alert('This record is no longer available.');
 const fn=n.kind==='material'?window.consOpenNotificationMaterial:window.paintOpenNotificationOrder;
 if(typeof fn!=='function')return alert('Please update the app to open this record.');
 try{if(typeof closeModal==='function')closeModal();if(fn(n.recordId)!==false)markPaintRead(n.id)}catch(e){console.warn('Notification record could not be opened',e);alert('Unable to open this record. Please try again.')}
}
function eventTime(v){if(typeof v==='number'&&Number.isFinite(v))return v;const n=Date.parse(String(v||''));return Number.isFinite(n)?n:0}
function partsRows(){try{return window.zukaitV2?.sparePartsMain?.reportRows?.()||[]}catch(_){return[]}}
function payloadOf(x){return x&&typeof x.payload==='object'&&x.payload?x.payload:{}}
function normalizeServerEvent(x={}){
 const p=payloadOf(x);
 return {eventId:String(x.event_id??x.eventId??''),eventType:String(x.event_type??x.eventType??''),at:eventTime(x.sort_time??x.server_time??x.serverTime??x.created_at??x.createdAt),partId:String(x.entity_id??x.entityId??p.partId??p.part_id??''),listNo:String(p.listNo??p.list_no??x.listNo??x.list_no??''),jobCard:String(p.jobCard??p.job_card??x.jobCard??x.job_card??''),name:String(p.name??p.partName??p.part_name??p.part??x.name??''),to:String(p.to??x.to??'').toUpperCase(),targetRole:String(p.targetRole??p.target_role??'')};
}
async function loadServerPartEvents(){
 if(!navigator.onLine||!window.zukaitV2?.reports?.page)return null;
 let cursor=null,rows=[],pages=0;
 do{
  const r=await window.zukaitV2.reports.page('SPARE_PARTS',{cursor,limit:500,filters:{}});
  if(!Array.isArray(r?.rows)||r.source==='server-required')throw Error('SPARE_PARTS_REPORT_UNAVAILABLE');
  rows.push(...r.rows);cursor=r.nextCursor??null;pages++;
 }while(cursor&&pages<20);
 serverPartsEvents=rows.map(normalizeServerEvent).filter(x=>x.eventId&&x.at);
 return serverPartsEvents;
}
function eventPartsNotifications(events){
 const r=role(),out=[];
 for(const x of events||[]){
  if(r==='Purchaser'&&x.eventType==='SPARE_PART_LISTED')out.push({id:'parts-event-'+x.eventId,type:'SPARE_PART_LISTED',at:x.at,title:'New Parts Entry',message:'JC '+(x.jobCard||'')+' · '+(x.name||'Part')+' is ready for Purchaser action.',listNo:x.listNo});
  if(r==='Supervisor'&&x.eventType==='SPARE_PART_STATUS_CHANGED'&&x.to==='RECEIVED')out.push({id:'parts-event-'+x.eventId,type:'SPARE_PART_RECEIVED',at:x.at,title:'Parts Arrived',message:'JC '+(x.jobCard||'')+' · '+(x.name||'Part')+' was marked arrived by Purchaser.',listNo:x.listNo});
 }
 return out;
}
function statePartsNotifications(){
 const r=role(),rows=partsRows(),out=[];
 for(const x of rows){
  const status=String(x.status||'LISTED'),created=eventTime(x.createdAt),activity=eventTime(x.activityAt);
  if(r==='Purchaser'&&['LISTED','ENQUIRY'].includes(status))out.push({id:'parts-state-new-'+x.listNo+'-'+x.name,type:'SPARE_PART_LISTED',at:created||activity,title:'New Parts Entry',message:'JC '+(x.jobCard||'')+' · '+(x.name||'Part')+' is ready for Purchaser action.',listNo:x.listNo});
  if(r==='Supervisor'&&status==='RECEIVED')out.push({id:'parts-state-arrived-'+x.listNo+'-'+x.name,type:'SPARE_PART_RECEIVED',at:activity||created,title:'Parts Arrived',message:'JC '+(x.jobCard||'')+' · '+(x.name||'Part')+' was marked arrived by Purchaser.',listNo:x.listNo});
 }
 return out;
}
function partsNotifications(){return serverPartsEvents===null?statePartsNotifications():eventPartsNotifications(serverPartsEvents)}
function systemNotifications(){
 const u=meNow(),rows=Array.isArray(window.state?.systemNotifications)?window.state.systemNotifications:[];
 return rows.filter(n=>n&&!n.read&&(n.target===u?.id||n.target===role())).map(n=>({id:'system-'+n.id,type:'SYSTEM',at:Number(n.createdAt)||0,title:'System Notification',message:String(n.message||''),systemId:n.id}));
}
function all(){const m=new Map();for(const n of [...partsNotifications(),...systemNotifications(),...paintNotifications()])m.set(n.id,n);return [...m.values()].sort((a,b)=>b.at-a.at)}
function unread(){const t=readAt(),ids=paintReadIds();return all().filter(n=>n.recordId?!ids.has(n.id):n.at>t).length}
function ensureStyle(){if(document.getElementById('zukaitNotificationCenterStyle'))return;const s=document.createElement('style');s.id='zukaitNotificationCenterStyle';s.textContent='.zukait-notify-btn{position:relative!important;width:34px!important;height:34px!important;min-height:34px!important;padding:0!important;margin:0 4px!important;border-radius:10px!important;background:#f8fafc!important;color:#17304d!important;border:1px solid #d7e1eb!important;box-shadow:0 3px 10px #17304d12!important;font-size:17px!important}.zukait-notify-badge{position:absolute;right:-4px;top:-5px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#dc2626;color:#fff;font:800 9px/16px system-ui;text-align:center}.zukait-notify-list{display:grid;gap:4px;counter-reset:zuknotify}.zukait-notify-row{counter-increment:zuknotify;position:relative;padding:6px 7px 6px 34px;border:1px solid #dce6ef;border-radius:9px;background:#fff;color:#17304d;box-shadow:0 1px 4px #17304d0d}.zukait-notify-row:before{content:counter(zuknotify);position:absolute;left:7px;top:7px;display:grid;place-items:center;width:21px;height:21px;border-radius:6px;background:#edf4fb;color:#31577d;font-size:9px;font-weight:900}.zukait-notify-row b{display:block}.zukait-notify-row b{font-size:11px}.zukait-notify-row small{display:block;color:#64748b;margin-top:2px;font-size:9px}.zukait-notify-row button{margin-top:8px!important}';document.head.appendChild(s)}
function candidates(){const rows=[...document.querySelectorAll('#supervisorView .v143-header,#managerView .v135-manager-header,#managerView .v111-manager-header,#employeeView .v91-role-identity,#managerView .v91-role-identity')];if(role()==='Purchaser'){const h=document.querySelector('#managerView .section-title');if(h&&!rows.includes(h))rows.push(h)}return rows}
function inject(){
 ensureStyle();if(!meNow())return;
 for(const h of candidates()){if(h.querySelector('.zukait-notify-btn'))continue;const b=document.createElement('button');b.type='button';b.className='zukait-notify-btn';b.setAttribute('aria-label','Notifications');b.title='Notifications';b.onclick=e=>{e.stopPropagation();openCenter()};const menu=[...h.querySelectorAll('button')].find(x=>x!==b&&/☰|menu/i.test((x.textContent||'')+(x.title||'')));if(menu)h.insertBefore(b,menu);else h.appendChild(b)}
 updateBadges();
}
function updateBadges(){const n=unread(),html='🔔'+(n?'<span class="zukait-notify-badge">'+(n>99?'99+':n)+'</span>':'');document.querySelectorAll('.zukait-notify-btn').forEach(b=>{if(b.innerHTML!==html)b.innerHTML=html})}
function openPart(n){const no=String(n?.listNo||n||'').trim();if(!no)return;try{if(typeof closeModal==='function')closeModal()}catch(_){}const open=()=>{try{const sp=window.zukaitV2?.sparePartsMain;if(sp?.openList){sp.openList(no);return true}if(sp?.open){sp.open();setTimeout(()=>sp.openList?.(no),80);return true}}catch(_){}return false};if(!open())setTimeout(open,120)}
function openCenter(){
 const rows=all();localStorage.setItem(readKey(),String(Date.now()));updateBadges();
 const body='<div class="zukait-notify-list">'+(rows.length?rows.slice(0,30).map(n=>'<div class="zukait-notify-row"><b>'+esc(n.title)+'</b><span>'+esc(n.message)+'</span><small>'+esc(n.at?new Date(n.at).toLocaleString():'')+'</small>'+(n.recordId?'<button class="blue" onclick="zukaitNotificationCenter.openPaintRecord(decodeURIComponent(\''+esc(encodeURIComponent(n.id).replace(/'/g,'%27'))+'\'))">'+(n.kind==='material'?'Open Material List':'Open Purchase Order')+'</button>':'')+(n.listNo?'<button class="blue" onclick="zukaitNotificationCenter.openPart(\''+esc(n.listNo)+'\')">Open Spare Parts</button>':'')+'</div>').join(''):'<p class="muted">No notifications.</p>')+'</div>';
 if(typeof openModal==='function')openModal('<div class="row"><h3 style="margin:0;flex:1">🔔 Notifications</h3><button class="danger" onclick="closeModal()">✕ Close</button></div>'+body);
}
async function refresh(){
 // Never compete with authentication on the login screen. Server notification
 // hydration starts only after secure_auth has established the logged-in user.
 const u=meNow();if(!u||!u.id){inject();updateBadges();return}
 try{
  if(navigator.onLine){
   const sp=window.zukaitV2?.sparePartsMain;
   const purchaser=role()==='Purchaser';
   const beforeParts=purchaser&&sp?.reportRows?JSON.stringify(sp.reportRows()):'';
   if(sp?.hydrateAuthoritativeLists)await sp.hydrateAuthoritativeLists();
   const afterParts=purchaser&&sp?.reportRows?JSON.stringify(sp.reportRows()):'';
   await loadServerPartEvents();
   if(role()==='Manager')await window.refreshManagerSparePartsSummary?.(true);
   if(purchaser&&beforeParts!==afterParts){
    const host=document.getElementById('managerView');
    if(host&&!host.classList.contains('hidden')&&host.dataset.zukaitPurchaserShell==='1')await sp?.renderPurchaserDashboard?.(true);
   }
  }
 }catch(_){}
 inject();updateBadges();
}
window.zukaitNotificationCenter={open:openCenter,openPart,openPaintRecord,paintNotifications,refresh,all,unread,inject,eventPartsNotifications,normalizeServerEvent,loadServerPartEvents};
document.addEventListener('DOMContentLoaded',()=>{inject();refresh()});window.addEventListener('online',refresh);window.addEventListener('focus',refresh);setTimeout(()=>{inject();refresh()},700);setInterval(refresh,POLL_MS);
new MutationObserver(()=>inject()).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('zukait-live-status',updateBadges);
})();
