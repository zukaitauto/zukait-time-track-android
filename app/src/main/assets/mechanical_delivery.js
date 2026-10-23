// Pilot delivery review shared by Supervisor and isolated Receptionist hosts.
export async function mountMechanicalDelivery(root,options={}){
 const doc=root.ownerDocument,initial=options.getSession?.(),identity=s=>JSON.stringify([s?.id,s?.role,s?.key]),owner=identity(initial),store=options.storage||globalThis.localStorage,uuid=options.uuid||(()=>globalThis.crypto.randomUUID());
 let disposed=false,busy=false,preview=null,pending=null,notice='',storageReady=true;
 const active=()=>!disposed&&identity(options.getSession?.())===owner,online=()=>options.online?.()??globalThis.navigator?.onLine!==false;
 const el=(tag,text)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;return n};
 if(options.enabled!==true||!['Supervisor','Receptionist'].includes(initial?.role)||!initial.id||!initial.key||!options.checklistId||typeof options.api!=='function'){root.replaceChildren(el('p','Delivery review is unavailable.'));return {destroy(){root.replaceChildren()}}}
 const key='zukait_mechanical_delivery_pending_v1:'+initial.id;
 let device;
 try{device=store.getItem('zukait_mechanical_device_v1');if(!device){device=uuid();store.setItem('zukait_mechanical_device_v1',device)}const saved=store.getItem(key);if(saved){pending=JSON.parse(saved);if(pending?.owner!==initial.id||pending.command?.operation!=='MECHANICAL_DELIVER'||typeof pending.command.requestId!=='string'||typeof pending.command.entityId!=='string'||!/^[0-9a-f]{64}$/.test(pending.command.payload?.expectedFingerprint||''))throw Error('invalid_pending')}}catch{storageReady=false;pending=null;notice='Saved delivery needs review. Keep this device data and ask the Manager.'}
 const sameScope=()=>!pending||pending.command.entityId===options.checklistId;
 const save=()=>store.setItem(key,JSON.stringify(pending));
 const known=new Set(['mechanical_revision_conflict','workshop_revision_conflict','mechanical_qc_work_changed','mechanical_delivery_not_ready']);
 const message=code=>({mechanical_mixed_qc_policy_required:'The QC policy for this mixed job needs Manager review.',mechanical_delivery_not_ready:'Complete work and required QC before delivery.',invalid_session:'Your session changed. Sign in again; the saved action is retained.',mechanical_forbidden:'This account cannot confirm this delivery.',mechanical_delivery_disabled:'Mechanical delivery is unavailable.'})[code]||'Delivery is not confirmed. Refresh and review the record.';
 function button(label,fn){const b=el('button',label);b.type='button';b.disabled=busy||!active();b.onclick=fn;return b}
 function render(){
  if(disposed)return;if(!active()){root.replaceChildren(el('p','Your login changed. Reopen delivery after signing in.'));return}
  root.replaceChildren();root.className='mechanical-delivery';const style=el('style');style.textContent='.mechanical-delivery{box-sizing:border-box;padding:16px;max-width:700px;margin:auto;font:16px system-ui;overflow-wrap:anywhere;color:#17324b;background:#f7f9fc}.mechanical-delivery *{box-sizing:border-box}.mechanical-delivery button{font:inherit;min-height:44px;padding:10px 14px;margin:6px 6px 6px 0;max-width:100%;white-space:normal;border:1px solid #b6c8d9;border-radius:8px;background:white;color:#17324b}.mechanical-delivery button:disabled{opacity:.5}.mechanical-delivery article{background:white;border:1px solid #d6e1eb;border-radius:10px;padding:14px;margin:12px 0}';root.append(style,el('h2','Review vehicle delivery'),button('Close',()=>{destroy();options.onClose?.()}));
  const status=el('p',notice);status.setAttribute('role','status');root.append(status);
  if(pending){root.append(el('p','A delivery awaits confirmation. The exact saved action is retained.'));if(!sameScope())root.append(el('p','Reopen delivery for the saved Job Card: '+String(pending.jobCard||'Manager review required')));
   else{root.append(button('Retry saved delivery',post));if(pending.rejected)root.append(button('Refresh for delivery review',async()=>{if(await load()){pending.reviewed=true;try{save();render()}catch{notice='Unable to keep the review safely.';render()}}}));if(pending.reviewed&&preview?.status.deliveryReady)root.append(button('Confirm reviewed delivery',()=>confirm(true)))}
  }
  if(preview){const card=el('article');card.append(el('h3','JC '+preview.vehicle.jobCard),el('p',preview.vehicle.description+' · '+preview.vehicle.registration),el('p',preview.status.delivered?'Vehicle is already delivered.':!preview.status.workComplete?'Work is still pending.':preview.status.deliveryReady?'Required QC is complete. Confirm physical handover to the customer.':'Required QC is pending.'));root.append(card);
   if(!pending&&storageReady&&preview.status.deliveryReady)root.append(button('Confirm vehicle delivered',()=>confirm(false)));
  }root.append(button('Refresh delivery status',load));
 }
 async function load(){
  if(!active()||busy||!sameScope())return false;if(!online()){notice='Reconnect to review delivery.';render();return false}
  busy=true;preview=null;render();try{const r=await options.api({action:'mechanical_delivery_preview',checklistId:options.checklistId});if(!active())return false;if(!r?.ok||r.status?.checklistId!==options.checklistId||!r.vehicle)throw Error(r?.code||'NETWORK');preview=r;notice='';return true}catch(e){if(active())notice=message(e.message);return false}finally{busy=false;render()}
 }
 async function confirm(reviewed){
  if(!active()||busy||!storageReady||!preview?.status.deliveryReady||!sameScope()||(pending&&(!reviewed||!pending.reviewed)))return;
  if(!online()){notice='Reconnect before confirming delivery.';render();return}
  const prior=pending;pending={owner:initial.id,jobCard:preview.vehicle.jobCard,command:{operation:'MECHANICAL_DELIVER',requestId:uuid(),entityId:options.checklistId,deviceId:device,expectedRevision:preview.status.recordsRevision,expectedWorkshopRevision:preview.status.workshopRevision,payload:{expectedFingerprint:preview.status.workToken}}};
  try{save()}catch{pending=prior;notice='This device cannot keep a safe retry. No change was sent.';render();return}await post();
 }
 async function post(){
  if(!active()||busy||!pending||!sameScope()||!storageReady)return;if(!online()){notice='Reconnect to confirm the saved delivery.';render();return}
  try{save()}catch{notice='This device cannot keep a safe retry. No change was sent.';render();return}
  busy=true;notice='Confirming delivery…';render();let confirmed=false;
  try{const r=await options.api({action:'mechanical_command',command:JSON.parse(JSON.stringify(pending.command))});if(!active())return;
   if(r?.ok!==true||r.requestId!==pending.command.requestId){if(known.has(r?.code)){pending.rejected=true;save()}notice=message(r?.code);return}
   store.removeItem(key);pending=null;preview=null;notice='Vehicle delivery confirmed.';confirmed=true;
  }catch{if(active())notice='Response not confirmed. Retry the saved delivery.'}finally{busy=false;render()}
  if(confirmed&&active())await options.onDone?.();
 }
 function destroy(){disposed=true;root.replaceChildren()}
 render();await load();return {refresh:load,destroy};
}
