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
 function attach(form,index=provider){
  if(!form||!index||mounted.has(form))return mounted.get(form)||null;
  const make=form.elements?.namedItem('make'),model=form.elements?.namedItem('model');
  if(!make||!model||!make.parentElement||!model.parentElement)return null;
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
  function hide(p){p.panel.replaceChildren();p.panel.hidden=true;p.panel.style.display='none'}
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
   if(p.field.disabled||p.field.readOnly||!p.field.value.trim())return;
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
 root.zukaitVehicleAutocomplete=Object.freeze({configure,attach});
})(typeof window!=='undefined'?window:globalThis);
