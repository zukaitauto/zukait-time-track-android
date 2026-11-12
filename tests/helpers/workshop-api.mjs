import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
export const TEST_NOW=Date.parse('2026-10-08T10:00:00+04:00');
export const clone=x=>JSON.parse(JSON.stringify(x));
export function loadApi({state,role='Employee',id='E1',tables={},onRpc}={}){
  const calls=[];
  const rows={staff_sessions:{user_id:id,revoked_at:null},staff_credentials:{user_id:id,display_name:id,role,department:'Mechanic',active:true},workshop_state:{revision:4,data:state},...tables};
  const admin={
    from(table){
      const filters={};const query={select(){return query},eq(k,v){filters[k]=v;return query},update(){return query},
        async maybeSingle(){return {data:typeof rows[table]==='function'?rows[table](filters):rows[table]??null,error:null}},
        async single(){return query.maybeSingle()},then(resolve,reject){return query.maybeSingle().then(resolve,reject)}};
      return query;
    },
    async rpc(name,args){calls.push({name,args});return onRpc?onRpc(name,args):{data:{ok:true,revision:5},error:null}}
  };
  class Clock extends Date{constructor(...args){super(...(args.length?args:[TEST_NOW]))}static now(){return TEST_NOW}}
  const ctx={console:{error(){},warn(){}},Date:Clock,Request,Response,TextEncoder,crypto:webcrypto,createClient:()=>admin,
    Deno:{env:{get:k=>k==='SUPABASE_PUBLISHABLE_KEY'?'sb_publishable_test':undefined},serve:handler=>ctx.handle=handler}};
  vm.createContext(ctx);
  const src=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8').replace(/^import .*;\s*$/gm,'');
  vm.runInContext(stripTypeScriptTypes(src),ctx);
  vm.runInContext('this.helpers={validateEmployeeChange,validateRoleChange,threeWayMerge}',ctx);
  return {ctx,calls,helpers:ctx.helpers,async request(body){const response=await ctx.handle(new Request('http://local.test',{method:'POST',headers:{apikey:'sb_publishable_test','x-zukait-session':'test-only'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()}}};
}
export function fixture(){
  const start=TEST_NOW-3600000;
  return {users:[{id:'E1',role:'Employee'},{id:'E2',role:'Employee'},{id:'S1',role:'Supervisor'},{id:'M1',role:'Manager'}],
    jobs:[{no:'JC1',status:'Open',vehicle:'Test Car'}],assign:[{id:'a1',emp:'E1',job:'JC1',suggested:60,assignedAt:start-3600000,assignedBy:'S1',completed:false,rework:false}],
    sessions:[],requests:[],leaves:[],leaveAudit:[],leaveNotifications:[],offlineActionLog:[],lastActions:{},overtimeNotices:{},systemNotifications:[],notifications:[],workshopHolidays:[],
    consumables:{schemaVersion:1,materials:[],brands:[],prices:[],issues:[],actuals:[],audit:[]}};
}
