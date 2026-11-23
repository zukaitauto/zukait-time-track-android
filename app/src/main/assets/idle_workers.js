/* Legacy compatibility shim.
 * Ideal Worker / Ideal Time has one calculation authority: V247 in v74_updates.js.
 * This file intentionally performs no independent idle-time calculation.
 */
(function(){'use strict';
 function openIdeal(){
   if(typeof window.v247OpenIdealTime==='function')return window.v247OpenIdealTime();
   if(typeof window.v143OpenIdealWorker==='function')return window.v143OpenIdealWorker();
 }
 window.zukaitOpenIdleWorkers=function(){return openIdeal()};
 function cleanup(){
   document.querySelectorAll('[data-idle-workers-card]').forEach(x=>x.remove());
   document.querySelectorAll('[data-idle-workers-count]').forEach(x=>{
     const rows=typeof window.v247CurrentIdealRows==='function'?window.v247CurrentIdealRows():[];
     x.textContent=String(rows.length);
   });
 }
 window.addEventListener('zukait-live-status',cleanup);
 window.addEventListener('DOMContentLoaded',cleanup);
 setTimeout(cleanup,0);
})();