// Opt-in synthetic/QA instrumentation. Never retains headers, tokens or payloads.
// Counts UTF-8 JSON bodies, not compressed wire bytes, TLS or HTTP headers.
export function trafficMeter(fetchImpl){
  const actions={};
  return {
    actions,
    async fetch(url,options={}){
      const body=String(options.body||'');
      let action='unknown';try{action=JSON.parse(body).action||'unknown'}catch{}
      const row=actions[action]??={requests:0,requestBytes:0,responseBytes:0,failures:0};
      row.requests++;row.requestBytes+=Buffer.byteLength(body);
      try{
        const response=await fetchImpl(url,options);
        row.responseBytes+=Buffer.byteLength(await response.clone().text());
        if(!response.ok)row.failures++;
        return response;
      }catch(error){row.failures++;throw error}
    },
    totals(){return Object.values(actions).reduce((a,r)=>{
      for(const k of Object.keys(a))a[k]+=r[k];return a;
    },{requests:0,requestBytes:0,responseBytes:0,failures:0})}
  };
}
