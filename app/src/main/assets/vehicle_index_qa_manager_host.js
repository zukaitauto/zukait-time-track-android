/* Manager host: one Manager menu action, no automatic polling. */
(function(root){
 'use strict';
 if(root.ZUKAIT_VEHICLE_INDEX_READY!==true||!root.zukaitVehicleIndexBase)return;
 const doc=root.document;
 const current=()=>root.me?.role==='Manager'&&!!root.me?.id&&!root.zukaitSessionPrivacy?.locked&&!!root.zukaitAuth?.getToken?.();
 const base=root.zukaitVehicleIndexBase;
 let opening=false;
 async function open(){
  if(opening||!current()||typeof root.openModal!=='function'||typeof root.zukaitCloud?.vehicleIndexRequest!=='function')return;
  opening=true;
  const actor={id:root.me.id,role:root.me.role},token=root.zukaitAuth.getToken();
  root.openModal('<div class="section-title"><h2>Vehicle Index</h2><button type="button" onclick="closeModal()">Close</button></div><div id="vehicle-index-qa-screen">Loading catalogue…</div>');
  const container=doc.getElementById('vehicle-index-qa-screen');
  const isCurrent=()=>!!container?.isConnected&&current()&&root.me.id===actor.id&&root.zukaitAuth.getToken()===token;
  const request=async body=>{if(!isCurrent())throw Error('STALE_SESSION');const r=await root.zukaitCloud.vehicleIndexRequest(body);if(!isCurrent())throw Error('STALE_SESSION');return r;};
  try{
   if(!isCurrent())return;
   const r=await root.zukaitVehicleIndexLoader.load(base,{read:request,isCurrent});
   if(!isCurrent())return;
   if(r.status!=='SERVER_CONFIRMED'){container.textContent='Catalogue server not confirmed. Approval and queue are disabled. Close and retry when connected.';return;}
   root.zukaitVehicleAutocomplete.configure(root.zukaitVehicleIndex.create(r.snapshot));
   root.zukaitVehicleIndexManager.mount(container,{actor,snapshot:r.snapshot,approve:request,queue:request,isCurrent});
  }catch(_){if(isCurrent())container.textContent='Vehicle Index unavailable. Close and retry.';}
  finally{opening=false;}
 }
 function install(){
  const manager=doc.getElementById('managerView');if(!manager)return;
  const old=manager.querySelector('[data-vehicle-index-qa-menu]');
  if(!current()){old?.remove();return;}
  if(old)return;
  const button=doc.createElement('button');button.type='button';button.className='blue';button.textContent='Vehicle Index';button.dataset.vehicleIndexQaMenu='true';button.addEventListener('click',open);
  const actions=manager.querySelector('.manager-actions')||manager;actions.append(button);
 }
 // Reinstall only on existing render/events; no server call occurs until click.
 for(const name of ['render','renderManager']){
  const prior=root[name];if(typeof prior!=='function')continue;
  root[name]=function(){const out=prior.apply(this,arguments);install();return out;};
 }
 root.addEventListener('zukait:state-updated',install);
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',install,{once:true});else install();
 root.zukaitVehicleIndexQaHost=Object.freeze({install,open});
})(window);
