// Dedicated read-only Mechanical Job Card Consumables totals.
// One JC, small indexed read; no Painting data or full-state sync.
export async function mountMechanicalConsumablesTotals(root,options={}){
 const doc=root.ownerDocument,initial=options.getSession?.();
 let closed=false,busy=false,page=0,hasMore=false;
 const same=()=>!closed&&options.isEnabled?.()!==false&&
   options.getSession?.()?.id===initial?.id&&
   options.getSession?.()?.role==='Mechanical Supervisor'&&
   options.getSession?.()?.key===initial?.key;
 const ready=()=>same()&&options.stockEnabled?.()===true&&
   typeof options.stockRequest==='function';
 const el=(tag,text='')=>{const n=doc.createElement(tag);n.textContent=text;return n};
 const button=(text,fn)=>{const n=el('button',text);n.type='button';n.addEventListener('click',fn);return n};
 const label=(text,control)=>{
   const n=el('label',text);n.style.display='block';n.style.margin='12px 0 4px';
   n.append(control);return n;
 };
 const money=n=>Number(n||0).toFixed(3);
 const msg=el('p');msg.setAttribute('role','status');
 const wrap=el('section');wrap.style.maxWidth='760px';wrap.style.margin='auto';
 wrap.append(button('← Mechanical Consumables',()=>{if(!busy)options.onBack?.()}));
 wrap.append(el('h2','Total Consumables'));
 wrap.append(el('p','Final Mechanical Job Card material cost = Issued materials − Returned unused materials.'));
 if(initial?.role!=='Mechanical Supervisor'||!initial?.id||!initial?.key){
   root.replaceChildren(el('p','Mechanical Supervisor access required.'));
   return {destroy(){closed=true;root.replaceChildren()}};
 }
 if(!ready()){
   wrap.append(el('p','Mechanical stock costing is not activated. No live Job Card cost is available.'));
   root.replaceChildren(wrap);
   return {destroy(){closed=true;root.replaceChildren()}};
 }
 const jc=el('input');jc.id='mc-total-jc';jc.placeholder='Mechanical JC number';jc.autocomplete='off';
 const totals=el('div'),detail=el('div');
 const find=button('Show Total',()=>load(0));
 const more=button('Next 20',()=>load(page+1));more.hidden=true;
 const prev=button('Previous',()=>load(page-1));prev.hidden=true;
 wrap.append(label('Mechanical Job Card',jc),find,totals,detail,prev,more,msg);
 root.replaceChildren(wrap);
 function update(){
   jc.disabled=busy;find.disabled=busy;more.disabled=busy;prev.disabled=busy;
 }
 async function load(nextPage=0){
   if(!ready()||busy||!Number.isInteger(nextPage)||nextPage<0||nextPage>49)return;
   const jobCard=String(jc.value||'').trim().toUpperCase();
   if(!/^[A-Z0-9_. -]{1,36}$/.test(jobCard)){msg.textContent='Enter a valid Mechanical Job Card number.';return}
   busy=true;update();msg.textContent='Checking Job Card consumables…';
   try{
     const r=await options.stockRequest({operation:'MECHANICAL_TOTALS',jobCard,page:nextPage});
     if(!same())return;
     if(r?.ok!==true||r.totals?.readOnly!==true||
        String(r.totals.jobCard)!==jobCard||!Array.isArray(r.totals.items)){
       throw Error(r?.code||'Job Card totals not confirmed');
     }
     const t=r.totals;
     page=nextPage;hasMore=t.hasMore===true;
     totals.replaceChildren();
     const header=el('h3','JC '+jobCard);totals.append(header);
     for(const [name,value] of [
       ['Total issued','OMR '+money(t.grossCost)],
       ['Returned unused','− OMR '+money(t.returnCredit)],
       ['Net consumables cost','OMR '+money(t.netCost)]
     ]){
       const item=el('p',name+': '+value);
       if(name==='Net consumables cost')item.style.fontWeight='700';
       totals.append(item);
     }
     detail.replaceChildren();
     if(t.items.length===0)detail.append(el('p','No material issues recorded for this Job Card.'));
     for(const row of t.items){
       detail.append(el('p',String(row.name||'Material')+' · '+String(row.brand||'')+
         ' · '+Number(row.issuedQty||0)+' '+String(row.unit||'')+
         ' issued, '+Number(row.returnedQty||0)+' returned'+
         ' · Net OMR '+money(row.netCost)));
     }
     more.hidden=!hasMore;prev.hidden=page===0;
     msg.textContent='Verified read-only total · '+Number(t.lineCount||0)+' issued lines, '+Number(t.returnCount||0)+' returns.';
   }catch(e){if(same())msg.textContent='Unable to show Job Card totals: '+String(e?.message||e)}
   finally{busy=false;if(same())update()}
 }
 return {destroy(){closed=true;root.replaceChildren()}};
}
