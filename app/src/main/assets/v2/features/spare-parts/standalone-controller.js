(function(){
'use strict';const V2=window.zukaitV2=window.zukaitV2||{},p=V2.spareParts=V2.spareParts||{};
function clone(x){return JSON.parse(JSON.stringify(x))}
function createStore(seed={}){let state={role:seed.role||'Supervisor',lists:clone(seed.lists||[]),active:null,screen:'DASHBOARD',draft:{lines:[]},events:[]};if(p.completion)state.lists=state.lists.map(x=>p.completion.apply(x).list);const emit=(type,data={})=>state.events.push({type,data,at:new Date().toISOString()});function findPL(n){return state.lists.find(x=>x.number===n)}
function dispatch(a,payload={}){switch(a){
case'OPEN':state.screen=payload.screen;state.active=payload.pl||state.active;break;
case'CREATE_DRAFT_PART':if(!String(payload.name||'').trim())return{ok:false,code:'PART_REQUIRED'};state.draft.lines.push({id:'D'+Date.now(),name:String(payload.name).trim(),qty:Math.max(1,Number(payload.qty)||1),status:'ENQUIRY'});break;
case'CREATE_LIST':{if(!state.draft.jobCard||!state.draft.lines.length)return{ok:false,code:'JOB_CARD_AND_PART_REQUIRED'};const r=p.lists.create(Object.assign({},state.draft,{lines:state.draft.lines}),payload.ctx||{});if(!r.ok)return r;state.lists.unshift(r.list);state.active=r.list.number;state.draft={lines:[]};state.screen='NEW';emit('PARTS_LIST_CREATED',{pl:r.list.number});break}
case'ORDER':{const x=findPL(payload.pl),line=x?.lines.find(y=>y.id===payload.id);if(!line)return{ok:false,code:'NOT_FOUND'};line.status='ORDERED';line.orderedAt=payload.at||new Date().toISOString();emit('PART_ORDERED',{pl:payload.pl,id:payload.id});break}
case'ARRIVED':{const x=findPL(payload.pl),i=x?.lines.findIndex(y=>y.id===payload.id);if(i<0)return{ok:false,code:'NOT_FOUND'};const r=p.quantity.arrive(x.lines[i],payload.qty||1,payload.ctx||{role:state.role});if(!r.ok)return r;x.lines[i]=r.item;emit('PART_ARRIVED',{pl:payload.pl,id:payload.id});break}
case'ACCEPT':{const x=findPL(payload.pl),i=x?.lines.findIndex(y=>y.id===payload.id);if(i<0)return{ok:false,code:'NOT_FOUND'};const r=p.quantity.accept(x.lines[i],payload.qty||1,payload.ctx||{role:state.role});if(!r.ok)return r;x.lines[i]=r.item;emit('PART_ACCEPTED',{pl:payload.pl,id:payload.id});break}
case'FINAL_PRICE':{const x=findPL(payload.pl),line=x?.lines.find(y=>y.id===payload.id),v=Number(payload.value);if(!line||!Number.isFinite(v)||v<0)return{ok:false,code:'INVALID_PRICE'};line.finalPriceOMR=p.money(v);line.finalPriceAt=payload.at||new Date().toISOString();emit('FINAL_PRICE_SAVED',{pl:payload.pl,id:payload.id,value:line.finalPriceOMR});break}
case'DELIVERED_PENDING':{const x=findPL(payload.pl);if(!x)return{ok:false,code:'NOT_FOUND'};x.deliveredPending=true;x.deliveredAt=payload.at||new Date().toISOString();x.view='DELIVERED_PENDING';emit('VEHICLE_DELIVERED_PENDING',{pl:payload.pl});break}
default:return{ok:false,code:'UNKNOWN_ACTION'}}
const x=state.active&&findPL(state.active);if(x&&p.completion){const applied=p.completion.apply(x);Object.assign(x,applied.list);if(!x.view)x.view=x.deliveredPending?'DELIVERED_PENDING':'WAITING'}return{ok:true,state:snapshot()}}
function snapshot(){return clone(state)}return{dispatch,snapshot,findPL}}
p.controller={createStore};
})();