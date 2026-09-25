(function(){
'use strict';const V2=window.zukaitV2=window.zukaitV2||{},p=V2.spareParts=V2.spareParts||{};
p.uiTheme=Object.freeze({
name:'Zukait Spare Parts Light Glass',
tokens:{surface:'glass-light',text:'dark',depth:'subtle-3d',radius:'medium',iconSize:'small'},
status:{ACTIVE:'blue',INFO:'blue',WAITING:'amber',ATTENTION:'amber',URGENT:'red',RETURNED:'red',CAP_EXCEEDED:'red',COMPLETED:'green',ACCEPTED:'green'},
cards:[
{id:'CREATE',label:'Create Parts List',icon:'clipboard-plus',tone:'blue'},
{id:'NEW',label:'New Parts List',icon:'inbox',tone:'blue'},
{id:'LIST',label:'Parts List',icon:'list',tone:'blue'},
{id:'WAITING',label:'Parts Waiting',icon:'hourglass',tone:'amber'},
{id:'COMPLETED',label:'Purchase Completed',icon:'check-circle',tone:'green'},
{id:'DELIVERED_PENDING',label:'Delivered Vehicle – Pending Parts',icon:'car-clock',tone:'amber'},
{id:'RETURNS',label:'Returns / Problems',icon:'rotate-left',tone:'red'},
{id:'QUOTATION',label:'Quotation',icon:'file-price',tone:'blue'},
{id:'ATTENTION',label:'Parts Attention',icon:'bell',tone:'amber'},
{id:'REPORTS',label:'Purchase Reports',icon:'chart',tone:'blue'}
]});
p.cardTheme=id=>p.uiTheme.cards.find(x=>x.id===String(id||''))||null;
})();