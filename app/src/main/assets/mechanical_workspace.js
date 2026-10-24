// Draft workspace. Host must opt in; server enablement/capabilities are separate.
export async function mountMechanicalWorkspace(root,options={}){
 const doc=root.ownerDocument,session=()=>options.getSession?.(),initial=session();
 const identity=s=>JSON.stringify([s?.id,s?.role,s?.key]);
 const owner=identity(initial),active=()=>!disposed&&identity(session())===owner;
 const online=()=>options.online?.()??globalThis.navigator?.onLine!==false;
 const uuid=options.uuid||(()=>globalThis.crypto.randomUUID());
 const storage=options.storage||globalThis.localStorage;
 let disposed=false,busy=false,model=null,qc=null,selected=options.checklistId||null,after=0,pending=null,notice='',readGeneration=0;
 const node=(tag,text,attrs={})=>{const e=doc.createElement(tag);if(text!==null)e.textContent=text;for(const [k,v] of Object.entries(attrs)){if(k==='onClick')e.addEventListener('click',v);else e.setAttribute(k,String(v));}return e};
 const key='zukait_mechanical_pending_v1:'+String(initial?.id||'');
 if(options.enabled!==true||!['Manager','Supervisor'].includes(initial?.role)||!initial?.id||!initial?.key||typeof options.api!=='function'){
  root.replaceChildren(node('p','Mechanical workspace is unavailable.'));return {destroy(){root.replaceChildren()}};
 }
 let device=options.deviceId;
 try{if(!device){device=storage.getItem('zukait_mechanical_device_v1');if(!device){device=uuid();storage.setItem('zukait_mechanical_device_v1',device)}}const saved=storage.getItem(key);if(saved){pending=JSON.parse(saved);if(pending.owner!==initial.id||!pending.command||typeof pending.command.operation!=='string'||!pending.command.payload)throw Error('invalid_pending');selected=pending.checklistId||null}}catch{pending=null;notice='This device cannot keep a safe retry. Pending changes need review.';device=null;}
 const savePending=()=>{storage.setItem(key,JSON.stringify(pending))};
 const errors={workshop_revision_conflict:'Work changed on another device. Refresh and review before confirming again.',mechanical_revision_conflict:'The checklist changed. Refresh and review before confirming again.',manual_jc_duplicate:'This Job Card already has a Mechanical checklist.',stop_work_before_handover:'Pause or stop the outgoing and incoming mechanic’s running work first.',stop_outgoing_work_first:'Pause or stop the outgoing mechanic’s running work first.',target_employee_working:'The incoming mechanic has running work. Pause or stop it first.',mechanical_forbidden:'Your login does not have permission for this action.',invalid_session:'Your login changed. Sign in again to review the pending change.',mechanical_dashboard_limit:'This record needs a more specific view. Ask the Manager to review it.'};
 const knownRepeatRejection=code=>['mechanical_revision_conflict','workshop_revision_conflict','invalid_repeat','invalid_repeat_employee','repeat_work_not_finished','repeat_source_inactive','repeat_cycle_review_required','task_inactive'].includes(code);
 function message(code){return ({repeat_work_not_finished:'Finish all original and earlier repeat work before issuing another repeat.',repeat_source_inactive:'Choose completed source work from this task.',invalid_repeat_employee:'Choose valid repeat and responsible employees.',invalid_repeat:'Enter the source, responsible employee, allocated minutes and repeat reason.',mechanical_repeat_disabled:'Repeat repair is unavailable.',mechanical_qc_work_changed:'Work changed after the QC check. Refresh and review it before confirming again.',mechanical_mixed_qc_policy_required:'The QC approval policy for this mixed job needs Manager review.',mechanical_qc_approver_required:'Only Jibin (SUP003) can record Mechanical QC.',mechanical_work_not_finished:'Complete every task and stop running work before QC.',mechanical_qc_disabled:'Mechanical QC is unavailable.',extension_disabled:'This action is unavailable.'})[code]||errors[code]||'The change was not accepted. Refresh the record and review it.'}
 function button(text,fn,attrs={}){const e=node('button',text,{type:'button',...attrs,onClick:fn});e.disabled=busy||!active();return e}
 function valueFor(f,name,fallback=''){const p=f._draft;if(!p)return fallback;return ({job:p.manualJobCard?.number,date:p.manualJobCard?.date,employee:p.employeeId,source:p.sourceAssignmentId,target:p.targetEmployeeId,minutes:p.suggestedMinutes,title:p.title,mistake:p.mistakeEmployeeId,reason:p.reason,result:p.result})[name]??fallback}
 function input(form,label,name,type='text',value='',required=true){const l=node('label',label),e=node('input',null,{name,type});e.value=valueFor(form,name,value);if(required)e.required=true;l.append(e);form.append(l);return e}
 function choice(form,label,name,choices){const l=node('label',label),e=node('select',null,{name});e.required=true;e.append(node('option','Select…',{value:''}));for(const c of choices)e.append(node('option',c.name,{value:c.id}));e.value=valueFor(form,name);l.append(e);form.append(l);return e}
 function form(title,operation,entity,payload){
  const f=node('form',null,{'data-operation':operation});f.append(node('h3',title));
  if(pending?.editing&&pending.command.operation===operation&&(operation==='MC_CREATE'||(operation==='TASK_CREATE'?pending.command.payload.checklistId===model.detail?.checklist.id:pending.command.entityId===entity())))f._draft=pending.command.payload;
  f.addEventListener('submit',e=>{e.preventDefault();for(const input of f.querySelectorAll('input[type=text]'))input.setCustomValidity(input.required&&!input.value.trim()?'Enter a value.':'');if(operation==='MECHANICAL_QC'){const reason=f.querySelector('[name=reason]');reason.setCustomValidity(f.querySelector('[name=result]').value==='FAIL'&&!reason.value.trim()?'Enter the reason for failing QC.':'')}if(!f.reportValidity()||busy||(pending&&!pending.editing))return;const values=new doc.defaultView.FormData(f);send(operation,entity(),payload(values))});return f;
 }
 function submit(f,label){const b=node('button',label,{type:'submit'});b.disabled=busy||!!(pending&&!pending.editing)||!device;f.append(b)}
 function render(){
  if(disposed)return;if(!active()){root.replaceChildren(node('p','Your login changed. Reopen the workspace after signing in.'));return;}
  root.replaceChildren();root.className='mc-workspace';
  const style=node('style',null);style.textContent='.mc-workspace{box-sizing:border-box;color:#142536;background:#f5f7fa;padding:16px;font:16px system-ui;max-width:1100px;margin:auto;overflow-wrap:anywhere}.mc-workspace *{box-sizing:border-box}.mc-workspace header,.mc-workspace .mc-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mc-workspace h2{flex:1;margin:0}.mc-workspace button{min-height:44px;padding:10px 14px;border:1px solid #b8c6d6;border-radius:9px;background:white;color:#142536;font:inherit;cursor:pointer}.mc-workspace button[type=submit]{background:#164a79;color:white}.mc-workspace button:disabled{opacity:.55;cursor:default}.mc-workspace form,.mc-workspace article,.mc-workspace .mc-pending{background:white;border:1px solid #dbe2eb;border-radius:12px;padding:14px;margin:12px 0;min-width:0}.mc-workspace label{display:flex;flex-direction:column;gap:6px;margin:12px 0}.mc-workspace input,.mc-workspace select,.mc-workspace textarea{font:inherit;width:100%;min-width:0;min-height:44px;padding:10px;border:1px solid #a9b8c9;border-radius:7px}.mc-workspace .mc-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.mc-workspace .mc-list{display:grid;gap:8px}.mc-workspace .mc-list button{text-align:left;width:100%}.mc-workspace [role=status]{min-height:24px;margin:14px 0;color:#854200}.mc-workspace .mc-muted{color:#54677b}.mc-workspace h3{margin-top:0}.mc-workspace ul{padding-left:20px}@media(max-width:760px){.mc-workspace{padding:10px}.mc-workspace .mc-grid{grid-template-columns:minmax(0,1fr)}}';root.append(style);
  const header=node('header',null);header.append(node('h2','Mechanical Department'),button('Refresh',()=>refresh()),button('Close',()=>{destroy();options.onClose?.()}));root.append(header);
  root.append(node('p',notice,{role:'status','aria-live':'polite'}));
  if(pending){const box=node('section',null,{class:'mc-pending'});box.append(node('h3',pending.editing?'Review rejected change':'Pending confirmation'),node('p',({MC_CREATE:'Checklist registration',TASK_CREATE:'New task',TASK_ASSIGN:'Mechanic assignment',TASK_HANDOVER:'Work handover',TASK_REPEAT:'Repeat repair',MECHANICAL_QC:'Mechanical QC result'})[pending.command.operation]||'Saved change'),node('p',JSON.stringify(pending.command.operation==='MECHANICAL_QC'?{result:pending.command.payload.result,reason:pending.command.payload.reason}:pending.command.payload)));
   if(!pending.editing)box.append(button('Retry same change',()=>post()));
   if(pending.rejected&&['manual_jc_duplicate','invalid_assignment','invalid_task','invalid_manual_jc','existing_active_jc_required','duplicate_task_employee','stop_work_before_handover','stop_outgoing_work_first','target_employee_working','handover_source_changed','handover_source_inactive','invalid_repeat','invalid_repeat_employee','repeat_source_inactive','repeat_work_not_finished'].includes(pending.error))box.append(button('Edit rejected change',()=>{pending.editing=true;try{savePending();render()}catch{notice='Unable to keep this draft safely.';render()}}));
   if(pending.rejected&&['mechanical_revision_conflict','workshop_revision_conflict','mechanical_qc_work_changed'].includes(pending.error))box.append(button('Refresh for review',async()=>{if(await refresh()){if(pending.command.operation==='MECHANICAL_QC'&&!(await loadQc()))return;pending.reviewed=true;try{savePending();render()}catch{notice='Unable to keep this review safely.';render()}}}));
   if(pending.reviewed)box.append(button('Confirm reviewed change',()=>{const isQc=pending.command.operation==='MECHANICAL_QC';if(isQc&&(!qc?.workComplete||qc.delivered||qc.checklistId!==pending.command.entityId)){notice='Refresh the QC check before confirming this change.';render();return}pending.command={...pending.command,requestId:uuid(),expectedRevision:isQc?qc.recordsRevision:model.recordsRevision,expectedWorkshopRevision:isQc?qc.workshopRevision:model.workshopRevision,...(isQc?{payload:{...pending.command.payload,expectedFingerprint:qc.workToken}}:{})};delete pending.reviewed;delete pending.rejected;try{savePending();post()}catch{notice='Unable to keep a safe retry.';render()}}));root.append(box);
  }
  if(!model)return;
  const caps=new Set(model.capabilities||[]),grid=node('div',null,{class:'mc-grid'}),list=node('section',null),detail=node('section',null);grid.append(list,detail);root.append(grid);
  list.append(node('h3','Mechanical checklists'));const rows=node('div',null,{class:'mc-list'});
  for(const row of model.checklists||[])rows.append(button(row.number+' · JC '+row.jobCard+' · '+row.manualDate,()=>{selected=row.id;refresh()}));
  if(!rows.childNodes.length)rows.append(node('p','No checklists on this page.'));list.append(rows);
  if(after)list.append(button('First page',()=>{after=0;refresh()}));if(model.nextAfter!=null)list.append(button('Next page',()=>{after=model.nextAfter;refresh()}));
  if(caps.has('MC_CREATE')){
   const f=form('Register checklist','MC_CREATE',uuid,v=>({manualJobCard:{number:String(v.get('job')).trim(),date:v.get('date')}}));
   input(f,'Existing Job Card number','job').maxLength=80;input(f,'Manual Job Card date','date','date');f.append(node('p','The MC number is assigned when registration is confirmed.',{class:'mc-muted'}));submit(f,'Register checklist');list.append(f);
  }
  const d=model.detail;if(!d){detail.append(node('p','Select a checklist to view its tasks.'));return}
  detail.append(node('h3',d.checklist.number+' · JC '+d.checklist.jobCard),node('p','Manual date: '+d.checklist.manualDate));
  if(model.reportsAvailable&&typeof options.openReport==='function'&&!pending)detail.append(button('Task labour report',async()=>{if(!online()){notice='Reconnect before reporting.';render();return}busy=true;render();try{await options.openReport(d.checklist.id)}catch{notice='Unable to open report. Refresh and retry.'}finally{busy=false;if(active())render()}}));
  if(model.signaturesAvailable&&initial.id==='SUP003'&&initial.role==='Supervisor'&&typeof options.openSignature==='function'&&!pending)detail.append(button('Optional supervisor signature',async()=>{if(!online()){notice='Reconnect before signing.';render();return}busy=true;render();try{await options.openSignature({checklistId:d.checklist.id,expectedRevision:model.recordsRevision,expectedWorkshopRevision:model.workshopRevision})}catch{notice='Unable to open signature capture. Refresh and retry.'}finally{busy=false;if(active())render()}}));
  if(model.documentsAvailable&&typeof options.openDocument==='function'&&!pending)detail.append(button('Unpriced checklist PDF',async()=>{if(!online()){notice='Reconnect before exporting.';render();return}busy=true;render();try{await options.openDocument({checklistId:d.checklist.id,expectedRevision:model.recordsRevision,expectedWorkshopRevision:model.workshopRevision,...(model.signedDocumentsAvailable?{signedAvailable:true}:{})})}catch{notice='Unable to open checklist export. Refresh and retry.'}finally{busy=false;if(active())render()}}));
  if(typeof options.openTracking==='function')detail.append(button('Priority / promise / parts status',()=>options.openTracking(d.checklist.id)));
  if(model.qcAvailable){
   const box=node('article',null,{'data-mechanical-qc':'true'});box.append(node('h3','Mechanical quality check'),button('Check QC status',()=>loadQc()));
   if(qc?.checklistId===d.checklist.id){
    box.append(node('p',qc.delivered?'Delivered':!qc.workComplete?'Work is not complete.':!qc.mechanicalRequired?'Mechanical QC is not required for this job.':qc.mechanicalPassed?'Mechanical QC passed.':'Mechanical QC is pending.'));
    if(qc.deliveryReady&&model.deliveryAvailable&&initial.role==='Supervisor'&&caps.has('MECHANICAL_DELIVER')&&typeof options.openDelivery==='function')box.append(button('Review vehicle delivery',async()=>{try{await options.openDelivery(d.checklist.jobCard)}catch(e){notice=e.message;render()}}));
    if(qc.workComplete&&!qc.delivered&&initial.id==='SUP003'&&initial.role==='Supervisor'&&caps.has('MECHANICAL_QC')&&qc.mechanicalRequired){
     const f=form('Record QC result','MECHANICAL_QC',()=>d.checklist.id,v=>({result:v.get('result'),reason:String(v.get('reason')).trim(),expectedFingerprint:qc.workToken}));choice(f,'QC result','result',[{id:'PASS',name:'Pass'},{id:'FAIL',name:'Fail'}]);input(f,'QC notes (required for Fail)','reason','text','',false).maxLength=500;submit(f,'Confirm QC result');box.append(f);
    }
   }detail.append(box);
  }
  for(const task of d.tasks||[]){const card=node('article',null,{'data-task':task.id});card.append(node('h3',task.title));
   const allocations=(d.assignments||[]).filter(a=>a.taskId===task.id),ul=node('ul',null);
   for(const a of allocations){ul.append(node('li',a.employeeName+' · '+(a.rework?'Repeat cycle '+String(a.repeatCycleNo??'')+' · Responsible: '+String(a.responsibleName||'Review required')+' · '+String(a.repeatReason||'')+' · ':'')+(a.handedOverTo?'Handed over':a.cancelled?'Cancelled':a.completed?'Completed':a.running?'Working':'Open')+' · '+String(a.suggestedMinutes??0)+' allocated min'));}
   if(!allocations.length)ul.append(node('li','No mechanic assigned.'));card.append(ul);
   const available=(model.mechanics||[]).filter(m=>!allocations.some(a=>a.employeeId===m.id&&!a.completed&&!a.cancelled&&!a.handedOverTo));
   if(model.departmentConfigured&&caps.has('TASK_ASSIGN')){
    const f=form('Assign mechanic','TASK_ASSIGN',()=>task.id,v=>({employeeId:v.get('employee'),assignmentId:uuid(),suggestedMinutes:Number(v.get('minutes'))}));choice(f,'Mechanic','employee',available);const n=input(f,'Allocated minutes','minutes','number','60');n.min='0';n.max='60000';n.step='1';submit(f,'Assign mechanic');card.append(f);
   }
   const sources=allocations.filter(a=>!a.completed&&!a.cancelled&&!a.handedOverTo&&!a.running&&!a.rework);
   if(model.departmentConfigured&&caps.has('TASK_HANDOVER')&&sources.length){
    const f=form('Handover paused work','TASK_HANDOVER',()=>task.id,v=>({sourceAssignmentId:v.get('source'),targetEmployeeId:v.get('target'),successorAssignmentId:uuid(),suggestedMinutes:Number(v.get('minutes')),reason:String(v.get('reason')).trim()}));choice(f,'Outgoing mechanic','source',sources.map(a=>({id:a.id,name:a.employeeName})));choice(f,'Incoming mechanic','target',available);const n=input(f,'New allocated minutes','minutes','number','30');n.min='0';n.max='60000';n.step='1';input(f,'Handover reason','reason').maxLength=500;f.append(node('p','Pause or stop running work before handing it over. Recorded time stays with the original mechanic.',{class:'mc-muted'}));submit(f,'Confirm handover');card.append(f);
   }
   const finished=allocations.filter(a=>a.completed&&!a.cancelled&&!a.handedOverTo);
   if(model.repeatAvailable&&caps.has('TASK_REPEAT')&&finished.length){
    const f=form('Issue repeat repair','TASK_REPEAT',()=>task.id,v=>({sourceAssignmentId:v.get('source'),employeeId:v.get('employee'),mistakeEmployeeId:v.get('mistake'),assignmentId:uuid(),suggestedMinutes:Number(v.get('minutes')),reason:String(v.get('reason')).trim()}));choice(f,'Completed source work','source',finished.map(a=>({id:a.id,name:a.employeeName+(a.rework?' · repeat cycle '+a.repeatCycleNo:' · original work')})));choice(f,'Repeat mechanic','employee',model.mechanics||[]);choice(f,'Responsible employee','mistake',model.repeatMistakeEmployees||[]);const n=input(f,'Repeat allocated minutes','minutes','number','30');n.min='1';n.max='60000';n.step='1';input(f,'Repeat reason','reason').maxLength=500;f.append(node('p','Finish all original and previous repeat work first. Original hours stay with the original mechanic; repeat work needs fresh QC.',{class:'mc-muted'}));submit(f,'Confirm repeat repair');card.append(f);
   }
   detail.append(card);
  }
  if(caps.has('TASK_CREATE')){const f=form('Add independent task','TASK_CREATE',uuid,v=>({checklistId:d.checklist.id,title:String(v.get('title')).trim()}));input(f,'Task description','title').maxLength=200;submit(f,'Add task');detail.append(f)}
 }
 async function refresh(){
  if(!active()||busy)return false;if(!online()){notice='Reconnect to load workshop records.';render();return false}
  busy=true;qc=null;render();const generation=++readGeneration;
  try{const r=await options.api({action:'mechanical_dashboard',after,checklistId:selected});if(!active()||generation!==readGeneration)return false;if(!r?.ok)throw Error(r?.code||'NETWORK');model=r;if(!pending)notice='';return true}catch(e){if(active())notice=message(e.message);return false}finally{busy=false;render()}
 }
 async function loadQc(){
  if(!active()||busy||!selected||!model?.qcAvailable)return false;
  if(!online()){notice='Reconnect to check QC status.';render();return false}
  busy=true;qc=null;render();const generation=++readGeneration,checklistId=selected;
  try{const r=await options.api({action:'mechanical_qc_readiness',checklistId});if(!active()||generation!==readGeneration||selected!==checklistId)return false;if(!r?.ok||r.status?.checklistId!==checklistId)throw Error(r?.code||'NETWORK');qc=r.status;notice='';return true}catch(e){if(active())notice=message(e.message);return false}finally{busy=false;render()}
 }
 async function send(operation,entityId,payload){
  if(!active()||busy||(pending&&!pending.editing)||!model)return;if(!online()){notice='Reconnect before saving. No change was sent.';render();return}
  if(!device){notice='This device cannot keep a safe retry.';render();return}
  if(operation==='MECHANICAL_QC'&&(!qc?.workComplete||qc.delivered||qc.checklistId!==entityId)){notice='Refresh the QC check before confirming this change.';render();return}
  const previous=pending;pending={owner:initial.id,checklistId:selected,command:{operation,entityId,requestId:uuid(),deviceId:device,expectedRevision:operation==='MECHANICAL_QC'?qc.recordsRevision:model.recordsRevision,expectedWorkshopRevision:operation==='MECHANICAL_QC'?qc.workshopRevision:model.workshopRevision,payload}};
  try{savePending()}catch{pending=previous;notice='This device cannot keep a safe retry. No change was sent.';render();return}await post();
 }
 async function post(){
  if(!active()||busy||!pending)return;if(!online()){notice='Reconnect to retry the pending change.';render();return}
  if(pending.command.operation==='TASK_REPEAT'){delete pending.rejected;delete pending.reviewed;delete pending.error}
  try{savePending()}catch{notice='This device cannot keep a safe retry. No change was sent.';render();return}
  busy=true;notice='Confirming change…';render();let success=false;
  try{const r=await options.api({action:'mechanical_command',command:JSON.parse(JSON.stringify(pending.command))});if(!active())return;
   if(!r?.ok){pending.error=r?.code||'NETWORK';pending.rejected=pending.command.operation==='TASK_REPEAT'?knownRepeatRejection(r?.code):!!r?.code&&r.code!=='database_busy';savePending();notice=message(pending.error);return}
   const command=pending.command;if(command.operation==='TASK_REPEAT'&&(r.result?.requestId!==command.requestId||r.result?.operation!=='TASK_REPEAT'||r.result?.entityId!==command.entityId))throw Error('invalid_repeat_ack');storage.removeItem(key);pending=null;if(command.operation==='MC_CREATE')selected=r.result?.entityId||command.entityId;notice='Change confirmed.';success=true;
  }catch(e){if(active()){if(pending?.command.operation==='TASK_REPEAT'&&knownRepeatRejection(e.code||e.message)){pending.error=e.code||e.message;pending.rejected=true;try{savePending()}catch{}notice=message(pending.error)}else notice='Response not confirmed. Retry the same change.'}}finally{busy=false;render()}
  if(success&&active())await refresh();
 }
 function destroy(){disposed=true;readGeneration++;root.replaceChildren()}
 render();await refresh();return {refresh,destroy};
}
