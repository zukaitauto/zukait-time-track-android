(function(root){'use strict';
const DAY=86400000,OMAN=4*3600000;
function bounds(kind,at=Date.now()){
 const local=new Date(Number(at)+OMAN);
 if(!Number.isFinite(local.getTime()))throw Error('Invalid workshop date');
 const midnight=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())-OMAN;
 if(kind==='day')return [midnight,midnight+DAY,'Today'];
 if(kind==='week'){const saturday=midnight-((local.getUTCDay()+1)%7)*DAY;return [saturday,saturday+6*DAY,'This Week · Saturday–Thursday'];}
 return [Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),1)-OMAN,Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+1,1)-OMAN,'This Month'];
}
root.zukaitWorkshopPeriods=Object.freeze({bounds});
})(typeof window!=='undefined'?window:globalThis);
