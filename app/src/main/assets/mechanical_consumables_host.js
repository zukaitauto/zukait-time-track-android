// Dedicated Mechanical Supervisor stock screen. No workshop_state, Painting
// scripts or legacy cloud sync. All writes go through the scoped Workshop API.
export async function mountMechanicalConsumablesHost(root,options={}){
 const doc=root.ownerDocument;
 const original=options.getSession?.();
 const identity=u=>JSON.stringify([u?.id,u?.role,u?.key]);
 const owner=identity(original),active=()=>!closed&&owner===identity(options.getSession?.())&&options.isEnabled?.()!==false;
 const ready=()=>active()&&options.stockEnabled?.()===true&&typeof options.stockRequest==='function';
 const store=options.storage;
 const storageKey='zukait_mechanical_issue_pending_v1:'+String(original?.id||'');
 let closed=false,busy=false,mode='issued',catalog=[],page=0,hasMore=false,lines=[],pending=null;
 let controls={},notice='';
 const h=(tag,content='',attrs={})=>{
   const n=doc.createElement(tag);
   n.textContent=content==null?'':String(content);
   for(const [key,value] of Object.entries(attrs)){
     if(key==='class')n.className=value;
     else if(key==='type'||key==='id'||key==='placeholder'||key==='name')n.setAttribute(key,value);
     else if(key==='disabled')n.disabled=!!value;
   }
   return n;
 };
 const button=(name,click,disabled=false)=>{
   const b=h('button',name,{type:'button',disabled});
   b.addEventListener('click',click);
   return b;
 };
 const label=(name,input)=>{
   const l=h('label',name);
   l.style.display='block';l.style.margin='10px 0 4px';l.style.fontWeight='600';
   l.append(input);return l;
 };
 function putMessage(text){notice=text;if(controls.message)controls.message.textContent=text}
 function readPending(){
   try{const x=JSON.parse(store?.getItem(storageKey)||'null');
     if(x?.owner===original?.id&&x.requestId&&x.data?.jobCard&&Array.isArray(x.data?.lines))return x;
   }catch{}
   return null;
 }
 function savePending(data){
   if(!store||typeof store.setItem!=='function')throw Error('Safe retry storage is unavailable.');
   const requestId=(options.uuid?.()||globalThis.crypto?.randomUUID?.()||
     ('mechanical-'+Date.now()+'-'+Math.random().toString(36).slice(2))).replace(/[^a-zA-Z0-9_.:-]/g,'');
   const next={owner:original.id,requestId,data};
   store.setItem(storageKey,JSON.stringify(next));return next;
 }
 function wipePending(){store?.removeItem(storageKey);pending=null}
 const normalized=(row)=>({
   materialId:String(row.materialId||''),brandId:String(row.brandId||''),
   name:String(row.name||''),brand:String(row.brand||''),unit:String(row.unit||''),
   physical:Number(row.physical||0),reserved:Number(row.reserved||0)
 });
 function currentItem(){
   return catalog.find(x=>x.materialId===controls.material?.value&&x.brandId===controls.brand?.value);
 }
 function refreshAvailability(){
   const x=currentItem();
   controls.available.textContent=x?'Available: '+Math.max(0,x.physical-x.reserved).toFixed(2)+' '+x.unit:
     'Select a stocked material and brand.';
   controls.quantity.step=x?.unit==='Piece'?'1':'0.0001';
   controls.quantity.placeholder=x?.unit==='Piece'?'Pieces':'Quantity';
 }
 function refreshBrands(){
   const id=controls.material.value;
   const found=catalog.filter(x=>x.materialId===id);
   controls.brand.replaceChildren(...found.map(x=>h('option',x.brand,{value:x.brandId})));
   // Set exact value because option construction here does not support extra attributes.
   [...controls.brand.options].forEach((o,i)=>o.value=found[i].brandId);
   refreshAvailability();
 }
 function refreshMaterials(){
   const uniq=[...new Map(catalog.map(x=>[x.materialId,x])).values()];
   const old=controls.material.value;
   controls.material.replaceChildren(...uniq.map(x=>h('option',x.name)));
   [...controls.material.options].forEach((o,i)=>o.value=uniq[i].materialId);
   if(uniq.some(x=>x.materialId===old))controls.material.value=old;
   refreshBrands();
 }
 function readLine(){
   const item=currentItem(),raw=String(controls.quantity.value||'').trim(),qty=Number(raw);
   if(!item){putMessage('Select a material and its brand.');return null}
   if(!raw||!Number.isFinite(qty)||qty<=0||!Number.isInteger(qty*10000)){
     putMessage('Enter a valid quantity (up to four decimal places).');return null;
   }
   if(item.unit==='Piece'&&!Number.isInteger(qty)){
     putMessage('Pieces must be whole numbers.');return null;
   }
   if(qty>item.physical-item.reserved){
     putMessage('Insufficient available stock for '+item.brand+'.');return null;
   }
   return {materialId:item.materialId,brandId:item.brandId,quantity:qty,name:item.name,brand:item.brand,unit:item.unit};
 }
 function updateDraft(){
   const out=controls.draft;out.replaceChildren();
   for(const [i,line] of lines.entries()){
     const lineBox=h('div',line.name+' · '+line.brand+' · '+line.quantity+' '+line.unit);
     lineBox.style.padding='6px 0';
     lineBox.append(button('Remove',()=>{if(busy||pending)return;lines.splice(i,1);updateDraft()}));
     out.append(lineBox);
   }
   const locked=busy||!!pending;
   controls.add.disabled=!ready()||locked||lines.length>=20;
   controls.issue.disabled=!ready()||locked||!catalog.length;
   controls.retry.hidden=!pending;
   controls.retry.disabled=!ready()||busy;
   controls.jc.disabled=locked;
   controls.material.disabled=locked;
   controls.brand.disabled=locked;
   controls.quantity.disabled=locked;
   controls.issue.textContent=busy?'Saving…':'ISSUE MATERIALS';
 }
 function appendCurrentIfAny(){
   const raw=String(controls.quantity.value||'').trim();
   if(!raw)return true;
   const item=readLine();if(!item)return false;
   if(lines.some(x=>x.materialId===item.materialId&&x.brandId===item.brandId)){
     putMessage('This material and brand is already in the list. Remove it before adding it again.');
     return false;
   }
   if(lines.length>=20){putMessage('Maximum 20 materials per issue.');return false}
   lines.push(item);controls.quantity.value='';updateDraft();
   return true;
 }
 async function sendPending(){
   if(!ready()||busy||!pending)return;
   busy=true;updateDraft();putMessage('Checking issue receipt…');
   try{
     const p=pending;
     const result=await options.stockRequest({
       operation:'WRITE',command:'MECHANICAL_ISSUE',requestId:p.requestId,data:p.data
     });
     if(!active())return;
     if(result?.ok!==true||result.receipt?.final!==true||
        result.receipt.jobCard!==p.data.jobCard||
        Number(result.receipt.lineCount)!==p.data.lines.length){
       throw Error(String(result?.code||'Issue receipt not confirmed'));
     }
     wipePending();lines=[];controls.quantity.value='';
     putMessage('ISSUED · '+p.data.jobCard+' · '+Number(result.receipt.totalCost||0).toFixed(3)+' OMR · Final');
     // No second database write, nor automatic full history refresh.
   }catch(e){
     if(active())putMessage('Issue not confirmed. Retry the SAME issue; no new issue has been started. '+String(e?.message||e));
   }finally{
     busy=false;if(active())updateDraft();
   }
 }
 async function submit(){
   if(!ready()||busy)return;
   if(pending){putMessage('Unconfirmed issue exists. Retry it before creating another.');return}
   const jc=String(controls.jc.value||'').trim().toUpperCase();
   if(!/^[A-Z0-9_. -]{1,36}$/.test(jc)){
     putMessage('Enter a valid Mechanical Job Card number.');return;
   }
   if(!appendCurrentIfAny())return;
   if(!lines.length){putMessage('Select a material, brand and quantity.');return}
   if(options.online?.()===false){putMessage('Offline. Nothing has been issued.');return}
   const data={jobCard:jc,kind:mode,lines:lines.map(x=>({
     materialId:x.materialId,brandId:x.brandId,quantity:x.quantity
   }))};
   try{pending=savePending(data)}
   catch(e){putMessage(e.message);return}
   await sendPending();
 }
 async function loadCatalog(nextPage=0){
   if(!ready()||busy)return;
   busy=true;updateDraft();putMessage('Loading material list…');
   try{
     const r=await options.stockRequest({operation:'CATALOG',page:nextPage});
     if(!active())return;
     if(r?.ok!==true)throw Error(r?.code||'Materials not available');
     const rows=Array.isArray(r.items)?r.items:[];
     catalog=nextPage===0?rows.map(normalized):
       [...catalog,...rows.map(normalized)];
     page=nextPage;hasMore=r.hasMore===true;
     refreshMaterials();
     controls.more.hidden=!hasMore;
     if(pending)putMessage('An earlier issue is awaiting confirmation. Retry the same request before issuing again.');
     else putMessage(catalog.length?'Select the Job Card, material, brand and quantity.':
       'No stocked Mechanical materials yet. The Manager must link the existing Material Master to stock.');
   }catch(e){
     if(active())putMessage('Stock catalog unavailable: '+String(e?.message||e));
   }finally{busy=false;if(active())updateDraft()}
 }
 function paint(){
   root.replaceChildren();
   const shell=h('section',null,{class:'mc-consumables-host'});
   shell.style.maxWidth='760px';shell.style.margin='auto';
   shell.append(button('← Mechanical dashboard',()=>{
     if(busy)return;options.onBack?.();
   }));
   shell.append(h('h2','Mechanical Consumables'));
   shell.append(h('p','Issue materials directly to a Mechanical Job Card. Issuing is final. No separate Actual Materials step.'));
   if(!ready()){
     const info=h('p','Mechanical stock issuing is not yet activated. Your current Job Cards and stock are unchanged.');
     info.setAttribute('role','status');shell.append(info);
     root.append(shell);return;
   }
   pending=readPending();
   const modeRow=h('div');
   modeRow.append(button('Issued Materials',()=>{if(busy||pending)return;mode='issued';putMessage('Issued Materials selected.');}),
       button('Additional Materials',()=>{if(busy||pending)return;mode='additional';putMessage('Additional Materials selected.');}),
       button('Return Materials',()=>{if(busy||pending)return;options.onReturn?.()}),
       button('Total Consumables',()=>{if(busy||pending)return;options.onTotals?.()}));
   shell.append(modeRow);
   const jc=h('input',null,{id:'mc-stock-jc',placeholder:'Mechanical JC number'});
   const material=h('select',null,{id:'mc-stock-material'}),brand=h('select',null,{id:'mc-stock-brand'});
   const qty=h('input',null,{id:'mc-stock-quantity',type:'number',placeholder:'Quantity'});
   qty.min='0.0001';qty.step='0.0001';
   const available=h('p','Select a stocked material and brand.');
   const add=button('+ Add another material',()=>{
     if(!ready()||busy||pending)return;
     if(!appendCurrentIfAny())return;
     putMessage('Material added to this issue.');
   });
   const draft=h('div');
   const issue=button('ISSUE MATERIALS',submit,true);
   const retry=button('Retry unconfirmed issue',sendPending);retry.hidden=true;
   const more=button('Load more materials',()=>loadCatalog(page+1));more.hidden=true;
   const msg=h('p','',{id:'mc-stock-status'});msg.setAttribute('role','status');
   controls={jc,material,brand,quantity:qty,available,add,draft,issue,retry,more,message:msg};
   material.addEventListener('change',refreshBrands);
   brand.addEventListener('change',refreshAvailability);
   for(const [title,input] of [['Mechanical Job Card',jc],['Material',material],['Brand',brand],['Quantity',qty]]){
     shell.append(label(title,input));
   }
   shell.append(available,add,draft,issue,retry,more,msg);
   shell.append(h('small','Return Materials and Manager material creation are separate actions; no additional approval is required.'));
   root.append(shell);
   updateDraft();
   if(pending)putMessage('An earlier issue is awaiting confirmation. Retry the same request before issuing again.');
 }
 if(original?.role!=='Mechanical Supervisor'||!original?.id||!original?.key){
   root.replaceChildren(h('p','Mechanical Supervisor access required.'));
   return {destroy(){root.replaceChildren()}};
 }
 paint();
 if(ready())await loadCatalog(0);
 return {destroy(){closed=true;root.replaceChildren()}};
}
