(function(){
  'use strict';
  function rows(){
    const live=window.zukaitServerLive;
    if(Array.isArray(live))return live;
    if(Array.isArray(live?.rows))return live.rows;
    if(Array.isArray(window.currentStaffStatuses))return window.currentStaffStatuses;
    return [];
  }
  function byEmployee(id){return rows().find(x=>String(x?.id??x?.emp??'')===String(id))||null}
  function working(){return rows().filter(x=>String(x?.status||'').toLowerCase()==='working')}
  function paused(){return rows().filter(x=>String(x?.status||'').toLowerCase()==='paused')}
  window.zukaitV2=Object.assign(window.zukaitV2||{},{live:{rows,byEmployee,working,paused}});
})();
