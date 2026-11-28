/* Optional make/model entry assistance. No identity, save or network authority. */
(function(root){
 'use strict';
 const mounted=new WeakMap();
 let provider=null;
 const normalize=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
 function configure(index){
  if(!index||typeof index.searchMakes!=='function'||typeof index.searchModels!=='function'||typeof index.resolve!=='function')throw Error('invalid_vehicle_index');
  provider=index;
 }
 function liveIndex(index){return index||{searchMakes:(...args)=>provider.searchMakes(...args),searchModels:(...args)=>provider.searchModels(...args),resolve:(...args)=>provider.resolve(...args)};}
 function attach(form,index=null,fields=null){
  if(!form||(!index&&!provider)||mounted.has(form))return mounted.get(form)||null;
  index=liveIndex(index);
  const make=fields?.make||form.elements?.namedItem('make'),model=fields?.model||form.elements?.namedItem('model');
  if(!make||!model||!make.parentElement||!model.parentElement||!form.contains(make)||!form.contains(model)||make.readOnly||model.readOnly||make.disabled||model.disabled)return null;
  const doc=form.ownerDocument;
  if(!doc)return null;
  function makePanel(field){
   const panel=doc.createElement('div');
   panel.hidden=true;panel.setAttribute('role','group');panel.setAttribute('aria-label',field===make?'Vehicle make suggestions':'Vehicle model suggestions');
   panel.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin:5px 0;max-height:160px;overflow:auto';
   // The hidden attribute must win over the inline flex declaration.
   panel.style.display='none';
   const status=doc.createElement('small');
   status.setAttribute('role','status');status.style.cssText='display:block;margin-top:4px';
   field.insertAdjacentElement('afterend',panel);panel.insertAdjacentElement('afterend',status);
   return {field,panel,status};
  }
  const mp=makePanel(make),dp=makePanel(model);
  let choosing=false;
  function hide(p){if(p.hiding)return;p.hiding=true;try{p.panel.hidden=true;p.panel.style.display='none';p.panel.replaceChildren()}finally{p.hiding=false}}
  function exactMake(){
   const q=normalize(make.value);
   if(!q)return null;
   return index.searchMakes(make.value,100).find(r=>normalize(r.name)===q)||null;
  }
  function emit(field){
   const EventType=doc.defaultView?.Event;
   if(EventType){field.dispatchEvent(new EventType('input',{bubbles:true}));field.dispatchEvent(new EventType('change',{bubbles:true}));}
  }
  function select(p,row){
   if(!form.isConnected||p.field.readOnly||p.field.disabled||make.readOnly||model.readOnly||make.disabled||model.disabled){hide(p);return;}
   if(p===mp&&!index.searchMakes(p.field.value,12).some(r=>r.id===row.id)){hide(p);return;}
   if(p===dp){const current=exactMake();if(!current||!index.searchModels(current.id,p.field.value,12).some(r=>r.id===row.id)){hide(p);return;}}
   choosing=true;
   try{
    p.field.value=row.name;
    hide(p);p.status.textContent='';
    emit(p.field);
    if(p===mp){
     hide(dp);
     const result=model.value?index.resolve(make.value,model.value):null;
     dp.status.textContent=result?.status==='REVIEW_REQUIRED'?'Check the model for the selected make. Existing text is retained until you choose a model.':'';
    }else dp.status.textContent='';
   }finally{choosing=false}
  }
  function render(p){
   hide(p);p.status.textContent='';
   if(make.disabled||model.disabled||make.readOnly||model.readOnly||!p.field.value.trim())return;
   const mk=p===dp?exactMake():null;
   if(p===dp&&!mk){p.status.textContent='Select or enter a known vehicle make first. You may still enter a model manually.';return}
   const list=p===mp?index.searchMakes(p.field.value,12):index.searchModels(mk.id,p.field.value,12);
   if(!list.length){p.status.textContent='Not in the catalogue. Verify the spelling; manual entry remains available.';return}
   for(const row of list){
    const b=doc.createElement('button');b.type='button';b.textContent=row.name;
    b.style.cssText='padding:7px 10px;max-width:100%;white-space:normal;text-align:left';
    b.addEventListener('click',()=>select(p,row));
    p.panel.appendChild(b);
   }
   p.panel.hidden=false;p.panel.style.display='flex';
  }
  function onMake(){if(choosing)return;hide(dp);dp.status.textContent='';render(mp)}
  function onModel(){if(choosing)return;hide(mp);render(dp)}
  make.addEventListener('input',onMake);model.addEventListener('input',onModel);
  make.addEventListener('focus',onMake);model.addEventListener('focus',onModel);
  function keyboard(e,p){
   if(e.key==='Escape'){hide(p);return}
   if(e.key==='ArrowDown'&&!p.panel.hidden){const first=p.panel.querySelector('button');if(first){e.preventDefault();first.focus()}}
  }
  make.addEventListener('keydown',e=>keyboard(e,mp));model.addEventListener('keydown',e=>keyboard(e,dp));
  function closeOnLeave(e){if(!form.contains(e.relatedTarget)){hide(mp);hide(dp)}}
  form.addEventListener('focusout',closeOnLeave);
  // Programmatic lookups do not fire input in all existing hosts. Always
  // read current make/model on interaction, never remember a stale selection.
  const mountedState=Object.freeze({makePanel:mp.panel,modelPanel:dp.panel});
  mounted.set(form,mountedState);return mountedState;
 }
 // Estimates persist a single combined make/model string. Keep its existing
 // field and payload; offer two-step suggestions without creating named fields.
 const combined=new WeakMap();
 function attachCombined(field,canEdit=()=>true,index=null){
  if(!field||(!index&&!provider)||!field.parentElement||field.readOnly||field.disabled||!canEdit()||combined.has(field))return combined.get(field)||null;
  index=liveIndex(index);
  const doc=field.ownerDocument,panel=doc.createElement('div'),status=doc.createElement('small');
  panel.hidden=true;panel.style.cssText='display:none;flex-wrap:wrap;gap:6px;max-height:160px;overflow:auto;margin:5px 0';
  panel.setAttribute('role','group');panel.setAttribute('aria-label','Vehicle make and model suggestions');
  status.setAttribute('role','status');status.style.cssText='display:block;margin-top:4px';
  field.insertAdjacentElement('afterend',panel);panel.insertAdjacentElement('afterend',status);
  const editable=()=>field.isConnected&&!field.readOnly&&!field.disabled&&canEdit();
  let hiding=false;
  function hide(){if(hiding)return;hiding=true;try{panel.hidden=true;panel.style.display='none';panel.replaceChildren()}finally{hiding=false}}
  function render(){
   hide();status.textContent='';
   if(!editable())return;
   const input=field.value,query=normalize(input);
   if(!query)return;
   // Use the longest exact make prefix (e.g. Land Rover, not Land).
   const words=query.split(' '),prefixes=[];
   for(let n=words.length;n>=1;n--)prefixes.push(words.slice(0,n).join(' '));
   let selected=null,rest='';
   for(const prefix of prefixes){
    if(prefix===query&&!/\s$/.test(input))continue;
    const match=index.searchMakes(prefix,100).find(m=>normalize(m.name)===prefix);
    if(match){selected=match;rest=query.slice(prefix.length).trim();break}
   }
   if(selected&&!rest){status.textContent='Type the vehicle model.';return}
   const rows=selected?index.searchModels(selected.id,rest,12):index.searchMakes(input,12);
   if(!rows.length){status.textContent='Not in the catalogue. Manual entry remains available.';return}
   for(const row of rows){
    const button=doc.createElement('button');button.type='button';button.textContent=row.name;
    button.style.cssText='padding:7px 10px;max-width:100%;white-space:normal;text-align:left';
    button.addEventListener('click',()=>{
     if(!editable()||field.value!==input||!(selected?index.searchModels(selected.id,rest,12):index.searchMakes(input,12)).some(r=>r.id===row.id)){hide();return}
     field.value=selected?selected.name+' '+row.name:row.name+' ';
     const EventType=doc.defaultView?.Event;
     if(EventType){field.dispatchEvent(new EventType('input',{bubbles:true}));field.dispatchEvent(new EventType('change',{bubbles:true}));}
     field.focus();render();
     if(selected){hide();status.textContent='';}
    });
    panel.appendChild(button);
   }
   panel.hidden=false;panel.style.display='flex';
  }
  field.addEventListener('input',render);field.addEventListener('focus',render);
  field.addEventListener('keydown',e=>{
   if(e.key==='Escape')hide();
   if(e.key==='ArrowDown'&&!panel.hidden){const button=panel.querySelector('button');if(button){e.preventDefault();button.focus()}}
  });
  const container=field.parentElement;
  container.addEventListener('focusout',e=>{if(!container.contains(e.relatedTarget))hide()});
  const mounted=Object.freeze({panel,status});combined.set(field,mounted);return mounted;
 }
 root.zukaitVehicleAutocomplete=Object.freeze({configure,attach,attachCombined});
})(typeof window!=='undefined'?window:globalThis);
