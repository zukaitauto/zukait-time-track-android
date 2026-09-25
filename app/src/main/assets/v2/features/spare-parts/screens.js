(function(){
'use strict';const V2=window.zukaitV2=window.zukaitV2||{},p=V2.spareParts=V2.spareParts||{};
const common=Object.freeze({search:'JC / PL / Registration / Vehicle / Part',actions:['PRINT','PDF','WHATSAPP','BACK_CLOSE']});
const screens=Object.freeze({
SUPERVISOR_DASHBOARD:{grid:[['CREATE','NEW'],['LIST','WAITING'],['COMPLETED','DELIVERED_PENDING']],attention:true},
PURCHASER_DASHBOARD:{grid:[['NEW','LIST'],['WAITING','RETURNS'],['COMPLETED','DELIVERED_PENDING'],['QUOTATION',null]],attention:true},
MANAGER_DASHBOARD:{grid:[['NEW','LIST'],['WAITING','COMPLETED'],['DELIVERED_PENDING','QUOTATION'],['REPORTS','ATTENTION']],attention:true},
CREATE:{jobCardSearch:true,autoVehicle:true,partEntry:['name','qty','add'],partAutocomplete:true,table:['no','part','qty','action'],createRequiresPart:true},
NEW:{...common,compactRows:['date','pl','jc','makeModel','year'],plainTextWhatsApp:true},
LIST:{...common,compactRows:['date','pl','jc','makeModel','year'],additionalParts:true},
WAITING:{...common,compactRows:['date','pl','jc','makeModel','year'],detailColumns:['part','qty','priceWait','ordered','arrived','returned','finalPrice']},
COMPLETED:{...common,compactRows:['date','pl','jc','makeModel','year'],readAudit:true},
DELIVERED_PENDING:{...common,compactRows:['date','pl','jc','makeModel','year','pendingCount']},
QUOTATION:{...common,shops:['A','B','C'],currencies:['OMR','AED'],columns:['part','qty','A','B','C','selected']},
REPORTS:{...common,periods:['TODAY','WEEK','MONTH','CUSTOM'],views:['BY_JOB_CARD','HISTORY','INITIAL_VS_ADDITIONAL','QUOTATION','CAP','PENDING','COMPLETED']}
});
p.screens=screens;p.screen=id=>screens[String(id||'')]||null;
})();