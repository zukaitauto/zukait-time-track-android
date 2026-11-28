/* Staged Manager review screen; approval requires an explicitly supplied authenticated transport. */
(function(root){
 'use strict';
 function mount(container,{actor,snapshot,approve,queue,isCurrent=()=>false,requestId=()=>root.crypto.randomUUID()}={}){
  if(!container)return null;
  const doc=container.ownerDocument;
  const el=(tag,text)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;return e};
  container.replaceChildren();
  if(actor?.role!=='Manager'){container.append(el('p','Manager access required.'));return null;}
  let data;
  try{data=root.zukaitVehicleIndex.validate(snapshot)}catch(_){container.append(el('p','Catalogue unavailable.'));return null;}
  const heading=el('h2','Vehicle Index'),summary=el('p',data.makes.length+' makes · '+data.models.length+' models · Version '+data.version);
  const connected=typeof approve==='function';
  const note=el('p',connected?'Catalogue approval only. Existing Checklists and Job Cards will not change.':'Review only. Approval and existing-record correction are not connected.');
  const form=el('form');
  function field(title,tag){const label=el('label',title),f=el(tag);label.append(f);form.append(label);return f}
  const kind=field('Action','select'),make=field('Vehicle make','select'),target=field('Correct name','select'),value=field('New name or spelling','input'),reason=field('Reason','textarea');
  value.maxLength=160;value.required=true;reason.maxLength=500;reason.required=true;
  function option(parent,id,name){const e=el('option',name);e.value=id;parent.append(e)}
  for(const [id,name] of [['ADD_MAKE','Add brand'],['ADD_MODEL','Add model'],['MAKE_ALIAS','Brand spelling correction'],['MODEL_ALIAS','Model spelling correction']])option(kind,id,name);
  for(const row of [...data.makes].sort((a,b)=>a.name.localeCompare(b.name,'en')))option(make,row.id,row.name);
  const result=el('p');result.setAttribute('role','status');
  let pending=null,busy=false,finished=false,uncertain=false;
  const confirm=connected?el('button','Confirm catalogue approval'):null;
  if(confirm){confirm.type='button';confirm.hidden=true;confirm.disabled=true;}
  function resetProposal(){if(busy||uncertain||finished)return;pending=null;if(confirm){confirm.hidden=true;confirm.disabled=true;}result.textContent='';}
  function refresh(){
   resetProposal();
   const k=kind.value;
   make.parentElement.hidden=!['ADD_MODEL','MODEL_ALIAS'].includes(k);
   target.parentElement.hidden=!['MAKE_ALIAS','MODEL_ALIAS'].includes(k);
   target.replaceChildren();
   const rows=k==='MAKE_ALIAS'?data.makes:k==='MODEL_ALIAS'?data.models.filter(m=>m.makeId===make.value):[];
   for(const row of [...rows].sort((a,b)=>a.name.localeCompare(b.name,'en')))option(target,row.id,row.name);
  }
  kind.addEventListener('change',refresh);make.addEventListener('change',refresh);
  for(const field of [target,value,reason])field.addEventListener('input',resetProposal);
  const button=el('button','Preview proposal');button.type='submit';form.append(button);
  form.addEventListener('submit',e=>{
   e.preventDefault();
   if(busy||finished||uncertain)return;
   resetProposal();
   const k=kind.value;
   const request={kind:k,value:value.value,reason:reason.value,expectedVersion:data.version,...(['ADD_MODEL','MODEL_ALIAS'].includes(k)?{makeId:make.value}:{}),...(['MAKE_ALIAS','MODEL_ALIAS'].includes(k)?{targetId:target.value}:{})};
   const r=root.zukaitVehicleIndexReview.preview(data,request,actor);
   result.textContent=r.ok?'Proposal: '+r.value+(r.targetName?' → '+r.targetName:'')+' · No changes saved.':'Cannot prepare proposal: '+r.code.replace(/_/g,' ');
   if(r.ok&&confirm&&isCurrent()){pending={action:'vehicle_index_approval',operation:'APPROVE',requestId:requestId(),proposal:{kind:r.kind,value:r.value,makeId:r.makeId,targetId:r.targetId,reason:r.reason,expectedVersion:r.version}};confirm.hidden=false;confirm.disabled=false;}
  });
  if(confirm){
   form.append(confirm);
   const controls=[kind,make,target,value,reason,button];
   function lock(locked){for(const field of controls)field.disabled=locked;}
   confirm.addEventListener('click',async()=>{
    if(!pending||busy||finished)return;
    if(!container.isConnected||!isCurrent()){result.textContent='Manager session changed. Reopen the Vehicle Index.';confirm.disabled=true;return;}
    busy=true;lock(true);confirm.disabled=true;
    const command=JSON.parse(JSON.stringify(pending));
    result.textContent='Waiting for server confirmation…';
    try{
     const r=await approve(command);
     if(!container.isConnected||!isCurrent()){finished=true;result.textContent='Session changed. Reopen the Vehicle Index to verify the outcome.';return;}
     if(r?.ok===true&&r.requestId===pending.requestId&&r.version===pending.proposal.expectedVersion+1&&typeof r.entryId==='string'&&r.entryId){
      finished=true;uncertain=false;result.textContent='Catalogue approval confirmed. Version '+r.version+'. Reopen to load the updated catalogue.';confirm.hidden=true;
     }else if(r?.ok===false&&['manager_required','invalid_session','catalogue_not_initialized','catalogue_changed','request_id_conflict','name_exists','unknown_target','invalid_request','vehicle_index_approval_disabled'].includes(r.code)){
      finished=true;uncertain=false;result.textContent='Approval rejected: '+r.code.replace(/_/g,' ')+'. Reopen the Vehicle Index.';confirm.hidden=true;
     }else throw Error('unconfirmed');
    }catch(_){
     if(!container.isConnected||!isCurrent()){finished=true;return;}
     uncertain=true;result.textContent='Server outcome unconfirmed. Retry the identical approval; do not create a new request.';confirm.textContent='Retry same approval';
    }finally{busy=false;if(!finished)confirm.disabled=false;if(!uncertain&&!finished)lock(false);}
   });
  }
  container.append(heading,summary,note);
  if(typeof queue==='function'){
   const section=el('section'),load=el('button','New vehicle names — review'),more=el('button','Next page'),status=el('p'),rows=el('div');
   load.type=more.type='button';more.hidden=true;status.setAttribute('role','status');let cursor=null,loading=false;
   async function page(after){
    if(loading||!container.isConnected||!isCurrent()||busy||uncertain||finished)return;
    loading=true;load.disabled=more.disabled=true;status.textContent='Loading new names…';rows.replaceChildren();
    try{
     const r=await queue({action:'vehicle_index_intake_queue',operation:'LIST',after});
     if(!container.isConnected||!isCurrent())return;
     if(!r?.ok||r.version!==data.version||!Array.isArray(r.rows)||r.rows.length>50){status.textContent='Catalogue changed or queue unavailable. Reopen Vehicle Index.';cursor=null;more.hidden=true;return;}
     status.textContent=r.rows.length?r.rows.length+' pending name(s)':'No pending names on this page.';cursor=r.next;more.hidden=!cursor;
     for(const entry of r.rows){
      const line=el('div'),pick=el('button','Review '+entry.make+' '+entry.model);pick.type='button';
      line.append(pick,el('small',' '+entry.sourceKind+' '+entry.sourceId));
      pick.addEventListener('click',()=>{
       if(!container.isConnected||!isCurrent()||busy||uncertain||finished)return;
       const known=data.makes.find(m=>m.name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ')===entry.makeKey)||data.makes.find(m=>data.aliases.some(a=>a.kind==='make'&&a.targetId===m.id&&a.value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ')===entry.makeKey));
       kind.value=known?'ADD_MODEL':'ADD_MAKE';if(known)make.value=known.id;refresh();value.value=known?entry.model:entry.make;reason.value='';status.textContent=known?'Verify spelling or select Model spelling correction before approval.':'Review the new brand first; reopen to review its model.';
      });rows.append(line);
     }
    }catch(_){status.textContent='Queue unavailable. Retry.';cursor=null;more.hidden=true;}
    finally{loading=false;load.disabled=more.disabled=false;}
   }
   load.addEventListener('click',()=>page(null));more.addEventListener('click',()=>{if(cursor)page(cursor)});
   const sourceKind=el('select'),sourceId=el('input'),recover=el('button','Recover saved checklist');recover.type='button';sourceId.placeholder='Checklist number';sourceId.maxLength=80;
   option(sourceKind,'RECEPTION_CHECKLIST','Reception Checklist');option(sourceKind,'MECHANICAL_CHECKLIST','Mechanical Checklist');
   recover.addEventListener('click',async()=>{
    if(loading||!container.isConnected||!isCurrent()||busy||uncertain||finished||!sourceId.value.trim())return;
    loading=true;recover.disabled=true;status.textContent='Checking saved checklist…';
    try{const r=await queue({action:'vehicle_index_intake_queue',operation:'RECOVER',sourceKind:sourceKind.value,sourceId:sourceId.value.trim()});if(!container.isConnected||!isCurrent())return;status.textContent=r?.ok?(r.status==='ALREADY_INDEXED'?'Already in catalogue.':'Captured. Refresh pending names.'):'Unable to recover: '+String(r?.code||'unavailable').replace(/_/g,' ');}
    catch(_){if(isCurrent())status.textContent='Recovery unavailable. Retry safely.';}finally{loading=false;recover.disabled=false;}
   });section.append(load,more,status,rows,sourceKind,sourceId,recover);container.append(section);
  }
  container.append(form,result);refresh();
  return Object.freeze({form,result,confirm});
 }
 root.zukaitVehicleIndexManager=Object.freeze({mount});
})(typeof window!=='undefined'?window:globalThis);
