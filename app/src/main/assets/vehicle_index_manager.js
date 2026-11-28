/* Staged Manager review screen: deliberately offers no Save or Approve action. */
(function(root){
 'use strict';
 function mount(container,{actor,snapshot}={}){
  if(!container)return null;
  const doc=container.ownerDocument;
  const el=(tag,text)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;return e};
  container.replaceChildren();
  if(actor?.role!=='Manager'){container.append(el('p','Manager access required.'));return null;}
  let data;
  try{data=root.zukaitVehicleIndex.validate(snapshot)}catch(_){container.append(el('p','Catalogue unavailable.'));return null;}
  const heading=el('h2','Vehicle Index'),summary=el('p',data.makes.length+' makes · '+data.models.length+' models · Version '+data.version);
  const note=el('p','Review only. Approval and existing-record correction are not connected.');
  const form=el('form');
  function field(title,tag){const label=el('label',title),f=el(tag);label.append(f);form.append(label);return f}
  const kind=field('Action','select'),make=field('Vehicle make','select'),target=field('Correct name','select'),value=field('New name or spelling','input'),reason=field('Reason','textarea');
  value.maxLength=160;value.required=true;reason.maxLength=500;reason.required=true;
  function option(parent,id,name){const e=el('option',name);e.value=id;parent.append(e)}
  for(const [id,name] of [['ADD_MAKE','Add brand'],['ADD_MODEL','Add model'],['MAKE_ALIAS','Brand spelling correction'],['MODEL_ALIAS','Model spelling correction']])option(kind,id,name);
  for(const row of [...data.makes].sort((a,b)=>a.name.localeCompare(b.name,'en')))option(make,row.id,row.name);
  const result=el('p');result.setAttribute('role','status');
  function refresh(){
   result.textContent='';
   const k=kind.value;
   make.parentElement.hidden=!['ADD_MODEL','MODEL_ALIAS'].includes(k);
   target.parentElement.hidden=!['MAKE_ALIAS','MODEL_ALIAS'].includes(k);
   target.replaceChildren();
   const rows=k==='MAKE_ALIAS'?data.makes:k==='MODEL_ALIAS'?data.models.filter(m=>m.makeId===make.value):[];
   for(const row of [...rows].sort((a,b)=>a.name.localeCompare(b.name,'en')))option(target,row.id,row.name);
  }
  kind.addEventListener('change',refresh);make.addEventListener('change',refresh);
  const button=el('button','Preview proposal');button.type='submit';form.append(button);
  form.addEventListener('submit',e=>{
   e.preventDefault();
   const k=kind.value;
   const request={kind:k,value:value.value,reason:reason.value,expectedVersion:data.version,...(['ADD_MODEL','MODEL_ALIAS'].includes(k)?{makeId:make.value}:{}),...(['MAKE_ALIAS','MODEL_ALIAS'].includes(k)?{targetId:target.value}:{})};
   const r=root.zukaitVehicleIndexReview.preview(data,request,actor);
   result.textContent=r.ok?'Proposal: '+r.value+(r.targetName?' → '+r.targetName:'')+' · No changes saved.':'Cannot prepare proposal: '+r.code.replace(/_/g,' ');
  });
  container.append(heading,summary,note,form,result);refresh();
  return Object.freeze({form,result});
 }
 root.zukaitVehicleIndexManager=Object.freeze({mount});
})(typeof window!=='undefined'?window:globalThis);
