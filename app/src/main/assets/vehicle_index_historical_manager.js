/* Staged historical review screen. No direct edits, no bulk-save, no persistent state. */
(function(root){
 'use strict';
 function mount(container,{actor,readPreview,openEditor,isCurrent=()=>false}={}){
  if(!container)return null;
  const doc=container.ownerDocument;
  const node=(tag,text)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;return e};
  container.replaceChildren();
  if(actor?.role!=='Manager'||typeof readPreview!=='function'||typeof openEditor!=='function'){container.append(node('p','Manager historical review is unavailable.'));return null;}
  const title=node('h2','Historical vehicle name review'),note=node('p','Preview approved spelling corrections only. Open the original editor to verify and save a correction. Issued or closed records require individual review.');
  const load=node('button','Find affected records');load.type='button';
  const result=node('p');result.setAttribute('role','status');const rows=node('div');
  let generation=0,busy=false;
  const active=()=>container.isConnected&&isCurrent();
  function clear(message){rows.replaceChildren();result.textContent=message;}
  function validEnvelope(response){
   return response?.ok===true&&response.complete===true&&response.authoritative===true&&response.snapshot&&Array.isArray(response.records)&&response.records.every(r=>typeof r.issuedDocument==='boolean'&&typeof r.closed==='boolean');
  }
  load.addEventListener('click',async()=>{
   if(busy||!active())return;
   const seq=++generation;busy=true;load.disabled=true;clear('Checking authorized records…');
   try{
    const response=await readPreview();
    if(seq!==generation||!active()){clear('Manager session changed. Reopen this screen.');return;}
    if(!validEnvelope(response)){clear('A complete authoritative record and document-status preview is unavailable. No corrections can be offered.');return;}
    const plan=root.zukaitVehicleHistoricalReview.plan(response.snapshot,response.records,actor);
    if(!plan.ok){clear('Review unavailable: '+plan.code.replace(/_/g,' '));return;}
    result.textContent=plan.ready+' correction group(s) ready for editor review · '+plan.manual+' manual review · '+plan.scanned+' records checked. No changes saved.';
    for(const item of plan.items){
     const card=node('section');card.style.cssText='border:1px solid #cbd5e1;padding:12px;margin:10px 0;border-radius:8px';
     card.append(node('strong',item.department+' · '+(item.status==='MANUAL_REVIEW'?'Manual review':'Review in original editor')));
     for(const record of item.records)card.append(node('p',record.kind.replace('_',' ')+' '+record.id+': '+record.before.make+' '+record.before.model+' → '+record.after.make+' '+record.after.model));
     if(item.status==='MANUAL_REVIEW'){card.append(node('small',String(item.reason||'Manual verification needed').replace(/_/g,' ')));}
     else{
      const button=node('button','Open original editor');button.type='button';
      button.addEventListener('click',async()=>{
       if(!active()||generation!==seq)return;
       button.disabled=true;try{
        // The caller must re-read current record/revision and use the existing authorized editor.
        // This command is navigation only; it deliberately contains no mutation payload.
        await openEditor({route:item.route,id:item.routeId,expectedRecords:item.records.map(r=>({kind:r.kind,id:r.id,revision:r.revision})),catalogueVersion:plan.catalogueVersion});
       }catch(_){if(active()){result.textContent='Unable to open the original editor. Refresh the preview.';button.disabled=false;}}
      });card.append(button);
     }
     rows.append(card);
    }
   }catch(_){if(active())clear('Unable to retrieve the correction preview. No changes saved.');}
   finally{if(seq===generation){busy=false;load.disabled=!active();}}
  });
  container.append(title,note,load,result,rows);
  return Object.freeze({load,result,rows,dispose(){generation++;busy=false;load.disabled=true;rows.replaceChildren();}});
 }
 root.zukaitVehicleHistoricalManager=Object.freeze({mount});
})(typeof window!=='undefined'?window:globalThis);
