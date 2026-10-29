// Presentation adapters only: existing destinations retain their own permissions,
// filters, calculations and server authority. No network, polling or storage here.
export function createMechanicalShortcuts({host,document:doc,getSession}){
 const owner=JSON.stringify(getSession()),current=()=>owner===JSON.stringify(getSession());
 const permitted=()=>current()&&host.ZUKAIT_MECHANICAL_ENABLED===true&&['Manager','Supervisor'].includes(getSession()?.role);
 const manager=()=>permitted()&&getSession().role==='Manager';
 const routes={
  estimate:{scope:'Reception',test:()=>typeof host.zukaitEstimate?.newEstimate==='function',run:()=>host.zukaitEstimate.newEstimate()},
  'estimate-list':{scope:'Reception',test:()=>typeof host.zukaitEstimate?.openFind==='function',run:()=>host.zukaitEstimate.openFind()},
  'create-job':{scope:'Reception',test:()=>typeof host.zukaitReception?.directJob==='function',run:()=>host.zukaitReception.directJob()},
  jobs:{scope:'Reception',test:()=>typeof host.zukaitReception?.open==='function'&&typeof host.zukaitReceptionDashboard?.showJobs==='function',run:async()=>{await host.zukaitReception.open();if(!permitted())throw Error('Account changed. Reopen Mechanical Department.');if(await host.zukaitReceptionDashboard.showJobs()===false)throw Error('Job Cards are unavailable. Open Reception and refresh.');}},
  // Department-specific queues must never open the shared Body Workshop views.
  // Mechanical sections are provided by the workspace's authorized openSection handler.
  wip:{scope:'Mechanical records',test:()=>false,run:()=>{}},
  qc:{scope:'Mechanical records',test:()=>false,run:()=>{}},
  ready:{scope:'Mechanical records',test:()=>false,run:()=>{}},
  delivered:{scope:'Mechanical records',test:()=>false,run:()=>{}},
  exceeded:{scope:'Mechanical filter',test:()=>typeof host.openSupervisorJobCardList==='function'&&typeof host.v74JobListRender==='function',run:()=>{host.openSupervisorJobCardList();const department=doc.getElementById('v74jld'),status=doc.getElementById('v74jls');if(!department||!status)throw Error('Job Card filters are unavailable. Refresh and retry.');department.value='mechanic';status.value='exceeded';host.v74JobListRender();}}
 };
 const available=key=>permitted()&&!!routes[key]?.test();
 return {
  available,scope:key=>routes[key]?.scope||'',
  async open(key){if(!available(key))throw Error('This shortcut is unavailable for this login.');return routes[key].run()},
  counts(){
   if(!permitted())return {};
   // Shared Body Workshop counters are not Mechanical department counts.
   // Do not display them here. A Mechanical-specific authoritative response
   // must supply counts before badges can safely be shown.
   return {};
  }
 };
}
