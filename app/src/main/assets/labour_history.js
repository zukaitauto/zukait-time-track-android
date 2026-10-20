(function(){'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=v=>String(v??'').trim().toUpperCase();
const canRead=()=>['Manager','Supervisor'].includes(typeof me==='undefined'?window.me?.role:me?.role);
const snapshot=()=>window.zukaitCloud?.confirmedState||(typeof state==='undefined'?window.state:state)||{};
const staff=()=>typeof users==='undefined'?window.users||[]:users;
const date=t=>new Date(t).toLocaleDateString('en-GB',{timeZone:'Asia/Muscat'}).replaceAll('/','-');
const time=t=>new Date(t).toLocaleTimeString('en-US',{timeZone:'Asia/Muscat',hour:'2-digit',minute:'2-digit',hour12:true});
const duration=ms=>{const m=Math.round(Math.max(0,ms)/60000);return Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m'};
let active=null,image=null,busy=false;
function periods(st,no,emp,now=Date.now()){
 const rows=[],seen=new Set();let invalid=0;
 for(const s of st.sessions||[]){
  if(!s||String(s.emp)!==String(emp)||s.cancelled||s.voided||s.deleted)continue;
  if(s.preliminaryLinkedJob?key(s.preliminaryLinkedJob)!==key(no):key(s.job)!==key(no))continue;
  if(s.preliminaryLinkedJob&&!s.end)continue;
  const assignment=(st.assign||[]).find(a=>s.assignmentId&&String(a.id)===String(s.assignmentId));
  if(assignment?.cancelled)continue;
  if(s.id){if(seen.has(String(s.id)))continue;seen.add(String(s.id));}
  const start=Number(s.start),ended=s.end!==null&&s.end!==undefined&&s.end!=='',end=ended?Number(s.end):now;
  if(!Number.isFinite(start)||start<=0||!Number.isFinite(end)||end<start||end>now||start>now){invalid++;continue;}
  let cursor=start;
  const pauses=(Array.isArray(s.pauses)?s.pauses:[]).map(p=>({start:Number(p.start||p.pause),end:Number(p.end||p.resume)})).sort((a,b)=>a.start-b.start);
  const push=(a,b,status)=>{if(b>a)rows.push({start:a,end:b,status,reason:String(s.pauseReason||''),preliminary:!!s.preliminaryLinkedJob,rework:!!s.rework});};
  for(const p of pauses){
   if(!Number.isFinite(p.start)||p.start<start||p.start>end){invalid++;continue;}
   if(cursor!==null&&p.start>=cursor)push(cursor,p.start,'Paused');
   if(p.end>p.start&&p.end<=end)cursor=Math.max(cursor??start,p.end);else if(!p.end)cursor=null;else{invalid++;cursor=null;}
  }
  if(cursor!==null)push(cursor,end,ended?(s.paused?'Paused':s.finished?'Finished':'Ended'):'Running');
 }
 rows.sort((a,b)=>a.start-b.start);
 return {rows,totalMs:rows.reduce((n,r)=>n+r.end-r.start,0),invalid};
}
function getReport(no,emp){
 if(!canRead()||key(no)==='ID001')return null;
 const st=snapshot(),job=(st.jobs||[]).find(j=>j&&!j.deleted&&key(j.no)===key(no));if(!job)return null;
 const who=staff().find(u=>String(u.id)===String(emp)),now=Date.now(),p=periods(st,job.no,emp,now);
 return {job:{no:String(job.no),vehicle:String(job.vehicle||[job.make,job.model].filter(Boolean).join(' ')),reg:String(job.reg||'')},emp:String(emp),name:String(who?.name||who?.display_name||emp),department:String(who?.department||''),now,...p};
}
function table(r){return '<div class="lh-scroll" tabindex="0" role="region" aria-label="Staff work session list"><table class="lh-table"><thead><tr><th>Date</th><th>Start</th><th>Pause / End</th><th>Status</th><th>Hours</th></tr></thead><tbody>'+r.rows.map(p=>'<tr><td>'+esc(date(p.start))+'</td><td>'+esc(time(p.start))+'</td><td>'+esc(p.status==='Running'?'Running':(date(p.start)!==date(p.end)?date(p.end)+' ':'')+time(p.end))+'</td><td>'+esc(p.status)+(p.preliminary?' · Preliminary':'')+(p.rework?' · Repeat':'')+'</td><td>'+esc(duration(p.end-p.start))+'</td></tr>').join('')+'</tbody></table></div>'+(r.rows.length?'':'<p>No recorded work sessions for this staff member on this Job Card.</p>')+'<div class="lh-total"><span>Total hours</span><strong>'+esc(duration(r.totalMs))+' · '+(r.totalMs/3600000).toFixed(2)+' hours</strong></div>'+(r.invalid?'<p class="lh-warning">'+r.invalid+' invalid time record(s) require review and are excluded.</p>':'');}
const css=`.lh-view{color:#172c46;min-width:0}.lh-header{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;background:#172c46;color:#fff;border-radius:14px;padding:16px}.lh-header h3{margin:0;font-size:20px}.lh-actions{display:flex;gap:7px;flex-wrap:wrap}.lh-actions button,.lh-view>button{padding:11px 13px;border:1px solid #cdd9e8;border-radius:9px;color:#173753;background:#f3f7fc;font-weight:750;min-height:44px}.lh-person{margin:14px 0;padding:15px;border:1px solid #d7e4ee;border-left:4px solid #14818b;border-radius:12px;background:#f6fafc}.lh-person h4{font-size:20px;margin:0 0 7px}.lh-person p{margin:5px 0;overflow-wrap:anywhere}.lh-scroll{overflow-x:auto;max-width:100%;border:1px solid #d9e3ee;border-radius:10px}.lh-table{border-collapse:collapse;width:100%;min-width:490px;font-size:14px}.lh-table th,.lh-table td{padding:12px 10px;text-align:left;border-bottom:1px solid #e1e9f2;white-space:nowrap}.lh-table th{background:#eaf2f8;color:#224962}.lh-table tbody tr:nth-child(even){background:#f7faff}.lh-total{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:16px;margin-top:12px;border-radius:12px;background:#e6f5ed;color:#146344;font-size:17px}.lh-note{font-size:12px;color:#52677e;line-height:1.5}.lh-warning{color:#8a5100;background:#fff4dc;padding:12px;border-radius:9px}.lh-preview{display:block;max-width:100%;max-height:65vh;object-fit:contain;margin:12px auto}.wo-labour-staff{background:#edf5ff!important;color:#185788!important;border:1px solid #bad1e8!important;border-radius:9px;padding:9px 12px!important;min-height:44px;cursor:pointer;text-align:left;font-size:14px;font-weight:800}@media(max-width:600px){.lh-header{padding:13px}.lh-header h3{font-size:17px}.lh-actions{width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.lh-actions button{padding:10px;font-size:12px}.lh-total{font-size:15px}.lh-table{font-size:13px}}@media print{@page{size:A4;margin:0}body{padding:12mm!important}.lh-actions{display:none!important}.lh-scroll{overflow:visible;border:0}.lh-table{min-width:0;font-size:11px}.lh-table th,.lh-table td{padding:8px 6px}.lh-table tr{break-inside:avoid}.lh-header{background:#fff;color:#000;border-bottom:2px solid #172c46;border-radius:0}.lh-person,.lh-total{break-inside:avoid}}`;
function identity(r){return '<div class="lh-person"><h4>'+esc(r.name)+'</h4><p>'+esc(r.department)+'</p><p>JC '+esc(r.job.no)+' · '+esc(r.job.vehicle)+' · '+esc(r.job.reg)+'</p></div>';}
function html(r){return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>JC '+esc(r.job.no)+' · '+esc(r.name)+' · Labour</title><style>body{font-family:Arial,sans-serif;margin:20px}'+css+'</style></head><body><section class="lh-view"><h2>ZUKAIT · Staff Labour Report</h2>'+identity(r)+table(r)+'<p class="lh-note">Oman time · Pauses excluded · As of '+esc(date(r.now)+' '+time(r.now))+'</p></section></body></html>';}
function dispose(){if(image?.url)URL.revokeObjectURL(image.url);image=null;}
function render(){if(!active||!canRead())return;const r=active;window.openModal('<section class="lh-view"><header class="lh-header"><h3>Staff Labour · '+esc(r.job.no)+'</h3><nav class="lh-actions"><button data-labour-action="back">← Labour list</button><button data-labour-action="print">Print</button><button data-labour-action="pdf">PDF / Share</button><button data-labour-action="card">Send as card</button><button data-labour-action="close">Close ×</button></nav></header>'+identity(r)+table(r)+'<p class="lh-note">Oman time · Pauses excluded · As of '+esc(date(r.now)+' '+time(r.now))+'</p></section>');}
function openStaff(no,emp){if(!canRead())return;const r=getReport(no,emp);if(!r)return;dispose();active=r;render();}
function printReport(){if(!active||!canRead())return;const r=active,name='JC_'+r.job.no+'_'+r.name+'_Labour',content=html(r);if(window.AndroidBridge?.printHtmlNamed)return window.AndroidBridge.printHtmlNamed(content,name);const w=window.zukaitOpenPrintPreview?.(name)||window.open('','_blank');if(!w)return window.alert?.('Print preview could not open.');w.document.write(content);w.document.close();w.focus();w.print();}
function filename(r,ext){return ('JC_'+r.job.no+'_'+r.name+'_Labour').replace(/[^a-zA-Z0-9_-]/g,'_')+'.'+ext;}
async function prepareCard(){
 if(!active||!canRead()||busy)return;busy=true;const r=active;
 try{
  // Paginate long histories into bounded cards rather than clipping a giant canvas.
  const chunks=[];for(let i=0;i<r.rows.length;i+=24)chunks.push(r.rows.slice(i,i+24));if(!chunks.length)chunks.push([]);
  const files=[];
  for(let n=0;n<chunks.length;n++){
   const lines=chunks[n],c=document.createElement('canvas');c.width=1080;c.height=430+lines.length*64;const x=c.getContext('2d');
   x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.fillStyle='#172c46';x.fillRect(0,0,c.width,135);x.fillStyle='#fff';x.font='bold 32px Arial';x.fillText('ZUKAIT · STAFF LABOUR',36,52);x.font='24px Arial';x.fillText(r.name+' · JC '+r.job.no,36,100,1008);
   x.fillStyle='#314b65';x.font='22px Arial';x.fillText(r.job.vehicle+' · '+r.job.reg,36,175,1008);x.font='19px Arial';x.fillText('Oman time · '+date(r.now)+' '+time(r.now)+' · Page '+(n+1)+'/'+chunks.length,36,211);
   const cols=[36,240,425,680,890];x.fillStyle='#eaf2f8';x.fillRect(24,238,1032,46);x.fillStyle='#173753';x.font='bold 19px Arial';['DATE','START','PAUSE / END','STATUS','HOURS'].forEach((v,i)=>x.fillText(v,cols[i],268));
   lines.forEach((p,i)=>{const y=314+i*64;if(i%2===0){x.fillStyle='#f5f8fc';x.fillRect(24,y-22,1032,60);}x.fillStyle='#172c46';x.font='19px Arial';[date(p.start),time(p.start),p.status==='Running'?'Running':time(p.end),p.status,duration(p.end-p.start)].forEach((v,j)=>x.fillText(v,cols[j],y, j===2?235:j===4?160:190));if(date(p.start)!==date(p.end)&&p.status!=='Running'){x.font='14px Arial';x.fillText(date(p.end),cols[2],y+19);}});
   const y=c.height-103;x.fillStyle='#e6f5ed';x.fillRect(24,y,1032,70);x.fillStyle='#146344';x.font='bold 25px Arial';x.fillText('TOTAL HOURS · '+duration(r.totalMs)+' ('+(r.totalMs/3600000).toFixed(2)+' h)',36,y+43);x.fillStyle='#52677e';x.font='15px Arial';x.fillText('Pauses excluded'+(r.invalid?' · '+r.invalid+' invalid record(s) excluded':''),36,c.height-12);
   const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw Error('Card generation failed');files.push(new File([blob],filename(r,'png').replace('.png',chunks.length>1?'_'+(n+1)+'.png':'.png'),{type:'image/png'}));c.width=c.height=0;
  }
  if(active!==r||!canRead())return;dispose();image={files,index:0,url:URL.createObjectURL(files[0])};showCard();
 }catch(e){window.alert?.(e.message||'Could not prepare the staff card.');}finally{busy=false;}
}
function showCard(){const r=active,files=image.files;window.openModal('<section class="lh-view"><h3>Staff Labour · Card preview</h3><p>'+esc(r.name)+' · JC '+esc(r.job.no)+(files.length>1?' · Card '+(image.index+1)+' of '+files.length:'')+'</p><img class="lh-preview" src="'+image.url+'" alt="Staff labour card preview"><nav class="lh-actions">'+(files.length>1?'<button data-labour-action="card-page" data-page="'+((image.index+files.length-1)%files.length)+'">← Previous card</button><button data-labour-action="card-page" data-page="'+((image.index+1)%files.length)+'">Next card →</button>':'')+'<button data-labour-action="share-card">Share '+(window.AndroidBridge?'this card':'card'+(files.length>1?'s':''))+'</button><button data-labour-action="detail">← Work sessions</button><button data-labour-action="close">Close ×</button></nav></section>');
}
async function shareCard(){if(!canRead()||!image)return;const files=image.files;if(window.AndroidBridge?.shareImageBase64){for(const file of [files[image.index]]){const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});if(!canRead())return;window.AndroidBridge.shareImageBase64(file.name,data);}return;}
 if(navigator.share&&(!navigator.canShare||navigator.canShare({files})))return navigator.share({files});
 for(const file of files){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}}
document.addEventListener('click',async e=>{const b=e.target.closest?.('[data-labour-action]');if(!b||!canRead())return;e.preventDefault();try{const action=b.dataset.labourAction;if(action==='staff')return openStaff(b.dataset.job,b.dataset.emp);if(!active)return;if(action==='back'){dispose();return window.zukaitWorkshopOverview?.labour?.(active.job.no);}if(action==='detail'){dispose();return render();}if(action==='close'){dispose();active=null;return window.closeModal?.();}if(action==='print')return printReport();if(action==='pdf'){if(!window.zukaitReportPdf?.share)return window.alert?.('PDF tools are unavailable. Reload the app.');return window.zukaitReportPdf.share(html(active),filename(active,'pdf'));}if(action==='card-page'&&image){const i=Number(b.dataset.page);if(!Number.isInteger(i)||i<0||i>=image.files.length)return;URL.revokeObjectURL(image.url);image.index=i;image.url=URL.createObjectURL(image.files[i]);return showCard();}if(action==='card')return prepareCard();if(action==='share-card')await shareCard();}catch(e){if(e?.name!=='AbortError')window.alert?.(e.message||'Could not share the report.');}});
const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
window.zukaitLabourHistory={periods,getReport,openStaff,html,duration};
})();
