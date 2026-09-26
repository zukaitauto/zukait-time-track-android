(function(){
  'use strict';
  function rows(){
    const live=window.zukaitServerLive;
    if(Array.isArray(live))return live;
    if(Array.isArray(live?.rows))return live.rows;
    if(typeof window.currentStaffStatuses==='function')return window.currentStaffStatuses();
    if(Array.isArray(window.currentStaffStatuses))return window.currentStaffStatuses;
    return [];
  }
  function employeeId(x){return x?.employee_id??x?.id??x?.emp??''}
  function status(x){return String(x?.status||'').toLowerCase()}
  function byEmployee(id){return rows().find(x=>String(employeeId(x))===String(id))||null}
  function working(){return rows().filter(x=>status(x)==='working'||status(x)==='overtime')}
  function active(){return rows().filter(x=>['working','overtime','id001'].includes(status(x)))}
  function paused(){return rows().filter(x=>status(x)==='paused')}
  function available(){return rows().filter(x=>status(x)==='available')}
  window.zukaitV2=Object.assign(window.zukaitV2||{},{live:{rows,byEmployee,working,active,paused,available}});
})();
