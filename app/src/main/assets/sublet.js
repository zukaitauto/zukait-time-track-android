const subletTotal=(rows,no)=>(rows||[]).filter(x=>String(x.jobCard).trim().toUpperCase()===String(no).trim().toUpperCase()).reduce((n,x)=>n+(Number.isSafeInteger(x.amountMills)&&x.amountMills>0?x.amountMills:0),0)/1000;
(function(){'use strict';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').trim().toUpperCase();
const permitted=()=>['Manager','Purchaser','Supervisor'].includes((typeof me==='undefined'?window.me:me)?.role);
const actor=()=>typeof me==='undefined'?window.me:me;
const canAdd=()=>['Manager','Purchaser'].includes(actor()?.role),canEdit=()=>['Manager','Supervisor'].includes(actor()?.role);
const snap=()=>window.zukaitCloud?.confirmedState||(typeof state==='undefined'?{}:state);
let latest=null,selected='',mode='search',busy=false,requestId='',draft=null,editing=null;
const today=()=>new Date(Date.now()+4*3600000).toISOString().slice(0,10);
const model=j=>[j.make,j.model].filter(Boolean).join(' ')||j.vehicle||'';
function jobs(){return ((latest||snap()).jobs||[]).filter(j=>j&&!j.deleted&&!j.cancelled&&!j.archived&&norm(j.no)!=='ID001');}
function entries(no){return ((latest||snap()).sublets||[]).filter(x=>x&&(!no||norm(x.jobCard)===norm(no))).slice().sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);}
function history(no){const rows=((latest||snap()).subletAudit||[]).filter(x=>norm(x.jobCard)===norm(no));return rows.length?'<details><summary>Correction History</summary>'+rows.slice().reverse().map(x=>'<p>'+E(x.before.date)+' · '+E(x.before.description)+' · OMR '+(x.before.amountMills/1000).toFixed(3)+' → '+E(x.after.date)+' · '+E(x.after.description)+' · OMR '+(x.after.amountMills/1000).toFixed(3)+'<br><small>'+E(x.by)+' · '+E(new Date(x.at).toLocaleString('en-GB',{timeZone:'Asia/Muscat'}))+'</small></p>').join('')+'</details>':'';}
function groups(){const map=new Map();for(const x of entries()){if(!map.has(norm(x.jobCard))){const j=((latest||snap()).jobs||[]).find(j=>norm(j.no)===norm(x.jobCard));map.set(norm(x.jobCard),{no:x.jobCard,vehicle:model(j||{}),total:0});}map.get(norm(x.jobCard)).total+=x.amountMills;}return [...map.values()].map(x=>({...x,total:x.total/1000})).sort((a,b)=>String(a.no).localeCompare(String(b.no),undefined,{numeric:true}));}
function chrome(body){window.openModal('<section class="sublet-page"><header><h2>Sublet</h2><button type="button" data-sublet="close">Close ×</button></header><div class="sublet-search"><label>Job Card Search<input id="subletSearch" type="search" placeholder="JC number / make / model / registration" autocomplete="off"></label><button type="button" data-sublet="list">List</button></div><div id="subletMatches"></div>'+body+'</section>');}
function render(){
 if(!permitted())return;
 if(mode==='list'){const rows=groups();chrome('<h3>Sublet List</h3><div class="sublet-table"><table><thead><tr><th>JC Number</th><th>Make / Model</th><th>Sublet Total · OMR</th><th></th></tr></thead><tbody>'+rows.map(x=>'<tr><td><b>'+E(x.no)+'</b></td><td>'+E(x.vehicle)+'</td><td>'+x.total.toFixed(3)+'</td><td><button type="button" data-sublet="job" data-job="'+E(x.no)+'">Open</button></td></tr>').join('')+'</tbody></table></div>'+(rows.length?'':'<p>No sublet entries yet.</p>'));return;}
 const j=jobs().find(j=>norm(j.no)===norm(selected));
 if(!j){chrome('<p>Search and open a job card to enter sublet expenses.</p>');return;}
 const rows=entries(j.no),d=draft||{date:today(),description:'',amount:''};
 chrome('<h3>JC '+E(j.no)+' · '+E(model(j))+'</h3>'+((canAdd()||editing)?'<form id="subletForm"><div class="sublet-entry"><label>Date<input name="date" type="date" max="'+today()+'" value="'+E(d.date)+'" required></label><label>Description<input name="description" maxlength="500" value="'+E(d.description)+'" required></label><label>Amount · OMR<input name="amount" type="number" inputmode="decimal" min="0.001" max="1000000" step="0.001" value="'+E(d.amount)+'" required></label><button type="submit"'+(busy?' disabled':'')+'>'+(busy?'Saving…':editing?'Save Changes':'Add')+'</button></div><p id="subletError" role="status"></p></form>':'<p>Select Edit on an entry to correct its Date, Description or Amount.</p>')+'<div class="sublet-table"><table><thead><tr><th>Date</th><th>Description</th><th>Amount · OMR</th>'+(canEdit()?'<th></th>':'')+'</tr></thead><tbody>'+rows.map(x=>'<tr><td>'+E(x.date)+'</td><td>'+E(x.description)+'</td><td>'+(x.amountMills/1000).toFixed(3)+'</td>'+(canEdit()?'<td><button type="button" data-sublet="edit" data-id="'+E(x.id)+'">Edit</button></td>':'')+'</tr>').join('')+'</tbody></table></div>'+(rows.length?'':'<p>No sublets for this job card yet.</p>') +history(j.no)+'<p class="sublet-total">Sublet Total <b>OMR '+subletTotal(rows,j.no).toFixed(3)+'</b></p>');
}
function search(q){if(!permitted())return;const host=document.getElementById('subletMatches');if(!host)return;const n=norm(q);host.innerHTML=n?jobs().filter(j=>norm([j.no,model(j),j.reg].join(' ')).includes(n)).slice(0,15).map(j=>'<button type="button" data-sublet="job" data-job="'+E(j.no)+'"><b>JC '+E(j.no)+'</b> · '+E(model(j))+' · '+E(j.reg||'')+'</button>').join('')||'<p>No matching job card.</p>':'';}
async function open(no){if(!permitted())return;try{const r=await window.zukaitCloud.readLatest();if(!permitted())return;latest=r.data;selected=no||'';mode=selected?'job':'search';draft=null;editing=null;requestId='';render();}catch(e){window.alert('Sublet could not load. Check the connection and try again.');}}
function openJob(no){if(!permitted()||busy)return;selected=no;mode='job';draft=null;requestId='';render();}
async function submit(form){
 if(!permitted()||busy||(!editing&&!canAdd())||(editing&&!canEdit()))return;
 const f=new FormData(form),next={date:String(f.get('date')||''),description:String(f.get('description')||'').trim(),amount:String(f.get('amount')||'')};
 if(JSON.stringify(next)!==JSON.stringify(draft)){requestId='';draft=next;}
 if(!requestId)requestId=crypto.randomUUID();
 busy=true;const key=requestId,jobCard=selected;render();
 try{
  if(editing)await window.zukaitCloud.editSublet({id:key,entryId:editing.id,expectedRevision:Number(editing.revision||1),...draft});
  else await window.zukaitCloud.addSublet({id:key,jobCard,...draft});
  const r=await window.zukaitCloud.readLatest();latest=r.data;
  if(!permitted())return;draft=null;editing=null;requestId='';busy=false;render();
 }catch(e){busy=false;if(!permitted())return;render();const el=document.getElementById('subletError');if(el)el.textContent='Could not confirm save. Your entry is kept. Retry to check or save it once.';}
}
document.addEventListener('input',e=>{if(e.target.id==='subletSearch')search(e.target.value);});
document.addEventListener('submit',e=>{if(e.target.id==='subletForm'){e.preventDefault();submit(e.target);}});
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-sublet]');if(!b||!permitted()||busy)return;const action=b.dataset.sublet;if(action==='edit'&&canEdit()){const x=entries(selected).find(x=>x.id===b.dataset.id);if(!x)return;editing=x;draft={date:x.date,description:x.description,amount:(x.amountMills/1000).toFixed(3)};requestId='';render();return;}if(action==='job')openJob(b.dataset.job);if(action==='list'){mode='list';selected='';draft=null;editing=null;requestId='';render();}if(action==='close')window.closeModal?.();});
const style=document.createElement('style');style.textContent='.sublet-page{color:#102b46;background:#f1f8fc;padding:14px;border-radius:18px}.sublet-page header,.sublet-search{display:flex;gap:10px;align-items:center;justify-content:space-between}.sublet-search>label{flex:1}.sublet-page label{display:block;font-weight:750;font-size:13px}.sublet-page input{display:block;width:100%;box-sizing:border-box;margin-top:5px;min-height:44px;background:#fff;color:#102b46;border:1px solid #bacddd;border-radius:9px;padding:9px}.sublet-page button{min-height:44px;padding:10px 14px;background:#e2edfb;color:#173e75;border:1px solid #b2cbea;border-radius:10px;font-weight:800}.sublet-entry{display:grid;grid-template-columns:150px 1fr 140px auto;gap:10px;align-items:end;margin:16px 0}.sublet-table{overflow:auto;margin-top:16px}.sublet-table table{width:100%;border-collapse:collapse;background:#fff}.sublet-table th,.sublet-table td{text-align:left;padding:12px;border-bottom:1px solid #d5e2ec}.sublet-table td:last-child{text-align:right}.sublet-total{display:flex;justify-content:space-between;background:#e6f5ee;padding:16px;border-radius:12px}.sublet-total b{font-size:20px}#subletMatches button{display:block;width:100%;text-align:left;margin-top:6px}#subletError{color:#a12626}@media(max-width:650px){.sublet-entry{grid-template-columns:1fr 1fr}.sublet-entry label:nth-child(2){grid-column:1/-1;grid-row:2}.sublet-table th,.sublet-table td{padding:9px;font-size:13px}}';document.head.appendChild(style);
window.zukaitSublet={open,openJob,groups,entries,count:()=>new Set((snap().sublets||[]).map(x=>x.jobCard)).size};
})();
