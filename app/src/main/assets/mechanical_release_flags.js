// V375 client availability. Server session, environment, SQL policy and scoped
// capabilities still authorize every read/write; these flags grant no access.
(function(){
 'use strict';
 for(const flag of ['ZUKAIT_MECHANICAL_ENABLED','ZUKAIT_MECHANICAL_QC_ENABLED','ZUKAIT_MECHANICAL_DELIVERY_ENABLED','ZUKAIT_MECHANICAL_DOCUMENTS_ENABLED','ZUKAIT_MECHANICAL_SIGNATURES_ENABLED','ZUKAIT_MECHANICAL_TRACKING_ENABLED','ZUKAIT_MECHANICAL_REPORTS_ENABLED'])window[flag]=true;
})();
