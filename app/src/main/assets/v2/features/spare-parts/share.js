(function(){
'use strict';const V2=window.zukaitV2=window.zukaitV2||{},p=V2.spareParts=V2.spareParts||{};
function partsText(list){const head=[list?.make,list?.model,list?.year].filter(Boolean).join(' ');return[head,...(list?.lines||[]).filter(x=>x&&!x.voided).map((x,i)=>(i+1)+'. '+x.name+' - Qty '+x.qty)].filter(Boolean).join('\n')}
function followUp(list,line){return['Following up:',[list?.make,list?.model].filter(Boolean).join(' '),'-',line?.name+'.','Please confirm availability/delivery.'].join(' ').replace(/\s+/g,' ').trim()}
p.share={partsText,followUp};
})();