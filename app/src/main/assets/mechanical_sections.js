const titles={estimate:'Estimate','estimate-list':'Estimate List','create-job':'Create Job Card',jobs:'Job Cards',wip:'WIP',qc:'QC Pending',ready:'Ready for Delivery',delivered:'Delivered Vehicles',exceeded:'Suggested Time Exceed'};
export async function mountMechanicalSection(root,options={}){
 const doc=root.ownerDocument,win=doc.defaultView,initial=options.getSession?.(),owner=JSON.stringify(initial),section=options.section,storage=options.storage||globalThis.localStorage;
 const journal='zukait_mechanical_section_pending_v1:'+String(initial?.id||'');let disposed=false,busy=false,model=null,notice='',search='',pending=null,review=null,draft={},iframe=null,estimateOpened=false;
 const online=()=>options.online?.()??win.navigator.onLine;
 const current=()=>!disposed&&options.isEnabled?.()!==false&&JSON.stringify(options.getSession?.())===owner&&(initial?.role==='Manager'||initial?.id==='SUP003'&&['Supervisor','Mechanical Supervisor'].includes(initial.role));
 const n=(tag,text,attrs={})=>{const e=doc.createElement(tag);if(text!=null)e.textContent=text;for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
 const b=(text,fn)=>{const e=n('button',text,{type:'button'});e.disabled=busy;e.onclick=async()=>{if(!current()||busy)return;try{await fn();}catch(error){if(current()){notice=error.message||'Unable to open this screen.';render();}}};return e;};
 const uuid=()=>options.uuid?.()||globalThis.crypto.randomUUID();
 const errorMessage=code=>({mechanical_forbidden:'This account cannot open Mechanical records.',mechanical_invalid_session:'Your login changed. Sign in again.',invalid_session:'Your login changed. Sign in again.',reception_job_number_exists:'This Job Card number already exists. Review the existing record.',job_number_exists:'This Job Card number already exists.',reception_received_confirmation_required:'Confirm that the vehicle was received.',reception_vehicle_required:'Enter the make, model and year.',reception_approval_confirmation_required:'Confirm the recorded insurance approval.',reception_reason_required:'Enter the reason for creating this job.',mechanical_estimate_revision_conflict:'This estimate changed on another device. Refresh and review it.'})[code]||'The server did not confirm this change. Keep the saved request and retry, or review the entered details.';
 function hasEstimatePending(){return Object.keys(storage).some(k=>k.startsWith('zukait_mechanical_estimate_pending_v1:'+initial.id+':'));}
 async function back(){if(pending||hasEstimatePending()){notice='Confirm the saved change before leaving this screen.';render();return;}destroy();await options.onBack?.();}
 try{const saved=storage.getItem(journal);if(saved){pending=JSON.parse(saved);if(pending.owner!==initial?.id||!pending.command)throw Error('invalid_pending');}}catch{notice='The saved request needs review. Preserve device data.';pending={unreadable:true};}
 async function load(){if(!current()||busy||pending)return;busy=true;render();try{if(!online())throw Error('OFFLINE');const result=await options.api({action:'mechanical_section',command:{operation:'READ',view:section}});if(!current()||!online())return;if(!result?.ok)throw Error(result?.code||'NETWORK');model=result;notice='';}catch(error){if(current())notice=errorMessage(error.code||error.message);}finally{busy=false;if(current())render();}}
 async function post(){if(!current()||busy||!pending?.command)return;busy=true;render();try{if(!online())throw Error('OFFLINE');const r=await options.api({action:'mechanical_section',command:pending.command});if(!current())return;if(!r?.ok)throw Error(r?.code||'NETWORK');if(r.request_id!==pending.command.request_id)throw Error('NETWORK');storage.removeItem(journal);pending=null;review=null;draft={};notice='Mechanical Job Card created. Register its checklist to assign work.';model=null;}catch(error){if(current()){pending.error=error.code||error.message;notice=errorMessage(pending.error);storage.setItem(journal,JSON.stringify(pending));}}finally{busy=false;if(current())render();}if(!pending&&current())await load();}
 const label=(form,text,name,type='text',required=true)=>{const l=n('label',text),e=n('input',null,{name,type});e.required=required;e.value=draft[name]||'';l.append(e);form.append(l);return e;};
 function summary(command){const c=command?.command||{},details=c.details||{};const out=n('div',null);for(const text of ['JC '+String(c.job_card||''),String(c.job_type||''),[details.make,details.model,details.year,details.registration].filter(Boolean).join(' · '),'Reason: '+String(c.reason||'')])out.append(n('p',text));return out;}
 function jobForm(){const form=n('form',null);form.append(n('h3','New Mechanical Job Card'));label(form,'Job Card number','job_card');
  const typeLabel=n('label','Job type'),type=n('select',null,{name:'job_type'});for(const v of ['CASH','CREDIT'])type.append(n('option',v,{value:v}));type.value=draft.job_type||'CASH';typeLabel.append(type);form.append(typeLabel);
  for(const [text,name,required] of [['Make','make',true],['Model','model',true],['Year','year',true],['Registration','registration',true],['VIN (optional)','vin',false],['Customer','customer',true],['Contact','contact',true],['Remarks (optional)','remarks',false]])label(form,text,name,'text',required);
  // Capture VIN label with the phone camera. Use native OCR only when provided by the host;
  // never guess or silently save an uncertain recognition.
  const vinInput=form.querySelector('input[name="vin"]');
  if(vinInput){
   vinInput.maxLength=17;vinInput.autocapitalize='characters';vinInput.setAttribute('autocomplete','off');
   const camera=n('input',null,{type:'file',accept:'image/*',capture:'environment','aria-label':'Photograph VIN label'});
   camera.style.cssText='position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
   const scan=n('button','📷 Capture VIN photo',{type:'button'});
   const status=n('p','',{role:'status'});status.style.cssText='font-size:14px;color:#334b66';
   scan.onclick=()=>camera.click();
   camera.onchange=async()=>{
    const file=camera.files?.[0];if(!file)return;
    status.textContent='Photo captured. Checking whether this device supports VIN text recognition…';
    try{
     if(typeof win.TextDetector!=='function'){status.textContent='Automatic VIN reading is not supported on this device yet. Please enter the VIN manually from the photo.';return;}
     const bitmap=await win.createImageBitmap(file);
     let blocks;
     try{blocks=await (new win.TextDetector()).detect(bitmap);}finally{bitmap.close?.();}
     const text=blocks.map(x=>x.rawValue||'').join(' ').toUpperCase();
     const candidates=text.replace(/[^A-Z0-9]/g,' ').split(/\\s+/).filter(x=>/^[A-HJ-NPR-Z0-9]{17}$/.test(x));
     const unique=[...new Set(candidates)];
     if(unique.length!==1){status.textContent='Could not confidently identify one 17-character VIN. Retake the photo or enter it manually.';return;}
     if(win.confirm('VIN detected: '+unique[0]+'\\nConfirm this matches the vehicle?')){vinInput.value=unique[0];status.textContent='VIN inserted. Please verify it before saving.';}
     else status.textContent='VIN not inserted. Retake the photo or enter it manually.';
    }catch{status.textContent='VIN reading unavailable. Please enter the VIN manually.';}
    finally{camera.value='';}
   };
   vinInput.addEventListener('input',()=>{vinInput.value=vinInput.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,17);});
   vinInput.parentElement.append(scan,camera,status);
  }
  // Only offer customers from this authorized Mechanical API response; never mix in
  // cached records from a different login or an unverified Body Workshop list.
  const customerInput=form.querySelector('input[name="customer"]');
  const customerNames=[...new Set((model?.customers||[]).map(x=>typeof x==='string'?x:x?.name).filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))].sort((a,b)=>a.localeCompare(b));
  if(customerInput&&customerNames.length){
   const suggestions=n('datalist',null,{id:'mc-customer-suggestions'});
   for(const name of customerNames)suggestions.append(n('option',null,{value:name}));
   customerInput.setAttribute('list','mc-customer-suggestions');
   customerInput.setAttribute('autocomplete','off');
   customerInput.parentElement.append(suggestions);
  }
  const credit=label(form,'Credit account','credit_account'),cash=label(form,'Cash amount (optional)','cash_amount','number',false);cash.min='0';cash.step='0.001';
  const insurerLabel=n('label','Insurance company'),insurer=n('select',null,{name:'insurance_id'});insurer.append(n('option','Select…',{value:''}));for(const company of model?.companies||[])insurer.append(n('option',company.name,{value:company.id}));insurer.value=draft.insurance_id||'';insurerLabel.append(insurer);form.append(insurerLabel);
  const reference=label(form,'Approval reference','reference'),date=label(form,'Approval date','approval_date','date'),evidence=label(form,'Approval evidence / notes','evidence');
  const confirmation=(text,name)=>{const l=n('label',text),e=n('input',null,{name,type:'checkbox'});e.checked=draft[name]==='on';l.prepend(e);form.append(l);return e;};
  const approved=confirmation('Insurance approval has been recorded','approval_confirmed'),received=confirmation('Vehicle received and details checked','received_confirmed');received.required=true;const notesLabel=n('label','Work Description / Notes'),notes=n('textarea',null,{name:'reason',rows:'6',maxlength:'2000',placeholder:'Describe the repair work required…'});notes.value=draft.reason||'';notes.style.cssText='width:100%;min-height:150px;box-sizing:border-box;padding:12px;border:1px solid #bdd0e5;border-radius:9px;font:inherit;resize:vertical';notes.required=true;notesLabel.append(notes);form.append(notesLabel);
  const update=()=>{const insurance=type.value==='INSURANCE';for(const el of [insurer,reference,date,evidence,approved]){el.parentElement.hidden=!insurance;el.required=insurance;}credit.parentElement.hidden=type.value!=='CREDIT';credit.required=type.value==='CREDIT';cash.parentElement.hidden=type.value!=='CASH';};type.onchange=update;update();
  const submit=n('button','Review Job Card',{type:'submit'});submit.disabled=busy;form.append(submit);form.onsubmit=e=>{e.preventDefault();if(!current()||busy)return;draft=Object.fromEntries(new win.FormData(form));const request=uuid(),kind=draft.job_type;
   const command={operation:'CREATE_DIRECT_JOB',request_id:request,job_card:String(draft.job_card).trim().toUpperCase(),job_type:kind,details:Object.fromEntries(['make','model','year','registration','vin','customer','contact','remarks'].map(k=>[k,String(draft[k]||'').trim()])),received_confirmed:draft.received_confirmed==='on',reason:String(draft.reason||'').trim()};
   if(kind==='CASH'&&String(draft.cash_amount||'').trim())command.cash_amount=String(draft.cash_amount);if(kind==='CREDIT')command.credit_account=String(draft.credit_account||'');if(kind==='INSURANCE')Object.assign(command,{insurance_id:String(draft.insurance_id),reference:String(draft.reference),approval_date:String(draft.approval_date),evidence:String(draft.evidence),approval_confirmed:draft.approval_confirmed==='on'});
   review={operation:'CREATE_JOB',request_id:request,command};render();};return form;
 }
 function render(){if(disposed)return;root.replaceChildren();iframe=null;if(!current()){root.append(n('p','Your login changed. Reopen Mechanical Department.'));return;}if(!online()){root.append(n('p','Reconnect to open Mechanical records. Saved changes are retained.'));return;}
  root.className='mc-section-screen';const style=n('style',null);style.textContent='.mc-section-screen{max-width:1050px;margin:auto;padding:18px;background:#f4f8ff;color:#21334b;border-radius:18px;font:16px/1.5 system-ui}.mc-section-screen header{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.mc-section-screen button{font:inherit;min-height:44px;padding:9px 13px;margin:4px;border:1px solid #bdd0e5;border-radius:10px;background:white;color:#21334b}.mc-section-screen label{display:grid;gap:6px;margin:12px 0}.mc-section-screen input,.mc-section-screen select{font:inherit;box-sizing:border-box;width:100%;min-width:0;padding:10px;border:1px solid #bdd0e5;border-radius:9px}.mc-section-screen input[type=checkbox]{width:24px;height:24px}.mc-section-screen article,.mc-section-screen form{background:white;border:1px solid #d2e0ef;border-radius:12px;padding:14px;margin:12px 0}.mc-section-screen iframe{display:block;width:100%;height:1100px;border:0;background:white}.mc-section-screen [role=status]{overflow-wrap:anywhere}.mc-section-screen :focus-visible{outline:3px solid #327db5;outline-offset:2px}.mc-section-screen [hidden]{display:none!important}.mc-section-screen,.mc-section-screen p,.mc-section-screen label,.mc-section-screen h2,.mc-section-screen h3,.mc-section-screen article{color:#21334b!important;opacity:1!important}.mc-section-screen input,.mc-section-screen select,.mc-section-screen textarea{color:#17283e!important;background:#fff!important;opacity:1!important}.mc-section-screen input::placeholder,.mc-section-screen textarea::placeholder{color:#53657b!important;opacity:1}.mc-section-screen button{color:#21334b!important;background:#fff!important;font-weight:650!important;opacity:1!important}.mc-section-screen button:disabled{color:#53657b!important;background:#e8eef5!important}.mc-section-screen [role=status]{color:#334b66!important}';root.append(style);
  const head=n('header',null);head.append(n('h2',titles[section]||'Mechanical records'),b('← Mechanical dashboard',back));root.append(head,n('p','Mechanical records only'),n('p',notice,{role:'status'}));
  if(pending){root.append(n('h3','Saved change awaiting confirmation'));if(pending.command)root.append(summary(pending.command),b('Retry same change',post));if(pending.error&&/^(reception_|job_number_|invalid_mechanical_)/.test(pending.error))root.append(b('Edit rejected details',()=>{draft={...pending.command.command.details,...pending.command.command,received_confirmed:pending.command.command.received_confirmed?'on':''};storage.removeItem(journal);pending=null;review=null;render();}));root.append(b('Return to Mechanical dashboard (keep saved request)',()=>{destroy();return options.onBack?.();}));return;}
  if(review){root.append(n('h3','Review Job Card'),summary(review),b('← Edit',()=>{review=null;render();}),b('Confirm and create',()=>{pending={owner:initial.id,command:review};storage.setItem(journal,JSON.stringify(pending));return post();}));return;}
  if(['estimate','estimate-list'].includes(section)){iframe=n('iframe',null,{title:'Mechanical '+titles[section],src:'mechanical_estimate.html?mode='+(section==='estimate'&&!estimateOpened?'new':'list')});estimateOpened=true;root.append(iframe);return;}
  if(!model){root.append(n('p','Loading Mechanical records…'));return;}
  if(section==='create-job'){root.append(jobForm());return;}
  const searchInput=n('input',null,{type:'search',placeholder:'Search Job Card / registration','aria-label':'Search Mechanical jobs'});searchInput.value=search;searchInput.oninput=()=>{search=searchInput.value;renderRows();};root.append(searchInput);
  const list=n('div',null,{'data-mechanical-section-list':''});root.append(list);
  function renderRows(){list.replaceChildren();const qc=new Map((model.qc?.rows||[]).map(r=>[String(r.jobCard),r]));let jobs=(model.jobs||[]).filter(j=>!j.deleted&&!j.cancelled);
   if(section==='delivered')jobs=jobs.filter(j=>j.delivered);else jobs=jobs.filter(j=>!j.delivered&&!j.archived);
   if(section==='qc')jobs=jobs.filter(j=>qc.get(String(j.no))?.qcVisible);if(section==='ready')jobs=jobs.filter(j=>qc.get(String(j.no))?.deliveryReady);if(section==='wip')jobs=jobs.filter(j=>!qc.get(String(j.no))?.deliveryReady);
   if(section==='exceeded')jobs=jobs.filter(j=>(model.assign||[]).some(a=>a.job===j.no&&!a.cancelled&&!a.handedOverToAssignmentId&&a.workedMinutes>Number(a.suggested||0)));
   const q=search.toLowerCase().trim();jobs=jobs.filter(j=>!q||[j.no,j.reg,j.vehicle,j.make,j.model].some(v=>String(v||'').toLowerCase().includes(q)));
   for(const job of jobs){const row=n('article',null);row.append(n('h3','JC '+job.no),n('p',[job.vehicle||[job.make,job.model].filter(Boolean).join(' '),job.year,job.reg].filter(Boolean).join(' · ')),n('p',job.delivered?'Delivered':qc.get(String(job.no))?.deliveryReady?'Ready for delivery':qc.get(String(job.no))?.qcVisible?'QC pending':String(job.status||'Open')));
    if(job.checklistId)row.append(b('Open Mechanical checklist',()=>options.openChecklist?.(job.checklistId)));else if(!job.delivered)row.append(b('Create checklist for this Job Card',()=>options.createChecklist?.(job.no)));list.append(row);
   }if(!jobs.length)list.append(n('p','No Mechanical records match this section.'));
  }renderRows();
 }
 const message=event=>{if(current()&&iframe&&event.source===iframe.contentWindow&&event.origin===win.location.origin&&event.data?.mechanicalEstimateBack===true)back();};
 const changed=event=>{if(event.type==='storage'&&event.key&&event.key!=='zukait_secure_session_v42')return;if(!current()){destroy();return;}if(!online()){model=null;render();}else if(event.type==='online'){if(['estimate','estimate-list'].includes(section)||pending)render();else load();}};
 win.addEventListener('message',message);for(const event of ['storage','offline','online'])win.addEventListener(event,changed);
 function destroy(){disposed=true;win.removeEventListener('message',message);for(const event of ['storage','offline','online'])win.removeEventListener(event,changed);root.replaceChildren();}
 render();if(!['estimate','estimate-list'].includes(section)&&!pending)await load();return {destroy,refresh:load};
}
