(function(){
'use strict';const V2=window.zukaitV2=window.zukaitV2||{},p=V2.spareParts=V2.spareParts||{};
p.persistenceContract=Object.freeze({
standalone:true,productionConnected:false,authority:'SERVER_WHEN_INTEGRATED',
entities:Object.freeze(['parts_lists','parts_lines','parts_quotations','parts_events','parts_audit']),
idempotency:'event_id',
ordering:'server_timestamp_then_event_id',
offline:'QUEUE_MUTATIONS_REPLAY_IDEMPOTENTLY',
conflicts:'SERVER_AUTHORITY_WITH_MANAGER_AUDIT',
realtime:'SUBSCRIBE_BY_PARTS_LIST_AND_JOB_CARD',
pagination:Object.freeze({required:true,defaultLimit:50,maxLimit:200}),
search:Object.freeze(['jobCard','partsListNumber','registration','vehicleMake','vehicleModel','partName']),
integration:Object.freeze({jobCards:'READ_REFERENCE_ONLY_UNTIL_ENABLED',auth:'MAIN_APP_OWNS_USERS',costing:'NO_WRITE_UNTIL_ENABLED',notifications:'NO_PRODUCTION_PUSH_UNTIL_ENABLED'})
});
})();