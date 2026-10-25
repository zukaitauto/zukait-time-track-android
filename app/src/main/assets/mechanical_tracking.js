// Explicit, online-only checklist metadata review. No timers or background reads.
export async function mountMechanicalTracking(root,options={}){
 const doc=root.ownerDocument,initial=options.getSession?.(),identity=s=>JSON.stringify([s?.id,s?.role,s?.key]),owner=identity(initial),store=options.storage||globalThis.localStorage,uuid=options.uuid||(()=>crypto.randomUUID()),key='zukait_mechanical_tracking_pending_v1:'+String(initial?.id||'');
 let disposed=false,busy=false,model=null,pending=null,notice='';
 const active=()=>!disposed&&identity(options.getSession?.())===owner,online=()=>options.online?.()!==false;
 const el=(tag,text)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;return n};
 const button=(label,fn)=>{const b=el('button',label);b.type='button';b.disabled=busy||!active();b.onclick=fn;return b};
 const message=code=>({tracking_no_change:'The server already has this value. Refresh and review it.',tracking_hold_policy_required:'Waiting-for-parts behavior must be configured before this change.',tracking_priority_policy_required:'Choose a configured priority.',mechanical_revision_conflict:'Another change was saved. Refresh and review your proposed change.',workshop_revision_conflict:'The Job Card changed. Refresh and review your proposed change.',checklist_inactive:'This checklist is no longer active.',invalid_promise_date:'Enter a valid promise date.',mechanical_forbidden:'This account cannot make this change.',invalid_session:'Your session changed. Sign in again; your draft is retained.'})[code]||'The change is not confirmed. Your saved request is retained.';
 const save=()=>store.setItem(key,JSON.stringify(pending));
 const knownRejection=code=>['mechanical_revision_conflict','workshop_revision_conflict','tracking_no_change','tracking_priority_policy_required','tracking_hold_policy_required','invalid_promise_date','invalid_tracking_change','checklist_inactive'].includes(code);
 const matches=()=>{const p=pending?.command.payload,t=model?.tracking;if(!p||!t)return false;return pending.command.operation==='PRIORITY_SET'?p.priority===t.priority:pending.command.operation==='PROMISE_SET'?p.date===t.promiseDate:p.waiting===t.waitingForParts};
 function render(){
  if(disposed)return;if(!active()){root.replaceChildren(el('p','Your login changed. Reopen checklist tracking.'));return}
  root.replaceChildren();root.className='mechanical-tracking';const style=el('style');style.textContent='.mechanical-tracking{box-sizing:border-box;max-width:750px;margin:auto;padding:16px;font:16px system-ui;color:#17324b;overflow-wrap:anywhere}.mechanical-tracking *{box-sizing:border-box}.mechanical-tracking button,.mechanical-tracking input,.mechanical-tracking select{font:inherit;min-height:44px;max-width:100%;padding:10px;border:1px solid #b8c6d6;border-radius:8px}.mechanical-tracking button{margin:6px}.mechanical-tracking label{display:grid;gap:6px;margin:12px 0}.mechanical-tracking form,.mechanical-tracking article{padding:14px;margin:12px 0;border:1px solid #dbe2eb;border-radius:10px}.mechanical-tracking input,.mechanical-tracking select{width:100%}';
  const status=el('p',notice);status.setAttribute('role','status');root.append(style,el('h2','Checklist priority and commitments'),button('Refresh',load),button('Close',()=>{disposed=true;options.onClose?.()}),status);
  if(pending){const box=el('article');box.append(el('h3','Saved change awaiting confirmation'),el('p',JSON.stringify(pending.command.payload)));root.append(box);
   if(pending.command.entityId!==options.checklistId||pending.role!==initial.role){box.append(el('p','Reopen the original checklist with the original account role to review this saved change.'));return}
   box.append(button('Retry saved change',post));
   if(pending.rejected)box.append(button('Refresh for review',async()=>{if(await load()){pending.reviewed=true;try{save();render()}catch{notice='The review could not be stored safely.';render()}}}));
   if(pending.reviewed&&pending.rejected&&model?.active){
    box.append(button('Keep current server value and resolve draft',()=>{try{store.removeItem(key);pending=null;notice='Draft resolved. The current server value was retained.';render()}catch{notice='The saved request is retained.';render()}}));
    if(!matches())box.append(button('Confirm reviewed change',()=>{pending.command={...pending.command,requestId:uuid(),expectedRevision:model.recordsRevision,expectedWorkshopRevision:model.workshopRevision};pending.rejected=false;pending.reviewed=false;try{save();post()}catch{notice='No change sent: the request could not be stored safely.';render()}}));
   }
  }
  if(!model)return;const t=model.tracking,card=el('article');card.append(el('h3','JC '+model.jobCard),el('p','Priority: '+(t.priority??'Not set')),el('p','Promise date (Oman): '+(t.promiseDate??'Not set')),el('p','Waiting for parts: '+(t.waitingForParts?'Yes':'No')));if(t.updatedBy)card.append(el('p','Last changed by '+t.updatedBy));root.append(card);
  if(!model.active){root.append(el('p','This checklist is no longer active.'));return}if(pending)return;
  const caps=new Set(model.capabilities);
  if(caps.has('PRIORITY_SET'))addForm('Set priority','PRIORITY_SET','priority','select',model.priorityValues.map(value=>({value,label:value})),v=>({priority:v.get('priority')||null,reason:String(v.get('reason')).trim()}));
  if(caps.has('PROMISE_SET'))addForm('Set promise date (Oman; blank clears it)','PROMISE_SET','date','date',null,v=>({date:v.get('date')||null,reason:String(v.get('reason')).trim()}));
  if(caps.has('HOLD_SET')){if(model.holdMode==='STATUS_ONLY'){root.append(el('p','This parts status does not stop timers or change QC/delivery eligibility. Clear it explicitly when resolved.'));addForm('Waiting for parts','HOLD_SET','waiting','select',[{value:'yes',label:'Waiting for parts'},{value:'no',label:'Not waiting / parts received'}],v=>({waiting:v.get('waiting')==='yes',reason:String(v.get('reason')).trim()}))}else root.append(el('p','Waiting-for-parts behavior needs configuration before changes can be saved.'))}
 }
 function addForm(title,operation,name,type,choices,payload){
  const f=el('form');f.dataset.operation=operation;f.append(el('h3',title));const l=el('label',title),input=el(type==='select'?'select':'input');input.name=name;
  if(type==='select'){if(name==='priority'){const unset=el('option','Not set / clear priority');unset.value='';input.append(unset)}for(const c of choices){const opt=el('option',c.label);opt.value=c.value;input.append(opt)}}else input.type=type;
  input.value=name==='priority'?(model.tracking.priority??''):name==='date'?(model.tracking.promiseDate??''):(model.tracking.waitingForParts?'yes':'no');l.append(input);f.append(l);const reasonLabel=el('label','Reason for this change'),reason=el('input');reason.name='reason';reason.required=true;reason.maxLength=500;reasonLabel.append(reason);f.append(reasonLabel);const submit=el('button','Confirm change');submit.type='submit';submit.disabled=busy;f.append(submit);f.onsubmit=e=>{e.preventDefault();reason.setCustomValidity(reason.value.trim()?'':'Enter the reason for this change.');if(f.reportValidity())send(operation,payload(new doc.defaultView.FormData(f)))};root.append(f);
 }
 async function load(){
  if(!active()||busy)return false;if(!online()){notice='Connect to refresh checklist tracking.';render();return false}
  busy=true;render();try{const r=await options.api({action:'mechanical_tracking_view',checklistId:options.checklistId});if(!active())return false;if(!r?.ok)throw Error(r?.code);if(r.checklistId!==options.checklistId||!Number.isSafeInteger(r.recordsRevision)||!Number.isSafeInteger(r.workshopRevision)||!Array.isArray(r.capabilities)||!Array.isArray(r.priorityValues)||!r.tracking)throw Error('invalid_tracking_view');model=r;return true}catch(e){if(active()){model=null;notice=message(e.message)}return false}finally{busy=false;render()}
 }
 async function send(operation,payload){
  if(!active()||busy||pending||!model?.active)return;if(!online()){notice='Connect before saving this change.';render();return}
  const current=operation==='PRIORITY_SET'?model.tracking.priority:operation==='PROMISE_SET'?model.tracking.promiseDate:model.tracking.waitingForParts,value=operation==='PRIORITY_SET'?payload.priority:operation==='PROMISE_SET'?payload.date:payload.waiting;
  if(current===value){notice='This value is already saved. No change was sent.';render();return}
  pending={role:initial.role,command:{operation,entityId:options.checklistId,requestId:uuid(),deviceId:uuid(),expectedRevision:model.recordsRevision,expectedWorkshopRevision:model.workshopRevision,payload}};try{save()}catch{pending=null;notice='No change sent: the request could not be stored safely.';render();return}await post();
 }
 async function post(){
  if(!active()||busy||!pending||pending.role!==initial.role||pending.command.entityId!==options.checklistId)return;if(!online()){notice='Connect before retrying the saved change.';render();return}
  busy=true;pending.rejected=false;pending.reviewed=false;try{save()}catch{busy=false;notice='No change sent: the retry could not be stored safely.';render();return}render();let refresh=false;try{
   const r=await options.api({action:'mechanical_tracking_command',command:pending.command});if(!active())return;if(!r?.ok){pending.rejected=knownRejection(r?.code);pending.error=r?.code;save();notice=message(r?.code);return}
   if(r.requestId!==pending.command.requestId)throw Error('wrong_ack');store.removeItem(key);pending=null;notice='Change confirmed.';refresh=true;try{options.onChanged?.()}catch{}
  }catch(e){if(active()){const code=e.code||e.message;if(knownRejection(code)){pending.rejected=true;pending.error=code;try{save()}catch{}}notice=message(code)}}finally{busy=false;render();if(refresh)await load()}
 }
 if(options.enabled!==true||!initial?.key||!['Supervisor','Manager','Mechanical Supervisor'].includes(initial.role)||typeof options.api!=='function'){root.replaceChildren(el('p','Checklist tracking is unavailable.'));return {destroy(){disposed=true}}}
 try{const raw=store.getItem(key);if(raw){pending=JSON.parse(raw);if(!pending?.command||!['PRIORITY_SET','PROMISE_SET','HOLD_SET'].includes(pending.command.operation))throw Error('invalid_saved_tracking')}}catch{root.replaceChildren(el('p','Saved tracking data needs review. No change was sent.'));return {destroy(){disposed=true}}}
 render();if(!pending||(pending.role===initial.role&&pending.command.entityId===options.checklistId))await load();return {refresh:load,destroy(){disposed=true}};
}
