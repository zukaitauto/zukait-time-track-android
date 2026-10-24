// Allow the existing database statement deadline (about 8s) to finish before
// the HTTP guard expires. A 4s guard could abandon a still-running commit.
// Bound the response body too; never replay a write inside this transport.
export function createDatabaseFetch(fetchImpl=globalThis.fetch,timeoutMs=10000){
 return async function databaseFetch(input,init={}){
  const controller=new AbortController();let expired=false;
  const upstream=init.signal||(typeof Request!=='undefined'&&input instanceof Request?input.signal:null);
  const abort=()=>controller.abort(upstream?.reason);
  if(upstream?.aborted)abort();else upstream?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>{expired=true;controller.abort();},timeoutMs);
  try{
   const response=await fetchImpl(input,{...init,signal:controller.signal});
   const body=[204,205,304].includes(response.status)?null:await response.arrayBuffer();
   return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  }catch(error){
   if(expired)return new Response(JSON.stringify({code:'57014',message:'Database request deadline exceeded',details:null,hint:null}),{status:503,headers:{'Content-Type':'application/json','Retry-After':'5'}});
   throw error;
  }finally{clearTimeout(timer);upstream?.removeEventListener('abort',abort);}
 };
}
