(function(){
  const KEY='zukait_spare_parts_v1';
  const stages=['LISTED','ENQUIRY','ORDERED','RECEIVED','CONFIRMED','FITTED','UNAVAILABLE','RETURNED'];
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function load(){try{return JSON.parse(localStorage.getItem(KEY)||'{"lists":[]}')}catch(e){return {lists:[]}}}
  function save(db){localStorage.setItem(KEY,JSON.stringify(db))}
  function who(){return window.me?.id||'UNKNOWN'}
  function role(){return window.me?.role||''}
  function canPrice(){return role()==='Manager'||role()==='Purchaser'}
  function jc(no){return (window.state?.jobs||[]).find(j=>String(j.no)===String(no))}
  function ensure(no){
    const db=load(); let list=db.lists.find(x=>x.job===no);
    if(!list){list={id:'PL-'+Date.now(),job:no,createdAt:Date.now(),createdBy:who(),status:'OPEN',items:[],audit:[]};db.lists.push(list);save(db)}
    return {db,list};
  }
  function audit(list,action,detail){list.audit.push({at:Date.now(),by:who(),action,detail:detail||''})}
  function itemRow(x,i){
    return '<tr><td>'+(i+1)+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.qty)+'</td><td>'+esc(x.note||'')+'</td><td><b>'+esc(x.stage||'LISTED')+'</b></td><td>'+((canPrice()&&x.price!=null)?Number(x.price).toFixed(3)+' OMR':'—')+'</td></tr>';
  }
  function render(no){
    const {list}=ensure(no),j=jc(no)||{};
    const total=list.items.reduce((s,x)=>s+(Number(x.price)||0)*(Number(x.qty)||0),0);
    return '<div class="parts-head"><h3>Spare Parts · '+esc(no)+'</h3><span>'+esc((j.vehicle||'')+(j.reg?' · '+j.reg:''))+'</span></div>'+
      '<div class="parts-actions">'+
      (role()==='Supervisor'?'<button onclick="partsAddItem(\''+esc(no)+'\')">+ Add Part</button><button onclick="partsWhatsApp(\''+esc(no)+'\')">WhatsApp List</button>':'')+
      '<button onclick="partsRefresh(\''+esc(no)+'\')">Refresh</button></div>'+
      '<div class="parts-table"><table><tr><th>#</th><th>Part</th><th>Qty</th><th>Note</th><th>Status</th><th>Price</th></tr>'+
      (list.items.length?list.items.map(itemRow).join(''):'<tr><td colspan="6">No parts listed yet.</td></tr>')+'</table></div>'+
      (canPrice()?'<p><b>Total purchase:</b> '+total.toFixed(3)+' OMR</p>':'')+
      '<div class="parts-cards">'+list.items.map(x=>'<button onclick="partsOpenItem(\''+esc(no)+'\',\''+esc(x.id)+'\')"><b>'+esc(x.name)+'</b><small>'+esc(x.stage||'LISTED')+'</small></button>').join('')+'</div>';
  }
  window.openSpareParts=function(no){
    no=String(no||prompt('Job Card Number')||'').trim().toUpperCase(); if(!no)return;
    if(!jc(no))return alert('Job Card not found.');
    const html='<div id="partsRoot">'+render(no)+'</div>';
    if(typeof window.showManagerModal==='function')return showManagerModal('Spare Parts',html);
    if(typeof window.showSupervisorModal==='function')return showSupervisorModal('Spare Parts',html);
  };
  window.partsRefresh=function(no){const el=document.getElementById('partsRoot');if(el)el.innerHTML=render(no)};
  window.partsAddItem=function(no){
    if(role()!=='Supervisor')return alert('Supervisor entry only.');
    const name=String(prompt('Part name')||'').trim();if(!name)return;
    const qty=Number(prompt('Quantity','1'));if(!Number.isFinite(qty)||qty<=0)return alert('Enter valid quantity.');
    const note=String(prompt('Note / suspected detail (optional)','')||'').trim();
    const {db,list}=ensure(no);const x={id:'PI-'+Date.now(),name,qty,note,stage:'LISTED',createdAt:Date.now(),createdBy:who()};
    list.items.push(x);audit(list,'PART_ADDED',name+' x '+qty);save(db);partsRefresh(no);
  };
  window.partsOpenItem=function(no,id){
    const {db,list}=ensure(no),x=list.items.find(a=>a.id===id);if(!x)return;
    let allowed=stages;
    if(role()==='Denter'||role()==='Employee')allowed=['CONFIRMED'];
    const next=String(prompt('Status: '+allowed.join(', '),x.stage)||'').trim().toUpperCase();
    if(!allowed.includes(next))return;
    if((next==='ORDERED'||next==='RECEIVED')&&!canPrice()&&role()!=='Supervisor')return alert('Purchaser/Supervisor action required.');
    if(canPrice()&&(next==='ORDERED'||next==='RECEIVED')){
      const p=prompt('Purchase price OMR',x.price==null?'':x.price);if(p!==null&&p!==''){const n=Number(p);if(!Number.isFinite(n)||n<0)return alert('Invalid price.');x.price=n}
    }
    if(next==='RETURNED'){x.returnReason=String(prompt('Return reason / wrong part detail','')||'').trim()}
    if(next==='UNAVAILABLE'){x.settlement='CASH_SETTLEMENT_REQUIRED'}
    x.stage=next;x.updatedAt=Date.now();x.updatedBy=who();audit(list,'STATUS',x.name+' → '+next);save(db);partsRefresh(no);
  };
  window.partsWhatsApp=function(no){
    const {list}=ensure(no);
    const text=['SPARE PARTS LIST','Job Card: '+no,''].concat(list.items.map((x,i)=>(i+1)+'. '+x.name+' x '+x.qty+(x.note?' - '+x.note:''))).join('\n');
    if(navigator.share){navigator.share({text}).catch(()=>{})}else{navigator.clipboard?.writeText(text);alert('Parts list copied.')}
  };
  window.zukaitSpareParts={load,render,stages};
  const css=document.createElement('style');css.textContent='.parts-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.parts-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.parts-table{overflow:auto}.parts-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.parts-cards button{background:#f8fafc;color:#172033;border:1px solid #dbe3ee;text-align:left}.parts-cards small{display:block;color:#64748b;margin-top:4px}';document.head.appendChild(css);
})();