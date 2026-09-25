(function(){
 const V2=window.zukaitV2=window.zukaitV2||{}, c=V2.consumables=V2.consumables||{};
 c.contractVersion=1;
 c.department='Painting';
 c.types=Object.freeze({ISSUED:'issued',ADDITIONAL:'additional',ACTUAL:'actual'});
 c.units=Object.freeze(['Liter','kg','Piece']);
 c.categories=Object.freeze(['Paint','Consumable']);
 c.canEnter=role=>role==='Supervisor'||role==='Manager';
 c.canAdmin=role=>role==='Manager';
 c.normalizeJobCard=v=>String(v||'').trim().toUpperCase();
 c.allowance=function(issues,jc){const job=c.normalizeJobCard(jc),map=new Map();(issues||[]).filter(x=>x&&!x.voided&&x.locked&&x.department===c.department&&c.normalizeJobCard(x.jobCard)===job).forEach(r=>(r.lines||[]).forEach(l=>{const k=l.materialId+'|'+l.brandId,cur=map.get(k)||{materialId:l.materialId,brandId:l.brandId,unit:l.unit,quantity:0};cur.quantity+=Number(l.quantity)||0;map.set(k,cur)}));return[...map.values()]};
 c.validateActual=function(input,ctx){const x=input||{},z=ctx||{},jc=c.normalizeJobCard(x.jobCard);if(!jc)return{ok:false,code:'JOB_CARD_REQUIRED'};if(!c.canEnter(z.role))return{ok:false,code:'CONSUMABLES_FORBIDDEN'};if((z.actuals||[]).some(a=>a&&!a.voided&&a.department===c.department&&c.normalizeJobCard(a.jobCard)===jc&&!a.managerReopen))return{ok:false,code:'ACTUAL_RECORD_EXISTS'};const allowed=c.allowance(z.issues,jc);if(!allowed.length)return{ok:false,code:'NO_ISSUED_MATERIALS'};for(const l of x.lines||[]){const a=allowed.find(q=>q.materialId===l.materialId&&q.brandId===l.brandId);if(!a)return{ok:false,code:'ACTUAL_NOT_ISSUED'};const q=Number(l.quantity);if(!Number.isFinite(q)||q<0||q>a.quantity+1e-9)return{ok:false,code:'ACTUAL_EXCEEDS_ISSUED'}}return{ok:true,allowed}};
 c.variance=function(issued,actual){const i=Number(issued)||0,a=Number(actual)||0;return{issued:i,actual:a,ratio:i>0?a/i:null,percent:i>0?(a/i)*100:null}};
 c.snapshotCost=function(quantity,unitPrice){const q=Number(quantity)||0,p=Number(unitPrice)||0;return Math.round((q*p+Number.EPSILON)*1000)/1000};
 c.monthlyExpense=function(actuals,from,to){const rows=(actuals||[]).filter(x=>x&&!x.voided&&x.locked&&Number(x.actualAt)>=from&&Number(x.actualAt)<to);return{jobCards:new Set(rows.map(x=>x.jobCard)).size,totalExpense:Math.round((rows.reduce((s,x)=>s+(Number(x.totalCost)||0),0)+Number.EPSILON)*1000)/1000,records:rows.length}};
})();
