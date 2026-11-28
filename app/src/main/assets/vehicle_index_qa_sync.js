/* Session-scoped catalogue refresh. Never polls or persists staff approvals locally. */
(function(root){
 'use strict';
 if(root.ZUKAIT_VEHICLE_INDEX_READY!==true||!root.zukaitVehicleIndexBase)return;
 const base=root.zukaitVehicleIndexBase;
 let state=null,generation=0;
 const apply=snapshot=>root.zukaitVehicleAutocomplete.configure(root.zukaitVehicleIndex.create(snapshot));
 function reset(){generation++;state=null;apply(base);}
 function active(s){try{return state===s&&s.isCurrent()===true}catch(_){return false}}
 async function refresh(force=false){
  const s=state;if(!s||!active(s)||root.navigator.onLine===false)return false;
  if(s.busy||(!force&&Date.now()-s.lastAttempt<300000))return false;
  const epoch=generation;s.lastAttempt=Date.now();s.busy=true;
  try{
   const r=await root.zukaitVehicleIndexLoader.load(base,{read:s.read,isCurrent:()=>generation===epoch&&active(s)});
   if(generation!==epoch||!active(s))return false;
   if(r.status==='SERVER_CONFIRMED'){apply(r.snapshot);return true;}
   return false;
  }catch(_){return false;}
  finally{s.busy=false;}
 }
 function start({read,isCurrent}={}){
  reset();if(typeof read!=='function'||typeof isCurrent!=='function')return Promise.resolve(false);
  state={read,isCurrent,lastAttempt:0,busy:false};return refresh(true);
 }
 root.addEventListener('focus',()=>{if(state&&!active(state)){reset();return;}void refresh();});
 root.addEventListener('online',()=>{if(state&&!active(state)){reset();return;}void refresh();});
 root.zukaitVehicleIndexQaSync=Object.freeze({start,reset,refresh});
})(window);
