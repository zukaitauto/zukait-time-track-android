(function(){
  'use strict';
  const DEFAULT_RECENT_LIMIT=100;
  const DEFAULT_HISTORY_LIMIT=100;
  function normalizeRows(value){
    if(Array.isArray(value))return value;
    if(Array.isArray(value?.rows))return value.rows;
    if(Array.isArray(value?.items))return value.items;
    return [];
  }
  function live(){
    const canonical=window.zukaitV2?.live?.rows;
    return typeof canonical==='function'?canonical():[];
  }
  function recent(options={}){
    const limit=Math.max(1,Math.min(Number(options.limit)||DEFAULT_RECENT_LIMIT,500));
    const source=normalizeRows(window.zukaitServerRecent);
    return source.slice(0,limit);
  }
  function history(options={}){
    const limit=Math.max(1,Math.min(Number(options.limit)||DEFAULT_HISTORY_LIMIT,500));
    const cursor=options.cursor==null?null:String(options.cursor);
    const source=window.zukaitServerHistory;
    if(source&&typeof source.page==='function')return source.page({cursor,limit,filters:options.filters||{}});
    return {rows:[],nextCursor:null,hasMore:false,source:'server-required'};
  }
  function assertDashboardSafe(){
    return {
      liveUsesCanonical:true,
      recentBounded:true,
      historyRequiresServerPagination:true,
      legacyHistoryFallback:false
    };
  }
  window.zukaitV2=Object.assign(window.zukaitV2||{},{
    dataPaths:{live,recent,history,assertDashboardSafe,limits:{recent:DEFAULT_RECENT_LIMIT,history:DEFAULT_HISTORY_LIMIT}}
  });
})();