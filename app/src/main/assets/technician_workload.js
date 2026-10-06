(function(){
  'use strict';
  // Match the dashboard and secure login's lexical session authority.
  const canView=()=>typeof me!=='undefined'&&['Supervisor','Manager'].includes(me?.role);
  const departments={Denter:'Denting',Painter:'Painting',Mechanic:'Mechanical'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const same=(a,b)=>String(a)===String(b);
  const person=id=>(users||[]).find(u=>u&&same(u.id,id));
  const vehicle=j=>[j.vehicle||[j.make||j.brand,j.model].filter(Boolean).join(' '),j.year&&!String(j.vehicle||'').includes(String(j.year))?j.year:''].filter(Boolean).join(' ')||'—';
  const minutes=n=>fmt(Math.max(0,Number(n)||0));
  let timer=null;

  // Read the existing synced projection; never create a second assignment store.
  function present(emp){
    const jobs=new Map((state.jobs||[]).filter(Boolean).map(j=>[String(j.no),j]));
    const grouped=new Map();
    for(const a of state.assign||[]){
      if(!a||!same(a.emp,emp)||a.completed||a.cancelled||a.job==='ID001')continue;
      const j=jobs.get(String(a.job));
      if(!j||j.delivered||j.archived)continue;
      if(!grouped.has(String(a.job)))grouped.set(String(a.job),{job:j,assignments:[]});
      grouped.get(String(a.job)).assignments.push(a);
    }
    return [...grouped.values()];
  }
  function matches(a,s){return !!s&&(s.assignmentId?same(a.id,s.assignmentId):same(a.emp,s.emp)&&same(a.job,s.job));}
  function status(row,live){
    if(row.assignments.some(a=>matches(a,live.session))){
      if(['Working','Overtime'].includes(live.status))return 'Working';
      if(live.status==='Paused')return 'Paused';
    }
    // Keep stale local running sessions from masquerading as live work.
    if(live.status==='Syncing'||live.status==='Unavailable')return 'Syncing';
    return row.assignments.some(a=>empStatus(a)==='Paused'||empStatus(a)==='Started')?'Paused':'Not Started';
  }
  function snapshot(emp){
    const u=person(emp),live=window.v84TechState(u)||{status:'Syncing',session:null};
    const rows=present(emp).map(row=>({...row,status:status(row,live)}));
    return {u,live,rows};
  }
  const statusClass=s=>'tw-status-'+String(s||'').toLowerCase().replace(/[^a-z]+/g,'-');
  const deptClass=d=>'tw-dept-'+String(d||'').toLowerCase().replace(/[^a-z]+/g,'-');
  function departmentBody(dept){
    const team=(users||[]).filter(u=>u&&u.role==='Employee'&&u.department===dept);
    return team.length?team.map((u,i)=>{
      const {live,rows}=snapshot(u.id),working=rows.find(r=>r.status==='Working');
      const liveLabel=live.status||'Available';
      return '<button type="button" class="tw-employee '+statusClass(liveLabel)+'" data-tw-emp="'+esc(u.id)+'"><span class="tw-index">'+esc(i+1)+'</span><span class="tw-summary"><b>'+esc(u.name)+'</b><span class="tw-current">'+esc(working?working.job.no+' · '+vehicle(working.job):'No active running JC')+'</span><small>Total '+rows.length+' JC</small></span><span class="tw-status '+statusClass(liveLabel)+'">● '+esc(liveLabel)+'</span></button>';
    }).join(''):'<p class="notice">No technicians in this department.</p>';
  }
  function workloadBody(emp){
    const {rows}=snapshot(emp);
    return '<div class="tw-workload-actions"><button type="button" class="tw-time-details-button" data-tw-time-details="1">◷ Time Details</button></div><div class="tw-workload-summary" data-summary="Present Jobs: '+rows.length+'"><span>Present Jobs</span><b>'+rows.length+'</b></div>'+(rows.length?rows.map((r,i)=>{
      const master=window.zukaitJobCardMaster?.production?.(r.job.no);
      const ids=new Set(r.assignments.map(a=>String(a.id||'')));
      const suggested=master?master.normal.filter(a=>ids.has(String(a.id||''))).reduce((n,a)=>n+(Number(a.suggested)||0),0):r.assignments.reduce((n,a)=>n+(Number(a.suggested)||0),0);
      const worked=master?master.normal.filter(a=>ids.has(String(a.id||''))).reduce((n,a)=>n+(Number(window.zukaitJobCardMaster.actualMinutes(a))||0),0):r.assignments.reduce((n,a)=>n+(Number(totalForAssignment(a))||0),0);
      const remaining=Math.max(0,suggested-worked);
      return '<article class="tw-job '+statusClass(r.status)+'"><div class="tw-job-head"><h3>'+esc((i+1)+' · '+r.job.no)+'</h3><span class="tw-status '+statusClass(r.status)+'">● '+esc(r.status)+'</span></div><p class="tw-vehicle">'+esc(vehicle(r.job))+'</p><p class="tw-reg">Registration: <b>'+esc(r.job.reg||'—')+'</b></p><dl><div class="tw-metric tw-suggested"><dt>Suggested</dt><dd>'+esc(minutes(suggested))+'</dd></div><div class="tw-metric tw-worked"><dt>Worked</dt><dd>'+esc(minutes(worked))+'</dd></div><div class="tw-metric tw-remaining"><dt>Remaining</dt><dd>'+esc(minutes(remaining))+'</dd></div></dl><button type="button" class="tw-history-button" data-tw-history="'+esc(r.job.no)+'">◷ Work History</button></article>';
    }).join(''):'<p class="notice">No unfinished job cards assigned.</p>');
  }
  const OMAN=4*3600000,DAY=86400000;
  const dayStart=t=>Math.floor((t+OMAN)/DAY)*DAY-OMAN;
  const dayKey=t=>new Date(t+OMAN).toISOString().slice(0,10);
  const timeText=t=>new Date(t).toLocaleTimeString('en-GB',{timeZone:'Asia/Muscat',hour12:true,hour:'2-digit',minute:'2-digit',second:'2-digit'}).replace(/\b(am|pm)\b/gi,v=>v.toUpperCase());
  function normalInterval(start,end){
    const holidays=new Set((state.workshopHolidays||[]).filter(Boolean).map(x=>String(typeof x==='object'?(x.date||x.dateKey||x.day||''):x).slice(0,10)));
    let total=0,cur=start;
    while(cur<end){const ds=dayStart(cur),next=Math.min(end,ds+DAY);
      if(new Date(cur+OMAN).getUTCDay()!==5&&!holidays.has(dayKey(cur)))for(const [a,b] of [[8,13],[15,19]])total+=Math.max(0,Math.min(next,ds+b*3600000)-Math.max(cur,ds+a*3600000))/60000;
      cur=next;
    }
    return total;
  }
  function historySessions(emp,ids){
    const assignments=(state.assign||[]).filter(a=>a&&same(a.emp,emp)&&ids.has(String(a.id))),picked=new Map();
    for(const a of assignments){
      let rows;
      if(typeof window.v79AssignmentSessions==='function')rows=window.v79AssignmentSessions(a);
      else rows=(state.sessions||[]).filter(s=>{
        if(!s||!same(s.emp,emp))return false;
        if(s.assignmentId)return same(s.assignmentId,a.id);
        const candidates=(state.assign||[]).filter(x=>x&&!x.cancelled&&same(x.emp,emp)&&same(x.job,s.job)).slice().sort((x,y)=>(Number(x.assignedAt)||0)-(Number(y.assignedAt)||0));
        let owner=candidates[0];for(const x of candidates){if((Number(x.assignedAt)||0)<=(Number(s.start)||0))owner=x;else break}
        return owner&&same(owner.id,a.id);
      });
      for(const session of rows||[])if(session?.id&&same(session.emp,emp))picked.set(String(session.id),session);
    }
    return [...picked.values()].sort((a,b)=>Number(a.start)-Number(b.start)||String(a.id).localeCompare(String(b.id)));
  }
  function historyBody(emp,no,ids){
    const sessions=historySessions(emp,ids),days=new Map(),at=Date.now(),live=window.v84TechState(person(emp))||{};
    for(const session of sessions){
      const start=Number(session.start),end=Math.min(Number(session.end)||at,at);if(!Number.isFinite(start)||start<=0||!Number.isFinite(end)||end<start)continue;
      let cur=start;
      do{const ds=dayStart(cur),segEnd=Math.min(end,ds+DAY),key=dayKey(cur);if(!days.has(key))days.set(key,[]);
        days.get(key).push({session,start:cur,end:segEnd,continued:cur>start,continues:segEnd<end,normal:normalInterval(cur,segEnd)});cur=segEnd;
      }while(cur<end);
    }
    const totalNormal=[...days.values()].flat().reduce((n,r)=>n+r.normal,0);
    const j=(state.jobs||[]).find(j=>same(j.no,no));
    return '<p class="tw-history-vehicle">'+esc(vehicle(j||{}))+' · Registration: <b>'+esc(j?.reg||'—')+'</b></p><p class="tw-history-explanation">Oman time · 12-hour AM/PM</p><details class="tw-history-help"><summary>How time is calculated</summary><p>Duration is elapsed session time. Normal worked time excludes breaks, holidays and overtime.</p></details><div class="tw-history-total">Normal worked total <b>'+esc(minutes(totalNormal))+'</b></div>'+(days.size?[...days.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([day,rows])=>{
      const total=rows.reduce((n,r)=>n+r.normal,0),label=new Date(day+'T12:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
      return '<section class="tw-history-day"><h3>'+esc(label)+'<small>Normal worked: '+esc(minutes(total))+'</small></h3><div class="tw-history-table-scroll"><table class="tw-history-table"><thead><tr><th>No.</th><th>Start</th><th>End</th><th>Duration</th><th>Status</th></tr></thead><tbody>'+rows.map((r,i)=>{
        const s=r.session,open=!s.end,running=open&&['Working','Overtime'].includes(live.status)&&same(live.session?.id,s.id),status=r.continues?'Continues next day':open?(running?'Running':'End not recorded'):s.finished?'Finished':s.paused?'Paused':s.autoOvertime||s.autoStopped?'Auto stopped':'Stopped';
        const ending=(r.continues||(!open&&r.end===dayStart(r.start)+DAY))?timeText(r.end)+' · next day':open?(running?'Running':'Not recorded'):timeText(r.end);
        const reason=String(s.pauseReason||s.reason||s.stopReason||'');
        return '<tr class="tw-history-row"><td>'+esc(i+1)+'</td><td class="tw-history-clock">'+esc(timeText(r.start))+(r.continued?'<small>Continued</small>':'')+'</td><td class="tw-history-clock">'+esc(ending)+'</td><td>'+esc(minutes((r.end-r.start)/60000))+'</td><td>'+esc(status)+'</td></tr>'+((reason||r.continued||r.continues)?'<tr class="tw-history-note"><td colspan="5"><details><summary>Session details</summary>'+(reason?'<p>Reason: '+esc(reason)+'</p>':'')+(r.continued||r.continues?'<p>'+(r.continued?'Continued from previous day. ':'')+(r.continues?'Continues next day. ':'')+'Recorded session: '+esc(new Date(Number(s.start)).toLocaleDateString('en-GB',{timeZone:'Asia/Muscat'}))+' '+esc(timeText(Number(s.start)))+' → '+esc(s.end?new Date(Number(s.end)).toLocaleDateString('en-GB',{timeZone:'Asia/Muscat'})+' '+timeText(Number(s.end)):'End not recorded')+'</p>':'')+'<p>Normal worked: '+esc(minutes(r.normal))+'</p></details></td></tr>':'');
      }).join('')+'</tbody></table></div></section>';
    }).join(''):'<p class="notice">No work sessions recorded for this assignment yet.</p>');
  }
  function allEmployeeSessions(emp){
    return (state.sessions||[]).filter(s=>s&&same(s.emp,emp)&&Number(s.start)>0).slice().sort((a,b)=>Number(b.start)-Number(a.start)||String(b.id||'').localeCompare(String(a.id||'')));
  }
  function sessionJob(s){
    if(s.job)return String(s.job);
    const a=(state.assign||[]).find(a=>a&&s.assignmentId&&same(a.id,s.assignmentId));
    return a?.job?String(a.job):'—';
  }
  function endAction(s){
    if(!s.end)return 'RUNNING';
    if(s.finished)return 'FINISH';
    if(s.paused)return 'PAUSE';
    if(s.autoOvertime||s.autoStopped)return 'STOP';
    return 'STOP';
  }
  function timeDetailRows(emp,dateFilter,jobFilter){
    const rows=[],sessions=allEmployeeSessions(emp).slice().sort((a,b)=>Number(a.start)-Number(b.start)||String(a.id||'').localeCompare(String(b.id||'')));
    const priorByJob=new Map();
    for(const s of sessions){
      const job=sessionJob(s),start=Number(s.start),end=Number(s.end),prior=priorByJob.get(job);
      const resumed=!!(prior&&prior.paused&&Number(prior.end)>0&&Number(prior.end)<=start);
      rows.push({at:start,job,action:resumed?'RESUME':'START'});
      if(Number.isFinite(end)&&end>0)rows.push({at:end,job,action:endAction(s)});
      priorByJob.set(job,s);
    }
    return rows.filter(r=>(!dateFilter||dayKey(r.at)===dateFilter)&&(!jobFilter||jobFilter==='ALL'||same(r.job,jobFilter))).sort((a,b)=>b.at-a.at);
  }
  function timeDetailsCardData(emp,dateFilter,jobFilter){
    const u=person(emp),rows=timeReportRows(emp,dateFilter,jobFilter);
    const dateLabel=dateFilter?new Date(dateFilter+'T12:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'All Dates';
    return {name:u?.name||String(emp),dateLabel,jobLabel:jobFilter&&jobFilter!=='ALL'?'JC '+jobFilter:'All Job Cards',rows};
  }
  const idleText=ms=>{const sec=Math.floor(ms/1000);return Math.floor(sec/60)+' min'+(sec%60?' '+sec%60+' sec':'');};
  function timeReportRows(emp,dateFilter,jobFilter){
    const jobs=new Map((state.jobs||[]).filter(Boolean).map(j=>[String(j.no),j]));
    const rows=timeDetailRows(emp,dateFilter,jobFilter).map(r=>{
      const j=jobs.get(r.job)||{},identity=window.zukaitJobCardMaster?.identity?.(r.job);
      const make=identity?.make||j.make||j.vehicleMake||j.brand||window.zukaitNormalizeVehicle?.('','',j.vehicle||'')?.make||'—';
      return {...r,make};
    });
    // Merge all employee work intervals before applying the job filter. Overlapping
    // work and missing end records must never be reported as idle time.
    let coveredEnd=null,previousJob=null;
    const sessions=allEmployeeSessions(emp).slice().sort((a,b)=>Number(a.start)-Number(b.start));
    for(const s of sessions){
      const start=Number(s.start),end=s.end?Number(s.end):Infinity,job=sessionJob(s);
      if(!Number.isFinite(start)||Number.isNaN(end)||end<start)continue;
      if(coveredEnd!==null&&start>coveredEnd&&dayKey(start)===dayKey(coveredEnd)){
        const duration=Math.round(normalInterval(coveredEnd,start)*60000);
        if(duration>600000&&(!dateFilter||dayKey(start)===dateFilter)&&(!jobFilter||jobFilter==='ALL'||same(job,jobFilter)||same(previousJob,jobFilter)))
          rows.push({at:start,from:coveredEnd,action:'IDLE',duration});
      }
      if(coveredEnd===null||end>coveredEnd){coveredEnd=end;previousJob=job;}
    }
    return rows.sort((a,b)=>a.at-b.at||(a.action==='IDLE'?-1:b.action==='IDLE'?1:0));
  }
  function drawTimeDetailsCard(emp,dateFilter,jobFilter){
    const data=timeDetailsCardData(emp,dateFilter,jobFilter),W=1080,pad=64,rowH=76,headH=86,metaH=188;
    const H=Math.max(720,250+metaH+headH+Math.max(1,data.rows.length)*rowH+140),c=document.createElement('canvas');c.width=W;c.height=H;
    const x=c.getContext('2d'),round=(a,b,w,h,r)=>{x.beginPath();x.roundRect(a,b,w,h,r);x.fill();},txt=(t,a,b,size,weight,color,align='left')=>{x.font=weight+' '+size+'px sans-serif';x.fillStyle=color;x.textAlign=align;x.textBaseline='middle';x.fillText(String(t),a,b);};
    x.fillStyle='#eef3f9';x.fillRect(0,0,W,H);x.fillStyle='#ffffff';round(34,34,W-68,H-68,30);
    x.fillStyle='#17314d';round(34,34,W-68,154,30);x.fillRect(34,120,W-68,68);
    txt('ZUKAIT AUTO SERVICES',pad,84,34,'800','#ffffff');txt('EMPLOYEE TIME DETAILS',pad,132,22,'700','#cfe0f1');
    txt(data.name,pad,230,36,'800','#172033');txt(data.dateLabel,pad,284,24,'700','#52657a');
    x.fillStyle='#edf5ff';round(pad,324,W-pad*2,94,18);txt(data.jobLabel,pad+26,354,23,'800','#245681');txt('Oman time · 12-hour AM/PM · Read only',pad+26,392,18,'600','#64788d');
    let y=448;x.fillStyle='#1f3048';round(pad,y,W-pad*2,headH,12);const cols=[pad+24,pad+300,pad+500,pad+790];['Time','Job Card','Car Make','Action'].forEach((v,i)=>txt(v,cols[i],y+headH/2,21,'800','#ffffff'));
    y+=headH;
    if(!data.rows.length){txt('No time events match these filters.',W/2,y+70,24,'700','#6b7c8e','center');}
    data.rows.forEach((r,i)=>{
      if(r.action==='IDLE'){
        x.fillStyle='#fde5e5';round(pad,y,W-pad*2,rowH,10);
        txt('IDLE TIME: '+idleText(r.duration),W/2,y+25,25,'800','#bf2020','center');
        txt(timeText(r.from)+' – '+timeText(r.at),W/2,y+55,18,'600','#bf2020','center');
      }else{
        x.fillStyle=i%2?'#f6f8fb':'#ffffff';x.fillRect(pad,y,W-pad*2,rowH);
        txt(timeText(r.at),cols[0],y+rowH/2-(dateFilter?0:10),21,'700','#26384d');
        if(!dateFilter)txt(dayKey(r.at),cols[0],y+58,15,'600','#52657a');
        const fit=(value,col,width)=>{let text=String(value);while(text.length>1&&x.measureText(text).width>width)text=text.slice(0,-2)+'…';txt(text,col,y+rowH/2,21,'700','#26384d');};
        x.font='700 21px sans-serif';fit(r.job,cols[1],180);fit(r.make,cols[2],260);
        const action=String(r.action),bg=action==='PAUSE'?'#fff0d5':action==='FINISH'?'#e5eef9':action==='STOP'?'#f1e8f8':'#e5f5eb',fg=action==='PAUSE'?'#9a6500':action==='FINISH'?'#315f91':action==='STOP'?'#76518c':'#26734b';
        x.fillStyle=bg;round(cols[3]-10,y+19,150,38,19);txt(action,cols[3]+65,y+38,18,'800',fg,'center');
      }
      y+=rowH;
    });
    const count=data.rows.filter(r=>r.action!=='IDLE').length;
    txt('Red: idle time over 10 minutes · scheduled breaks excluded',pad,H-100,18,'700','#bf2020');
    txt(count+' time event'+(count===1?'':'s'),pad,H-68,18,'700','#687b8e');txt('Zukait Auto Services',W-pad,H-68,18,'700','#687b8e','right');
    return c;
  }
  async function shareTimeDetailsCard(emp,dateFilter,jobFilter){
    const c=drawTimeDetailsCard(emp,dateFilter,jobFilter),data=timeDetailsCardData(emp,dateFilter,jobFilter),safe=data.name.replace(/[^A-Za-z0-9_-]+/g,'_'),filename='Zukait_Time_Details_'+safe+'_'+(dateFilter||'All')+'.png';
    const url=c.toDataURL('image/png'),bridge=window.Android;
    if(bridge&&typeof bridge.shareImageBase64==='function'){bridge.shareImageBase64(filename,url);return}
    if(navigator.share&&navigator.canShare){const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(blob){const file=new File([blob],filename,{type:'image/png'});if(navigator.canShare({files:[file]})){await navigator.share({title:'Zukait Time Details',files:[file]});return}}}
    const a=document.createElement('a');a.href=url;a.download=filename;a.click();
  }
  function timeDetailsBody(emp,dateFilter,jobFilter){
    const sessions=allEmployeeSessions(emp),jobs=[...new Set(sessions.map(sessionJob).filter(Boolean))].sort((a,b)=>String(b).localeCompare(String(a),undefined,{numeric:true}));
    const rows=timeReportRows(emp,dateFilter,jobFilter),count=rows.filter(r=>r.action!=='IDLE').length;
    const tableRows=rows.map(r=>r.action==='IDLE'
      ?'<tr class="tw-time-idle"><td colspan="4"><strong>IDLE TIME: '+esc(idleText(r.duration))+'</strong><small>'+esc(timeText(r.from)+' – '+timeText(r.at))+'</small></td></tr>'
      :'<tr><td class="tw-history-clock">'+esc(timeText(r.at))+(!dateFilter?'<small>'+esc(dayKey(r.at))+'</small>':'')+'</td><td>'+esc(r.job)+'</td><td>'+esc(r.make)+'</td><td><b class="tw-time-action tw-time-'+esc(r.action.toLowerCase())+'">'+esc(r.action)+'</b></td></tr>').join('');
    return '<div class="tw-time-filters"><label>Date<input id="twTimeDate" type="date" value="'+esc(dateFilter||'')+'"></label><label>Job Card<select id="twTimeJob"><option value="ALL">All Job Cards</option>'+jobs.map(j=>'<option value="'+esc(j)+'"'+(same(j,jobFilter)?' selected':'')+'>'+esc(j)+'</option>').join('')+'</select></label></div><p class="tw-history-explanation">Oman time · 12-hour AM/PM · Read only</p><div class="tw-time-count">'+count+' time event'+(count===1?'':'s')+'</div>'+(rows.length?'<div class="tw-history-table-scroll"><table class="tw-history-table tw-time-table"><thead><tr><th>Time</th><th>Job Card</th><th>Car Make</th><th>Action</th></tr></thead><tbody>'+tableRows+'</tbody></table></div><p class="tw-time-legend">Red: idle time over 10 minutes · scheduled breaks excluded</p>':'<p class="notice">No time events match these filters.</p>');
  }

  window.openTechnicianTimeDetails=function(emp){
    const u=person(emp);
    if(!canView()||!u||u.role!=='Employee'||!departments[u.department])return;
    stop();
    let dateFilter=dayKey(Date.now()),jobFilter='ALL';
    const shell=()=>'<div class="tw-workload-tools tw-time-tools"><button type="button" id="twTimeBack" class="secondary tw-back">← Back</button><button type="button" id="twTimeShare" class="tw-time-share">↗ Share Card</button></div><div id="twTimeDetails" class="'+deptClass(u.department)+'">'+timeDetailsBody(emp,dateFilter,jobFilter)+'</div>';
    showSupervisorModal(esc(u.name)+' · Time Details',shell());
    document.getElementById('modal').classList.add('tw-fullscreen');
    const back=document.getElementById('twTimeBack');back.onclick=()=>window.openTechnicianWorkload(emp);
    const share=document.getElementById('twTimeShare');share.onclick=()=>shareTimeDetailsCard(emp,dateFilter,jobFilter).catch(()=>alert('Unable to share Time Details card.'));
    const body=document.getElementById('twTimeDetails');
    const bind=()=>{
      const d=document.getElementById('twTimeDate'),j=document.getElementById('twTimeJob');
      if(d)d.onchange=()=>{dateFilter=d.value;body.innerHTML=timeDetailsBody(emp,dateFilter,jobFilter);bind();};
      if(j)j.onchange=()=>{jobFilter=j.value;body.innerHTML=timeDetailsBody(emp,dateFilter,jobFilter);bind();};
    };
    bind();
  };
  window.openTechnicianWorkHistory=function(emp,no){
    const u=person(emp),row=present(emp).find(r=>same(r.job.no,no));
    if(!canView()||!u||u.role!=='Employee'||!departments[u.department]||!row)return;
    const ids=new Set(row.assignments.map(a=>String(a.id)));stop();
    showSupervisorModal(esc(u.name)+' · JC '+esc(no)+' · Work History','<div class="tw-workload-tools"><button type="button" id="twHistoryBack" class="secondary tw-back">← Back</button></div><div id="twHistory" class="'+deptClass(u.department)+'">'+historyBody(emp,no,ids)+'</div>');
    document.getElementById('modal').classList.add('tw-fullscreen');
    const back=document.getElementById('twHistoryBack');back.onclick=()=>window.openTechnicianWorkload(emp);back.focus();
    watch(document.getElementById('twHistory'),()=>historyBody(emp,no,ids));
  };
  function stop(){if(timer!==null)clearInterval(timer);timer=null;}
  function watch(body,render){
    stop();
    let previous=body.innerHTML;
    timer=setInterval(()=>{
      if(!body.isConnected||!canView()){stop();return;}
      if(document.hidden)return;
      const next=render();
      if(next!==previous){body.innerHTML=next;previous=next;}
    },1000);
  }
  window.openTechnicianDepartment=function(dept){
    if(!canView()||!departments[dept])return;
    stop();
    showSupervisorModal(esc(departments[dept])+' Technicians','<div id="twDepartment" class="tw-department '+deptClass(dept)+'">'+departmentBody(dept)+'</div>');
    const body=document.getElementById('twDepartment');
    const close=document.querySelector('#modal .v150-supervisor-modal-close');
    if(close)close.classList.add('tw-department-close');
    body.onclick=e=>{const row=e.target.closest('[data-tw-emp]');if(row&&body.contains(row))window.openTechnicianWorkload(row.dataset.twEmp);};
    watch(body,()=>departmentBody(dept));
  };
  window.openTechnicianWorkload=function(emp){
    const u=person(emp);
    if(!canView()||!u||u.role!=='Employee'||!departments[u.department])return;
    stop();
    showSupervisorModal(esc(u.name)+' · '+esc(departments[u.department]),'<div class="tw-workload-tools '+deptClass(u.department)+'"><button type="button" id="twBack" class="secondary tw-back">← Back</button></div><div id="twWorkload" class="'+deptClass(u.department)+'">'+workloadBody(emp)+'</div>');
    document.getElementById('modal').classList.add('tw-fullscreen');
    const back=document.getElementById('twBack');
    back.onclick=()=>window.openTechnicianDepartment(u.department);
    back.focus();
    const body=document.getElementById('twWorkload');
    body.onclick=e=>{const time=e.target.closest('[data-tw-time-details]');if(time&&body.contains(time)){window.openTechnicianTimeDetails(emp);return}const button=e.target.closest('[data-tw-history]');if(button&&body.contains(button))window.openTechnicianWorkHistory(emp,button.dataset.twHistory);};
    watch(body,()=>workloadBody(emp));
  };
  const style=document.createElement('style');
  style.textContent='#modal.tw-fullscreen{padding:0!important}#modal.tw-fullscreen>.modal-box{box-sizing:border-box;width:100%!important;max-width:none!important;height:100%!important;max-height:100%!important;margin:0!important;border-radius:0!important;padding:20px!important;overflow:auto!important;background:#f7f9fc}.tw-department{--tw-accent:#4f7fb3;--tw-soft:#edf5ff;--tw-line:#bfd6ee}.tw-dept-denter{--tw-accent:#3f7fbe;--tw-soft:#edf5ff;--tw-line:#bdd7f0}.tw-dept-painter{--tw-accent:#c97832;--tw-soft:#fff4e9;--tw-line:#f0cfad}.tw-dept-mechanic{--tw-accent:#25877d;--tw-soft:#eaf8f5;--tw-line:#b8e0da}.tw-employee{position:relative;box-sizing:border-box;width:100%;margin:10px 0;padding:16px 16px 16px 14px;display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:12px;text-align:left;background:linear-gradient(145deg,#ffffff,#f4f7fb);color:#172033;border:1px solid #d9e3ee;border-left:4px solid var(--tw-accent,#4f7fb3);border-radius:16px;box-shadow:0 4px 12px rgba(23,48,77,.06);transition:transform .12s ease,box-shadow .12s ease}.tw-employee:active{transform:scale(.995)}.tw-index{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--tw-soft,#edf5ff);color:var(--tw-accent,#31577d);font-size:15px;font-weight:900}.tw-summary{display:grid;gap:6px;min-width:0;overflow-wrap:anywhere}.tw-summary b{font-size:24px;line-height:1.1;font-weight:900;letter-spacing:-.25px}.tw-current{font-size:15px;font-weight:700;color:#25364b}.tw-summary small{font-size:13px;font-weight:800;color:#68788b}.tw-status{display:inline-flex;align-items:center;justify-content:center;min-width:78px;padding:7px 10px;border-radius:999px;font-size:12px;font-weight:900;white-space:nowrap;background:#eef3f8;color:#516579;border:1px solid #d9e3ee}.tw-status-working{background:#eaf7ef!important;color:#187145!important;border-color:#bce1ca!important}.tw-status-paused{background:#fff4df!important;color:#9a5a00!important;border-color:#f1d397!important}.tw-status-available{background:#eaf3ff!important;color:#2d64a3!important;border-color:#bfd5ee!important}.tw-status-not-started{background:#f2f4f7!important;color:#5f6d7b!important;border-color:#d9dee5!important}.tw-status-syncing,.tw-status-unavailable{background:#f4f0ff!important;color:#6f55a3!important;border-color:#d8cbed!important}.tw-workload-tools{margin-bottom:12px}.tw-back{border-radius:12px!important;min-height:44px!important;padding:10px 16px!important}.tw-workload-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0 14px;padding:14px 16px;border:1px solid var(--tw-line,#d5e1ed);border-left:4px solid var(--tw-accent,#4f7fb3);border-radius:14px;background:var(--tw-soft,#edf5ff)}.tw-workload-summary span{font-size:14px;font-weight:800;color:#52657a}.tw-workload-summary b{font-size:24px;color:#172033}.tw-job{border:1px solid #d8e2ec;border-left:5px solid #b8c4cf;border-radius:16px;padding:16px;margin:14px 0;background:#fff;box-shadow:0 4px 14px rgba(23,48,77,.055);overflow-wrap:anywhere}.tw-job.tw-status-working{border-left-color:#42a46d!important}.tw-job.tw-status-paused{border-left-color:#e1a43a!important}.tw-job.tw-status-not-started{border-left-color:#97a4b1!important}.tw-job-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.tw-job h3{margin:0;font-size:21px;line-height:1.2}.tw-vehicle{margin:12px 0 6px!important;font-size:16px;font-weight:800;color:#25364b}.tw-reg{margin:6px 0 12px!important;color:#52657a}.tw-job dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0 0}.tw-metric{min-width:0;padding:11px 10px;border-radius:12px;border:1px solid #e0e7ef;background:#f7f9fc}.tw-suggested{background:#f2f6fb}.tw-worked{background:#eef8f2}.tw-remaining{background:#fff7e9}.tw-job dt{font-size:11px;font-weight:800;color:#6b7c8e}.tw-job dd{font-size:18px;font-weight:900;margin:5px 0 0;color:#172033}@media(max-width:480px){.tw-employee{grid-template-columns:34px minmax(0,1fr);padding:14px 12px}.tw-status{grid-column:2;justify-self:start}.tw-summary b{font-size:22px}.tw-job dl{gap:6px}.tw-metric{padding:9px 7px}.tw-job dd{font-size:16px}}';
  style.textContent += '.tw-time-tools{display:flex;align-items:center;justify-content:space-between;gap:12px}.tw-time-share{min-height:44px;padding:10px 18px;border:1px solid #9fc9bd;border-radius:12px;background:linear-gradient(145deg,#f8fffc,#dff4ed);color:#176b58;font-weight:900;box-shadow:inset 0 2px 0 #fff,0 4px 0 #b7d8cf,0 7px 14px rgba(28,100,82,.12)}.tw-time-share:active{transform:translateY(2px)}.tw-time-share:focus-visible{outline:3px solid #3c8c78;outline-offset:4px}@media(max-width:480px){.tw-time-share{padding:10px 14px}}';
  style.textContent += "\n/* Raised technician workload styling; shared status and timing logic stays authoritative. */\n#modal.tw-fullscreen>.modal-box{background:linear-gradient(145deg,#fafcff,#f0f4fa)!important}\n#modal.tw-fullscreen .tw-back{background:linear-gradient(145deg,#fff,#e7f1ff)!important;color:#245681!important;border:1px solid #bcd4ec!important;box-shadow:inset 0 2px 0 #fff,0 4px 0 #bfd0e1,0 7px 14px rgba(45,83,125,.12)!important}\n#modal.tw-fullscreen .v150-supervisor-modal-close{background:linear-gradient(145deg,#fff8f8,#ffe8eb)!important;color:#a23e4f!important;border:1px solid #ecc3cb!important;box-shadow:inset 0 2px 0 #fff,0 4px 0 #dfb7c0,0 7px 14px rgba(130,55,75,.1)!important}\n#modal.tw-fullscreen .tw-back:active,#modal.tw-fullscreen .v150-supervisor-modal-close:active{transform:translateY(2px)}\n#modal.tw-fullscreen .tw-back:focus-visible,#modal.tw-fullscreen .v150-supervisor-modal-close:focus-visible{outline:3px solid #427aba;outline-offset:5px}\n#twWorkload .tw-workload-summary{background:linear-gradient(145deg,#fff,var(--tw-soft,#edf5ff));border-radius:18px;box-shadow:inset 0 2px 0 #fff,0 4px 0 var(--tw-line,#bfd6ee),0 8px 18px rgba(37,70,110,.09);margin-bottom:22px}\n#twWorkload .tw-workload-summary b{display:grid;place-items:center;min-width:44px;min-height:44px;border-radius:13px;background:linear-gradient(145deg,#fff,var(--tw-soft,#edf5ff));border:1px solid var(--tw-line,#bfd6ee);color:var(--tw-accent,#3f7fbe);box-shadow:inset 0 2px 0 #fff,0 3px 0 var(--tw-line,#bfd6ee)}\n#twWorkload .tw-job{--tw-job-soft:#edf5ff;--tw-job-line:#bfd5ef;--tw-job-accent:#3f7fbe;--tw-job-depth:#cedced;background:linear-gradient(145deg,#fff,var(--tw-job-soft))!important;border:1px solid var(--tw-job-line)!important;border-left:6px solid var(--tw-job-accent)!important;border-radius:20px;padding:18px;margin:20px 0;color:#172033!important;box-shadow:inset 0 2px 0 #fff,0 5px 0 var(--tw-job-depth),0 10px 20px rgba(30,55,85,.09)}\n#twWorkload .tw-job.tw-status-working{--tw-job-soft:#eaf8ef;--tw-job-line:#b7ddc6;--tw-job-accent:#35966b;--tw-job-depth:#c4dfd0}\n#twWorkload .tw-job.tw-status-paused{--tw-job-soft:#fff4dc;--tw-job-line:#ebd19c;--tw-job-accent:#d59c31;--tw-job-depth:#e7d6b2}\n#twWorkload .tw-job.tw-status-syncing,#twWorkload .tw-job.tw-status-unavailable{--tw-job-soft:#f3efff;--tw-job-line:#d8cbee;--tw-job-accent:#8970b7;--tw-job-depth:#ded5ed}\n#twWorkload .tw-job .tw-status{background:linear-gradient(145deg,#fff,var(--tw-job-soft))!important;color:var(--tw-job-accent)!important;border-color:var(--tw-job-line)!important;box-shadow:inset 0 1px 0 #fff,0 3px 0 var(--tw-job-depth)}\n#twWorkload .tw-job h3{color:#172033}\n#twWorkload .tw-job dl{gap:10px;margin-top:16px}\n#twWorkload .tw-metric{padding:12px 10px;border-radius:14px;box-shadow:inset 0 2px 0 #fff,0 3px 0 #dbe3ed,0 5px 10px rgba(40,60,85,.06)}\n#twWorkload .tw-suggested{background:linear-gradient(145deg,#fff,#edf2ff);border-color:#d0dbef}\n#twWorkload .tw-worked{background:linear-gradient(145deg,#fff,#e5f5ec);border-color:#c5e3d2;box-shadow:inset 0 2px 0 #fff,0 3px 0 #cfe3d8,0 5px 10px rgba(40,60,85,.06)}\n#twWorkload .tw-remaining{background:linear-gradient(145deg,#fff,#fff3dc);border-color:#ead9b8;box-shadow:inset 0 2px 0 #fff,0 3px 0 #e8dcc5,0 5px 10px rgba(40,60,85,.06)}\n#twWorkload .tw-job dt{color:#596b80}\n@media(max-width:480px){#twWorkload .tw-job{padding:16px 12px}#twWorkload .tw-job dl{gap:7px}#twWorkload .tw-metric{padding:10px 7px}#twWorkload .tw-job dd{font-size:16px}}\n";
  style.textContent += "\n/* Match the raised workload panels in the department technician list. */\n#twDepartment .tw-employee{--tw-row-soft:#edf5ff;--tw-row-line:#bfd5ef;--tw-row-accent:#3f7fbe;--tw-row-depth:#cedced;background:linear-gradient(145deg,#fff,var(--tw-row-soft))!important;color:#172033!important;border:1px solid var(--tw-row-line)!important;border-left:6px solid var(--tw-row-accent)!important;border-radius:20px;margin:14px 0 20px;padding:18px 16px;box-shadow:inset 0 2px 0 #fff,0 5px 0 var(--tw-row-depth),0 10px 20px rgba(30,55,85,.09)}\n#twDepartment .tw-employee.tw-status-working{--tw-row-soft:#eaf8ef;--tw-row-line:#b7ddc6;--tw-row-accent:#35966b;--tw-row-depth:#c4dfd0}\n#twDepartment .tw-employee.tw-status-paused{--tw-row-soft:#fff4dc;--tw-row-line:#ebd19c;--tw-row-accent:#d59c31;--tw-row-depth:#e7d6b2}\n#twDepartment .tw-employee.tw-status-syncing,#twDepartment .tw-employee.tw-status-unavailable{--tw-row-soft:#f3efff;--tw-row-line:#d8cbee;--tw-row-accent:#8970b7;--tw-row-depth:#ded5ed}\n#twDepartment .tw-index{width:36px;height:36px;border:1px solid var(--tw-line);background:linear-gradient(145deg,#fff,var(--tw-soft));color:var(--tw-accent);box-shadow:inset 0 2px 0 #fff,0 3px 0 var(--tw-line);border-radius:12px}\n#twDepartment .tw-employee>.tw-status{background:linear-gradient(145deg,#fff,var(--tw-row-soft))!important;color:var(--tw-row-accent)!important;border-color:var(--tw-row-line)!important;box-shadow:inset 0 1px 0 #fff,0 3px 0 var(--tw-row-depth)}\n#twDepartment .tw-current{color:#25364b}\n#twDepartment .tw-summary small{color:#596b80}\n#twDepartment .tw-employee:active{transform:translateY(2px)}\n#twDepartment .tw-employee:focus-visible{outline:3px solid var(--tw-accent);outline-offset:4px}\n#modal .tw-department-close{background:linear-gradient(145deg,#fff8f8,#ffe8eb)!important;color:#a23e4f!important;border:1px solid #ecc3cb!important;box-shadow:inset 0 2px 0 #fff,0 4px 0 #dfb7c0,0 7px 14px rgba(130,55,75,.1)!important}\n#modal .tw-department-close:active{transform:translateY(2px)}\n#modal .tw-department-close:focus-visible{outline:3px solid #427aba;outline-offset:5px}\n@media(max-width:480px){#twDepartment .tw-employee{padding:16px 12px}}\n";
  style.textContent += '.tw-history-button{margin:18px 0 2px;padding:12px 18px;font-size:16px;font-weight:800;min-height:46px;border:1px solid #c3c4e9!important;border-radius:12px;background:linear-gradient(145deg,#fff,#e9e8ff)!important;color:#544787!important;box-shadow:inset 0 2px #fff,0 3px #cfcee8}.tw-history-button:focus-visible{outline:3px solid #4d76b7;outline-offset:4px}#twHistory{color:#20374f;font-size:15px}#twHistory .tw-history-vehicle{margin:8px 0;font-size:15px}#twHistory .tw-history-explanation{margin:6px 0;font-size:13px;color:#566b80}#twHistory .tw-history-help{font-size:13px;margin:6px 0 10px}#twHistory summary{cursor:pointer;color:#3b6288}#twHistory .tw-history-total{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:2px solid #bdd9cb;font-size:15px}#twHistory .tw-history-total b{font-size:20px;color:#236349}#twHistory .tw-history-day{margin-top:16px}#twHistory .tw-history-day h3{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:5px;margin:0 0 6px;font-size:16px;color:#264f79}#twHistory .tw-history-day h3 small{font-size:13px;font-weight:700;color:#466582}#twHistory .tw-history-table-scroll{overflow-x:auto}#twHistory .tw-history-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px}#twHistory .tw-history-table th,#twHistory .tw-history-table td{padding:8px 4px;vertical-align:middle;text-align:left;border:0;border-bottom:1px solid #dce5ee;line-height:1.3;white-space:normal;overflow-wrap:anywhere}#twHistory .tw-history-table th{font-size:12px;color:#496581;background:#edf4fb}#twHistory .tw-history-table th:first-child{width:7%}#twHistory .tw-history-table th:nth-child(2),#twHistory .tw-history-table th:nth-child(3){width:25%}#twHistory .tw-history-table th:nth-child(4){width:20%}#twHistory .tw-history-table th:nth-child(5){width:23%}#twHistory .tw-history-row{background:#fff}#twHistory .tw-history-row:nth-child(even){background:#f6f9fd}#twHistory .tw-history-clock{font-weight:700;font-variant-numeric:tabular-nums}#twHistory .tw-history-clock small{display:block;font-size:11px;font-weight:400;color:#64748b}#twHistory .tw-history-note td{padding:3px 4px 6px;font-size:12px;background:#f6f9fd}#twHistory .tw-history-note summary{font-size:12px}#twHistory .tw-history-note p{margin:6px 0;line-height:1.4}@media(max-width:360px){#twHistory .tw-history-table{font-size:13px}#twHistory .tw-history-table th,#twHistory .tw-history-table td{padding:7px 3px}}';
  style.textContent += '.tw-workload-actions{display:flex;justify-content:flex-end;margin:4px 0 14px}.tw-time-details-button{min-height:46px;padding:11px 18px;border-radius:13px!important;border:1px solid var(--tw-line,#bfd6ee)!important;background:linear-gradient(145deg,#fff,var(--tw-soft,#edf5ff))!important;color:var(--tw-accent,#31577d)!important;font-size:15px;font-weight:900;box-shadow:inset 0 2px #fff,0 3px 0 var(--tw-line,#bfd6ee)}.tw-time-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:8px 0 12px}.tw-time-filters label{display:grid;gap:5px;font-size:12px;font-weight:900;color:#52657a}.tw-time-filters input,.tw-time-filters select{box-sizing:border-box;width:100%;min-height:44px;padding:8px 10px;border:1px solid #cbd8e6;border-radius:11px;background:#fff;color:#172033;font-size:14px;font-weight:700}.tw-time-count{margin:8px 0 10px;font-size:13px;font-weight:800;color:#596b80}.tw-time-table th:nth-child(1){width:28%!important}.tw-time-table th:nth-child(2){width:25%!important}.tw-time-table th:nth-child(3){width:22%!important}.tw-time-table th:nth-child(4){width:25%!important}.tw-time-action{display:inline-block;padding:4px 7px;border-radius:999px;font-size:11px}.tw-time-start{background:#e8f6ee;color:#187145}.tw-time-pause{background:#fff1d9;color:#955800}.tw-time-resume{background:#e8f6ee;color:#187145}.tw-time-finish{background:#e9efff;color:#405ba5}.tw-time-stop{background:#eef1f4;color:#52606d}.tw-time-running{background:#e8f6ee;color:#187145}@media(max-width:420px){.tw-time-filters{grid-template-columns:1fr}.tw-time-table{font-size:12px!important}}';
  style.textContent += '#twTimeDetails .tw-history-table-scroll{overflow-x:auto}#twTimeDetails .tw-time-table{width:100%;border-collapse:collapse;table-layout:fixed}#twTimeDetails .tw-time-table th,#twTimeDetails .tw-time-table td{padding:12px 8px;text-align:left;overflow-wrap:anywhere;border-bottom:1px solid #e1e8f0}#twTimeDetails .tw-time-table th{background:#1f3048;color:#fff}#twTimeDetails .tw-time-table tr:nth-child(even){background:#f6f8fb}#twTimeDetails .tw-time-idle td{background:#fde5e5;color:#bf2020;text-align:center;padding:16px 8px}#twTimeDetails .tw-time-idle strong{font-size:18px}#twTimeDetails .tw-time-idle small,#twTimeDetails .tw-history-clock small{display:block;margin-top:5px}.tw-time-legend{color:#bf2020;font-size:12px}';
  document.head.appendChild(style);
})();
