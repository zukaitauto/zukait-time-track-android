import fs from 'node:fs';
import vm from 'node:vm';
export function loadCloud({state={users:[],jobs:[],assign:[],sessions:[]},transport,stored={},queue}={}){
 const storage=new Map(Object.entries(stored)),timers=new Map(),calls=[],status={style:{},dataset:{},textContent:'',className:''};let serial=0;
 const ctx={console:{warn(){},error(){}},Date,AbortController,CustomEvent:class{},KEY:'state',state:structuredClone(state),users:state.users||[],me:{id:'E1',role:'Employee'},navigator:{onLine:true},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
  document:{visibilityState:'visible',getElementById:()=>status,addEventListener(){}},
  setTimeout(fn,delay){timers.set(++serial,{fn,delay});return serial},clearTimeout:id=>timers.delete(id),render(){},
  fetch:async(url,opts)=>{const request=JSON.parse(opts.body);calls.push(request);const result=await transport(request,calls.length);return {status:result.status||200,json:async()=>result}}};
 ctx.window=ctx;ctx.zukaitAuth={getToken:()=> 'test-token'};ctx.addEventListener=()=>{};ctx.dispatchEvent=()=>{};
 if(queue)ctx.zukaitV2={queue};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8'),ctx);
 return {ctx,storage,timers,calls,status,async fire(delay){const entry=[...timers].find(([,v])=>v.delay===delay);if(!entry)throw Error('timer not found: '+delay);timers.delete(entry[0]);await entry[1].fn();await new Promise(resolve=>setImmediate(resolve))}};
}
export function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});return {promise,resolve,reject}}
