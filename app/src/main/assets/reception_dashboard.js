(function(){
  "use strict";
  // One Reception workspace for existing Manager/Supervisor sessions and
  // the dedicated Receptionist session. All lists come from the same server.
  const definitions=[
    ["new","Create Checklist","New vehicle intake","📝"],
    ["create-job","Create Job Card","Cash / Credit · approved Insurance","🚗"],
    ["checklists","Checklist List","Number · date · month · search","📋"],
    ["jobs","Job Card List","Number · date · month · search","🗂"],
    ["waiting","Approval Waiting Insurance","Checklist not yet approved","⏳"],
    ["vwc","Vehicle With Customer","Checklists and Job Cards separately","🏠"],
    ["approved","Approved Vehicles","Until Job Card is opened","✅"],
    ["ctl","CTL Vehicles in Garage","Notes · Deliver / Release","🚘"],
    ["not-repaired","Not Repaired Vehicles","Reason and original Checklist","📝"],
    ["insurance","Insurance","Manager Insurance & LPO","📊"],
    ["ready","Ready to Deliver","Shared QC authority","🚙"],
    ["delivered","Delivered Vehicle List","Latest delivered first","📦"],
    ["followup","Delivery Follow-up","Promise date · no promise date","📅"]
  ];
  // Correct the ampersand/angle/quote escapes without passing input as HTML.
  const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const role=()=>window.me?.role||"";
  const writable=()=>["Manager","Supervisor"].includes(role());
  let screen="home",section="checklists",page=0,filters={search:"",month:"",from:"",to:"",missing_only:false,dated_only:false,checklist_status:"all"};
  let backendAvailable=false;
  let counts={},latest=[],total=0,loading=false,sequence=0,pendingTimer=null;
  function css(){
    if(document.getElementById("rdb-css"))return;
    const s=document.createElement("style");s.id="rdb-css";
    s.textContent=`
    #rc-root .rdb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0 20px}
    #rc-root .rdb-grid>*{min-width:0;max-width:100%}
    #rc-root .rdb-content{min-width:0;overflow-wrap:anywhere;word-break:normal}
    #rc-root .rdb-filter>label{min-width:0;max-width:100%}
    #rc-root .rdb-filter>label input{min-width:0;max-width:100%}
    #rc-root .rdb-card{display:flex;align-items:center;gap:12px;text-align:left;padding:16px;min-height:94px;width:100%;background:#fff;color:#15374d;border:1px solid #ccdfed;border-radius:15px;box-shadow:0 5px 15px #18324a12;cursor:pointer;touch-action:manipulation;transition:transform .12s ease,box-shadow .12s ease}
    #rc-root .rdb-card:active{transform:translateY(2px);box-shadow:0 2px 8px #18324a12}
    @media(hover:hover){#rc-root .rdb-card:hover{border-color:#5bacaa;box-shadow:0 7px 18px #18324a20}}
    #rc-root .rdb-section-nav{display:flex;align-items:center;gap:12px;margin:8px 0 15px}
    #rc-root .rdb-section-nav button{min-height:44px;background:#e4f6f3!important;color:#125d5c!important;border:1px solid #8bc8c1!important;border-radius:12px!important;font-weight:800!important}
    #rc-root .rdb-card:focus-visible{outline:3px solid #138c91;outline-offset:2px}
    #rc-root .rdb-card[data-active=true]{background:#e6f8f5;border:2px solid #5bacaa}
    #rc-root .rdb-emoji{font-size:27px}#rc-root .rdb-content{display:flex;flex:1;flex-direction:column;gap:4px}
    #rc-root .rdb-content b{font-size:17px}#rc-root .rdb-content small{font-size:12px;color:#547085}
    #rc-root .rdb-count{font-size:21px;color:#0f6671;font-weight:900}
    #rc-root .rdb-filter{display:grid;grid-template-columns:2fr repeat(3,minmax(0,1fr));gap:10px}
    #rc-root .rdb-row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:start;gap:12px;border:1px solid #d1e0ec;border-radius:12px;background:white;margin:9px 0;padding:13px}
    #rc-root .rdb-no{font-weight:900;color:#1a637e}#rc-root .rdb-row-content{min-width:0;overflow-wrap:anywhere}
    #rc-root .rdb-row-content b{font-size:16px}#rc-root .rdb-row-content small{display:block;margin-top:5px;font-size:13px}
    #rc-root .rdb-promise{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:8px}
    #rc-root .rdb-promise input{max-width:188px;width:auto;margin:0}#rc-root .rdb-row-actions{display:flex;flex-direction:column;gap:6px}
    #rc-root .rdb-row-actions button{margin:0!important;font-size:13px!important;min-height:37px!important}
    #rc-root .rdb-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}
    #rc-root .rdb-toolbar h4{margin:0}#rc-root .rdb-status{font-size:14px;color:#42667c}
    @media(max-width:800px){#rc-root .rdb-filter{grid-template-columns:1fr 1fr}}
    @media(max-width:550px){#rc-root .rdb-grid{gap:8px}#rc-root .rdb-card{padding:11px;min-height:112px;gap:5px;flex-direction:column;align-items:flex-start;justify-content:center;min-width:0}
      #rc-root .rdb-emoji{font-size:19px}#rc-root .rdb-content b{font-size:14px}
      #rc-root .rdb-content small{font-size:11px}#rc-root .rdb-count{font-size:17px}
      #rc-root .rdb-filter{grid-template-columns:1fr 1fr}
      #rc-root .rdb-row{grid-template-columns:25px 1fr}
      #rc-root .rdb-row-actions{grid-column:2;flex-direction:row;flex-wrap:wrap}}
    `;
    s.textContent+=`
    #rc-root .rdb-toolbar:first-child{padding:16px;background:linear-gradient(120deg,#102c46,#075985);color:white;border-radius:13px;margin-bottom:14px}#rc-root .rdb-toolbar:first-child h4{color:#fff!important;font-size:18px}#rc-root .rdb-toolbar:first-child button{background:#fff!important;color:#075985!important;border-radius:9px;padding:9px 12px}#rc-root .rdb-filter{padding:14px;background:#eff6ff;border:1px solid #cbdff2;border-radius:13px;margin-bottom:16px;gap:12px}#rc-root .rdb-filter label{font-size:12px;font-weight:800;color:#334155}#rc-root .rdb-filter input{width:100%;box-sizing:border-box;background:white;border:1px solid #aec4d6;border-radius:9px;margin-top:6px;padding:10px;min-height:44px}#rc-root .rdb-row{border-left:4px solid #d97706;box-shadow:0 2px 7px #17304d0a;padding:16px}#rc-root .rdb-no{display:grid;place-items:center;background:#e0f2fe;border-radius:8px;min-height:28px;font-size:12px}#rc-root .rdb-row-content>b{line-height:1.5}#rc-root .rdb-location{display:inline-flex;font-size:10px;font-weight:900;padding:4px 8px;border-radius:20px;margin:0 0 5px 8px;vertical-align:middle;letter-spacing:.3px}#rc-root .rdb-vig{background:#ccfbf1;color:#115e59;border:1px solid #5eead4}#rc-root .rdb-vwc{background:#fef3c7;color:#92400e;border:1px solid #fcd34d}#rc-root .rdb-state{display:inline-block;margin-top:9px;padding:5px 9px;border-radius:7px;font-size:11px;font-weight:800;background:#e2e8f0;color:#334155}#rc-root .rdb-state.waiting{background:#ffedd5;color:#9a3412}#rc-root .rdb-state.approved{background:#dcfce7;color:#166534}#rc-root .rdb-checklist-click{cursor:pointer}#rc-root .rdb-checklist-click:focus-visible{outline:3px solid #0284c7;outline-offset:2px}#rc-root .rdb-row-actions button[data-rdb="open"]{background:#0369a1!important;color:#fff!important;border-radius:9px;padding:8px 12px}#rc-root .rdb-row-content small{color:#526172;line-height:1.5}
`;
    s.textContent+=`
    #rc-root .rdb-toolbar:first-child{padding:11px 13px;margin-bottom:10px;border-radius:10px}#rc-root .rdb-filter{padding:10px;gap:8px;margin-bottom:10px}#rc-root .rdb-filter input{min-height:38px!important;height:38px;margin-top:4px;padding:7px 8px!important;font-size:13px!important}#rc-root .rdb-row{padding:10px!important;margin:7px 0;gap:8px;grid-template-columns:23px minmax(0,1fr) auto;border-radius:10px}#rc-root .rdb-no{min-height:24px;font-size:11px}#rc-root .rdb-row-content>b{font-size:14px!important;line-height:1.35}#rc-root .rdb-row-content small{margin-top:3px;font-size:11px!important;line-height:1.35}#rc-root .rdb-location{padding:2px 6px;font-size:9px;margin-left:5px}#rc-root .rdb-state{margin-top:4px;padding:2px 6px;font-size:10px}#rc-root .rdb-promise{gap:6px;margin-top:7px}#rc-root .rdb-promise label{display:flex;align-items:center;gap:6px;font-size:11px!important;font-weight:600;min-width:0}#rc-root .rdb-promise input{width:138px!important;max-width:100%;height:34px!important;min-height:34px!important;margin:0!important;padding:4px 6px!important;font-size:12px!important;box-sizing:border-box}#rc-root .rdb-promise button{width:auto!important;min-height:34px!important;padding:5px 9px!important;font-size:11px!important;border-radius:7px;background:#0f766e!important;color:white!important}#rc-root .rdb-row-actions{gap:5px;align-self:center}#rc-root .rdb-row-actions button{width:auto!important;min-height:34px!important;padding:6px 9px!important;font-size:11px!important;border-radius:7px!important}#rc-root .rdb-row-actions button[data-rdb="edit-job"]{background:#fef3c7!important;color:#92400e!important;border:1px solid #fcd34d!important}@media(max-width:550px){#rc-root .rdb-row{grid-template-columns:21px minmax(0,1fr)}#rc-root .rdb-row-actions{grid-column:2;flex-direction:row;gap:7px;margin-top:0}#rc-root .rdb-promise{flex-wrap:nowrap}#rc-root .rdb-promise label{flex:1;justify-content:space-between}#rc-root .rdb-promise input{width:132px!important;flex:0 1 132px;min-width:0}#rc-root .rdb-filter{gap:8px}#rc-root .rdb-filter>label{font-size:11px}}@media(max-width:360px){#rc-root .rdb-promise label{flex-wrap:wrap;gap:3px}#rc-root .rdb-promise input{flex-basis:100%;width:100%!important}}
`;
    s.textContent+=`#rc-root .rdb-row-content>button[data-rdb="open-job"]{background:#dbeafe!important;color:#1e40af!important;border:1px solid #93c5fd!important;border-radius:7px;min-height:30px!important;padding:4px 8px!important;font-size:10px!important;margin:5px 0 0!important;width:auto!important}#rc-root .rdb-row-actions button[data-rdb="edit-job"]{background:#fef3c7!important;color:#92400e!important;border-color:#fcd34d!important}#rc-root .rdb-row-content>b{display:inline;letter-spacing:0}#rc-root .rdb-section-nav{margin:5px 0 10px}#rc-root .rdb-section-nav button{min-height:34px!important;font-size:11px!important;padding:6px 10px!important}`;
    document.head.appendChild(s);
  }
  const countFor=key=>key==="new"||key==="create-job"?"":key==="vwc"?counts.vwc??"":counts[key]??"";
  function tiles(){
    return definitions.filter(d=>d[0]!=="insurance"||role()==="Manager").map(([key,title,sub,icon])=>
      '<button type="button" class="rdb-card" data-rdb="tile" data-section="'+key+'" data-active="false" aria-label="Open '+safe(title)+'">'+
      '<span class="rdb-emoji" aria-hidden="true">'+icon+'</span><span class="rdb-content"><b>'+safe(title)+
      '</b><small>'+safe(!backendAvailable&&!['new','checklists'].includes(key)?'Server update required':sub)+'</small></span><span class="rdb-count">'+safe(backendAvailable?countFor(key):'')+'</span></button>').join("");
  }
  const label=key=>definitions.find(x=>x[0]===key)?.[1]||"Reception";
  function filterHtml(){
    return (section==='checklists'?'<label>Checklist Status<select data-rdb-filter="checklist_status"><option value="all">All</option><option value="pending"'+(filters.checklist_status==='pending'?' selected':'')+'>Pending</option><option value="opened"'+(filters.checklist_status==='opened'?' selected':'')+'>JC Opened</option></select></label>':'')+'<div class="rdb-filter">'+
      '<label>Search<input data-rdb-filter="search" placeholder="RC / JC / registration / vehicle" value="'+safe(filters.search)+'"></label>'+
      '<label>Month<input type="month" data-rdb-filter="month" value="'+safe(filters.month)+'"></label>'+
      '<label>From<input type="date" data-rdb-filter="from" value="'+safe(filters.from)+'"></label>'+
      '<label>To<input type="date" data-rdb-filter="to" value="'+safe(filters.to)+'"></label></div>'+
      (section==="followup"?'<label>Promise Date Filter<select data-rdb-filter="promise-mode"><option value="all">All undelivered vehicles</option>'+
      '<option value="missing"'+(filters.missing_only?' selected':'')+'>No promise date ('+safe(counts.no_promise_date??0)+')</option>'+
      '<option value="dated"'+(filters.dated_only?' selected':'')+'>With promise date</option></select></label>':'');
  }
  function locationBadge(location){const code=String(location||'').toUpperCase();return code==='VIW'||code==='VIG'?'<span class="rdb-location rdb-vig" title="Vehicle in Garage">VIG</span>':code==='VWC'?'<span class="rdb-location rdb-vwc" title="Vehicle With Customer">VWC</span>':'';}
  function rowHtml(row,index){
    const isJob=!!row.job_card,live=!row.delivered&&isJob,canEdit=live&&writable();
    const title=section==="checklists"?safe(row.rc_no):isJob?"JC "+safe(row.job_card):safe(row.rc_no);
    const date=section==="delivered"?"Delivered: "+(row.delivered_date||"Not recorded"):
      section==="followup"?"Promise: "+(row.promise_date||"No promise date"):
      section==="jobs"?"Created: "+(row.created_at?new Date(row.created_at).toLocaleString('en-GB',{timeZone:'Asia/Muscat'}):'Not recorded'):"Received: "+(row.received_date||row.created_date||"Not recorded");
    const promise=canEdit?
      '<div class="rdb-promise"><label>Promise Date (optional)<input type="date" data-rdb-promise="'+safe(row.job_card)+
      '" value="'+safe(row.promise_date)+'"></label><button type="button" data-rdb="promise" data-job="'+safe(row.job_card)+
      '" data-original="'+safe(row.promise_date)+'">Save</button></div>':
      isJob?'<small>Promise: '+safe(row.promise_date||"No promise date")+'</small>':'';
    const open='<button type="button" data-rdb="open" data-rc="'+safe(isJob&&section!=='checklists'?'':row.rc_no)+'" data-job="'+safe(row.job_card)+'">'+
      (isJob&&section!=='checklists'?'View Job Card':'Open Checklist')+'</button>';
    const deliver=section==="ready"?
      '<button type="button" data-rdb="delivery" data-job="'+safe(row.job_card)+'">'+
      (role()==="Manager"?"Open Ready List":"Vehicle Delivery")+'</button>':"";
    return '<div class="rdb-row'+(!isJob?' rdb-checklist-click':'')+'"'+(!isJob?' role="button" tabindex="0" data-rdb="open" data-rc="'+safe(row.rc_no)+'" data-job=""':'')+'><span class="rdb-no">'+(index+1+page*50)+'.</span>'+
      '<div class="rdb-row-content"><b>'+title+' · '+safe(row.vehicle||"Vehicle not recorded")+
      '</b>'+locationBadge(row.location)+'<small>'+safe(row.registration||"Registration not recorded")+' · '+safe(row.insurance_company||row.job_type||"")+
      (row.rc_no&&isJob?' · '+safe(row.rc_no):'')+'</small><small>'+safe(date.replace(/(\d{4})-(\d{2})-(\d{2})/g,'$3-$2-$1'))+'</small><span class="rdb-state '+(String(row.status).toUpperCase()==='WAITING'?'waiting':String(row.status).toUpperCase()==='APPROVED'?'approved':'neutral')+'">'+safe(row.status==='WAITING'?'Approval Waiting':row.status||'Status not recorded')+'</span>'+(section==='checklists'&&isJob?'<button type="button" data-rdb="open-job" data-job="'+safe(row.job_card)+'">JC Opened · '+safe(row.job_card)+'</button>':'')+promise+'</div>'+
      '<div class="rdb-row-actions">'+open+deliver+(isJob&&(!row.delivered||role()==='Manager')?'<button type="button" data-rdb="edit-job" data-job="'+safe(row.job_card)+'">Edit Job Card</button>':'')+'</div></div>';
  }
  function listHtml(){
    const vwc=section==="vwc";
    const requested=section==="vwc"?"vwc-checklists":section;
    return '<section class="rc-box"><div class="rdb-toolbar"><h4>'+safe(label(section))+'</h4>'+
      '<button type="button" data-rdb="refresh">↻ Refresh</button></div>'+
      (vwc?'<div class="rc-actions"><button type="button" data-rdb="vwc" data-section="vwc-checklists">'+
      'Checklists with Customer ('+safe(counts["vwc-checklists"]??0)+')</button>'+
      '<button type="button" data-rdb="vwc" data-section="vwc-jobs">Job Cards with Customer ('+
      safe(counts["vwc-jobs"]??0)+')</button></div>':'')+
      filterHtml()+'<div id="rdb-results" aria-live="polite"></div>'+
      '<div class="rdb-toolbar"><span id="rdb-page"></span><div>'+
      '<button type="button" data-rdb="previous">Previous</button> '+
      '<button type="button" data-rdb="next">Next</button></div></div></section>';
  }
  let vwcSection="vwc-checklists";
  function render(){
    css();
    const home=screen==="home";
    window.zukaitReception.dashboardShell(home?"Reception Dashboard":"Reception · "+label(section),
      home?'<p class="rdb-status">'+(backendAvailable?'Reception operations · Data confirmed by the server · Oman dates':'Checklist intake and list are available. The other dashboard functions need a server update.')+'</p>'+
        '<div class="rdb-grid">'+tiles()+'</div>'+
        (backendAvailable?'':'<section class="rc-box" id="rdb-unavailable" aria-live="polite"><h4>Your Reception dashboard</h4><p>Choose Create Checklist or Checklist List to use the current workshop service. Other sections are not yet available on this server; no counts or empty lists are assumed.</p></section>'):
        '<div class="rdb-section-nav"><button type="button" data-rdb="back-dashboard">← Reception Dashboard</button></div>'+listHtml());
    const root=document.getElementById("rc-root");if(!root)return;
    root.addEventListener("click",onClick);
    root.addEventListener('keydown',event=>{if(event.target.matches('.rdb-checklist-click')&&['Enter',' '].includes(event.key)){event.preventDefault();event.target.click()}});
    root.addEventListener("input",onFilter);
    root.addEventListener("change",onFilter);
    showRows();
  }
  function showRows(){
    const host=document.getElementById("rdb-results"),foot=document.getElementById("rdb-page");
    if(!host||!foot)return;
    const markup=loading?'<p>Loading from Reception server…</p>':
      latest.length?latest.map(rowHtml).join(""):'<p>No matching records found.</p>';
    if(host.innerHTML!==markup)host.innerHTML=markup;
    foot.textContent=(total?("Showing "+(page*50+1)+"–"+Math.min((page+1)*50,total)+" of "+total):"0 records");
    const next=document.querySelector('#rc-root [data-rdb="next"]');
    const prev=document.querySelector('#rc-root [data-rdb="previous"]');
    if(next)next.disabled=(page+1)*50>=total;
    if(prev)prev.disabled=page===0;
  }
  async function load(background=false){
    if(!backendAvailable)return;
    const request=++sequence;
    loading=true;if(!background)showRows();
    const requestedSection=screen==="home"?"checklists":section==="vwc"?vwcSection:section;
    try{
      const r=await window.zukaitReception.action({action:"reception_dashboard",section:requestedSection,
        ...filters,page});
      if(request!==sequence)return;
      counts=r.counts||{};latest=r.rows||[];total=Number(r.total||0);
      const grid=document.querySelector("#rc-root .rdb-grid");
      if(grid)grid.innerHTML=tiles();
      const foot=document.getElementById("rdb-page");
      if(foot&&section==="followup") {
        const mode=document.querySelector('#rc-root [data-rdb-filter="promise-mode"] option[value="missing"]');
        if(mode)mode.textContent="No promise date ("+(counts.no_promise_date||0)+")";
      }
    }catch(e){if(request===sequence){if(!background){latest=[];total=0;}const err=document.getElementById("rc-error");if(err)err.textContent=e.message||String(e);}}
    finally{if(request===sequence){loading=false;showRows();}}
  }
  async function open(options={}){backendAvailable=options.backendAvailable===true;++sequence;clearTimeout(pendingTimer);loading=false;screen="home";section="checklists";vwcSection="vwc-checklists";page=0;
    filters={search:"",month:"",from:"",to:"",missing_only:false,dated_only:false,checklist_status:"all"};
    latest=[];counts={};total=0;render();await load();}
  // Preserve the selected list and filters when returning from a checklist.
  async function resume(){render();await load();}
  async function showDashboard(){
    screen="home";section="checklists";page=0;
    filters={search:"",month:"",from:"",to:"",missing_only:false,dated_only:false,checklist_status:"all"};
    latest=[];total=0;render();await load();
  }
  async function choose(next){
    if(!backendAvailable){
      if(next==="new")return window.zukaitReception.newChecklist();
      if(next==="checklists")return window.zukaitReception.checklistList();
      const notice=document.getElementById("rdb-unavailable");
      if(notice)notice.innerHTML="<h4>"+safe(label(next))+"</h4><p>This function needs the Reception server update. No records were loaded or changed. Use the existing workshop workflow until activation is verified.</p>";
      return;
    }
    if(next==='insurance')return window.zukaitInsuranceManagement?.open();
    if(next==="new")return window.zukaitReception.newChecklist();
    if(next==="create-job")return window.zukaitReception.directJob();
    screen="list";section=next;page=0;filters={search:"",month:"",from:"",to:"",missing_only:false,dated_only:false,checklist_status:"all"};
    latest=[];total=0;render();await load();
  }
  function onFilter(event){
    const k=event.target?.dataset?.rdbFilter;if(!k)return;
    if(k==="promise-mode"){
      filters.missing_only=event.target.value==="missing";
      filters.dated_only=event.target.value==="dated";
    }else filters[k]=event.target.value;
    if(event.type==="input"&&k!=="search")return;
    clearTimeout(pendingTimer);page=0;
    if(k==="search")pendingTimer=setTimeout(()=>load(),280);
    else void load();
  }
  async function savePromise(jobCard,date,original){
    if(!backendAvailable)throw Error("Promise Date needs the Reception server update.");
    if(!writable())throw Error("Only Manager or Supervisor can enter Promise Date.");
    if(date&&!/^\d{4}-\d\d-\d\d$/.test(date))throw Error("Choose a valid Promise Date.");
    const key="zukait_reception_promise_pending:"+window.zukaitReception.endpoint+":"+role()+":"+jobCard;
    let pending;
    const saved=localStorage.getItem(key);
    if(saved){pending=JSON.parse(saved);
      if(pending.promise_date!==date||pending.expected_promise_date!==original)
        throw Error("A previous Promise Date change is unconfirmed. Retry that entry first.");
    }else{
      pending={action:"reception_promise_date",job_card:jobCard,promise_date:date,
        expected_promise_date:original,request_id:crypto.randomUUID()};
      localStorage.setItem(key,JSON.stringify(pending));
      if(localStorage.getItem(key)!==JSON.stringify(pending))throw Error("Cannot safely save pending Promise Date.");
    }
    try{
      const r=await window.zukaitReception.action(pending);
      if(!r.ok)throw Error(r.code||"Promise Date not saved");
      localStorage.removeItem(key);
      try{await window.zukaitCloud?.pull?.(true);}catch(_){}
      return r;
    }catch(e){if(["reception_promise_conflict","reception_job_not_open","reception_promise_invalid_date"].includes(e.message))
      localStorage.removeItem(key);
      throw e;}
  }
  async function onClick(event){
    const button=event.target.closest("[data-rdb]");if(!button)return;
    event.preventDefault();
    try{
      const what=button.dataset.rdb;
      if(what==='open-job'){
        return window.zukaitJobEdit.view(button.dataset.job,{onBack:resume});
      }
      if(what==="edit-job")return window.zukaitJobEdit.open(button.dataset.job);
      if(what==="tile"){await choose(button.dataset.section);return;}
      if(what==="back-dashboard"){await showDashboard();return;}
      if(what==="vwc"){vwcSection=button.dataset.section;page=0;latest=[];total=0;return load();}
      if(what==="refresh"){page=0;return load();}
      if(what==="previous"&&page>0){page--;return load();}
      if(what==="next"&&(page+1)*50<total){page++;return load();}
      if(what==="promise"){
        const jc=button.dataset.job;const inp=[...document.querySelectorAll("#rc-root [data-rdb-promise]")].find(x=>x.dataset.rdbPromise===jc);
        if(!inp)return;
        button.disabled=true;
        try{await savePromise(jc,inp.value,button.dataset.original);await load();}
        finally{button.disabled=false;}
        return;
      }
      if(what==="open"){
        if(button.dataset.rc)return window.zukaitReception.openRecord(button.dataset.rc);
        return window.zukaitJobEdit.view(button.dataset.job,{onBack:resume});
      }
      if(what==="back"){render();await load();return;}
      if(what==="delivery"){
        if(role()==="Receptionist")return window.zukaitReceptionist?.deliveries?.();
        if(typeof window.v143OpenReadyForDelivery==="function")return window.v143OpenReadyForDelivery();
        return window.v74Ready?.();
      }
    }catch(e){const el=document.getElementById("rc-error");if(el)el.textContent=e.message||String(e);}
  }
  // Refresh only an open job list; preserve filters, pagination and typed forms.
  setInterval(()=>{
    const active=document.activeElement;
    if(backendAvailable&&screen==='list'&&section==='jobs'&&!loading&&!document.hidden&&document.getElementById('rdb-results')&&
       !active?.matches?.('#rc-root [data-rdb-promise]'))void load(true);
  },10000);
  async function showJobs(){if(!backendAvailable)return false;await choose('jobs');return true;}
  window.zukaitReceptionDashboard={open,resume,home:showDashboard,showJobs,savePromise,choose};
})();
