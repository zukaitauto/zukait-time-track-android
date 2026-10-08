import fs from'node:fs';import assert from'node:assert/strict';import vm from'node:vm';
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const sql=fs.readFileSync('supabase/ARCHITECTURE_V2_REPORTING.sql','utf8');
const hist=fs.readFileSync('supabase/ARCHITECTURE_V2_BOUNDED_HISTORY.sql','utf8');
const main=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
const guard=fs.readFileSync('supabase/V215_SPARE_PART_ACTIVE_STATE_GUARD.sql','utf8');
const mainModule=main;
assert.match(api,/"SPARE_PARTS"/,'API must allow authoritative Spare Parts report');
assert.match(sql,/q\.report='SPARE_PARTS' and e\.event_type like 'SPARE_PART%'/,'SQL must project Spare Parts report');
assert.match(hist,/unique index if not exists workshop_v2_spare_part_lists_open_job_idx[\s\S]*where status <> 'CLOSED'/,'one open list per JC must be server enforced');
assert.match(hist,/exception when unique_violation[\s\S]*status<>'CLOSED'/,'concurrent allocation must return existing open list');
assert.match(main,/q\?\.enqueue\?\.\(event\)/,'transient Spare Parts events must queue offline');
assert.match(main,/function assignedToJob/);assert.match(main,/assignedToJob\(r\.jobCard,uid\)/,'Denter visibility must use canonical assignment rows');
assert.match(main,/async function hydrateAuthoritativeLists/);assert.match(main,/hydrateFromServerRows/,'module must hydrate cross-device server data');
assert.doesNotMatch(main,/\\\\nfunction canPurchase/,'Spare Parts main module must not contain literal escaped newlines between declarations');
assert.match(main,/function roleActionButton/,'role-specific recommended actions must render in Parts Lists');
assert.match(main,/serverRevision:nextRevision/,'status transitions must carry a deterministic revision');
assert.match(main,/const eventId=\['spare-status'/,'status event IDs must be deterministic for idempotency');
assert.match(api,/spare_list_create_forbidden/,'API must enforce list-create role authority');
assert.match(api,/spare_commercial_forbidden/,'API must enforce commercial role authority');
assert.match(api,/spare_transition_forbidden/,'API must enforce status-transition role authority');
const workflow=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/workflow.js','utf8');
const ctx={window:{zukaitV2:{}},console,Date,crypto:globalThis.crypto};
vm.createContext(ctx);
vm.runInContext(workflow,ctx);
const spare=ctx.window.zukaitV2.spareParts;
assert.match(workflow,/if\(to==='FITTED'\)return role==='Supervisor'\|\|role==='Manager'/,'Post-arrival fitting authority must remain Supervisor/Manager only');
assert.match(workflow,/if\(to==='SUPERVISOR_VERIFIED'\)return role==='Supervisor'\|\|role==='Manager'/,'Supervisor must retain physical-arrival verification authority');
assert.match(workflow,/if\(to==='CUSTOMER_SETTLEMENT'\)return role==='Supervisor'\|\|role==='Manager'/,'Purchaser must not have customer-settlement authority');
console.log('V2 Spare Parts hardening guard passed');
assert.match(main,/saveManagerItemEdit\(listNo,itemId\).*?if\(!\['Manager','Supervisor'\]\.includes\(role\(\)\)\)return;.*?await hydrateAuthoritativeLists\([^)]*\);const rows=read\(\),list=/s,'Audited correction save must allow Manager and Supervisor only and refresh server state before editing');
assert.match(main,/Correction reason is required\./,'Manager parts correction must require a reason');
assert.match(main,/SPARE_PART_MANAGER_CORRECTED/,'Manager correction must emit an auditable server event');assert.match(main,/SPARE_PART_SUPERVISOR_CORRECTED/,'Supervisor correction must emit a distinct auditable server event');
assert.match(main,/managerCorrectionAudit/,'Manager correction must retain before\/after audit history');
assert.ok(main.includes('option value="RECEIVED"')&&main.includes('>Arrived</option>'),'Manager correction must allow Arrived status');
assert.match(main,/Returned parts must use Cancel Return or Re-enquire/,'manual correction cannot bypass audited returned-part flow');
assert.match(main,/Cannot move a partially received part to verified\/confirmed\/fitted/,'manual correction cannot promote a partial receipt');
assert.match(main,/Supervisor verification is required before confirmation/,'manual correction preserves verification gate');
assert.match(main,/Supervisor confirmation is required before marking the part fitted/,'manual correction preserves fitting gate');
const apiSource=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(apiSource,/directReturnedRestore=beforeStatus==="RETURNED"&&afterStatus!=="RETURNED"/,'server blocks direct restoration of returned parts');
assert.match(apiSource,/incompletePromotion=promotesReceipt/,'server blocks promotion of incomplete receipts');
assert.match(apiSource,/missingVerification=afterStatus==="SUPERVISOR_CONFIRMED"/,'server enforces verification before confirmation');
assert.match(apiSource,/missingConfirmation=afterStatus==="FITTED"/,'server enforces confirmation before fitting');
assert.ok(main.includes('option value="FITTED"')&&main.includes('>Fitted</option>'),'Manager correction must allow Fitted status');

assert.ok(main.includes("['SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED'].includes(type)&&p.after"),'Manager and Supervisor correction events must hydrate authoritative state on every device');
assert.ok(main.includes("Object.assign(item,after);item.editRevision=Number(r.revision||0)"),'Manager correction hydration must apply after-state with revision protection');
assert.ok(main.includes("after.status==='RECEIVED'&&!item.receivedAt"),'Manager Arrived correction must restore arrival metadata during hydration');
assert.ok(main.includes("after.status==='FITTED'&&!item.fittedAt"),'Manager Fitted correction must restore fitted metadata during hydration');

assert.ok(main.includes("hydrateFromServerRows(rows);return {rows:reportRows()"),'Manager report must reduce server event history to current authoritative part state before totals');
assert.ok(!main.includes("rows.push(...r.rows.map(normalizeReportRow));source=r.source"),'Manager report must not count raw Spare Parts event rows as current part lines');

assert.match(main,/const PARTS_ATTENTION_DAYS=15/,'Purchaser Parts Attention threshold must remain 15 days');
assert.match(main,/attentionAgeDays\(item,list\)>PARTS_ATTENTION_DAYS/,'Purchaser warning must require more than 15 days');
assert.match(main,/Oldest items are shown first/,'Purchaser Parts Attention list must explain overdue ordering');

// Supervisor UI, client workflow, and server authority must agree on post-arrival transitions.
assert.equal(ctx.window.zukaitV2.spareParts.canAct('Supervisor','SUPERVISOR_VERIFIED','SUPERVISOR_CONFIRMED'),true,'Supervisor can confirm verified parts for fitting');
assert.equal(ctx.window.zukaitV2.spareParts.canAct('Supervisor','SUPERVISOR_CONFIRMED','FITTED'),true,'Supervisor can mark confirmed parts fitted');

const mainSource=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
assert.match(mainSource,/status==='RECEIVED'\)return Number\.isFinite\(qty\)&&qty>0&&Number\.isFinite\(received\)&&received>=qty/,'partial RECEIVED quantities must remain waiting');

assert.match(mainSource,/saveManagerItemEdit\(listNo,itemId\).*?if\(!navigator\.onLine\)return alert\('Connect to the server before correcting a Parts item\.'\);await hydrateAuthoritativeLists\([^)]*\)/s,'parts correction must refresh authoritative state first');
assert.match(mainSource,/item\.syncConflict\|\|pendingTransition\(item\).*?pending or conflicting update/s,'parts correction must block unresolved sync conflicts');

const returned=ctx.window.zukaitV2.spareParts.transition({id:'SP-RETURN',status:'RECEIVED',qty:2,receivedQty:1,receivedAt:'old',partialReceipt:true,arrivalAccepted:true,supervisorVerifiedAt:'old'},'RETURNED',{role:'Purchaser',actorId:'P1',reason:'Wrong part'});
assert.equal(returned.ok,true,'received part can be returned by Purchaser');
for(const key of ['receivedQty','receivedAt','partialReceipt','arrivalAccepted','supervisorVerifiedAt'])assert.equal(returned.item[key],undefined,'return clears stale '+key);

assert.match(mainSource,/receivedQty>0&&qty<receivedQty.*?Quantity cannot be lower than.*?already received/s,'correction cannot reduce ordered quantity below already received quantity');

assert.match(mainSource,/monthSpend=items\.reduce\(\(sum,i\)=>\{const amount=reportAmount\(i\);return amount>0&&omanMonthKey\(i\.purchaseRecordedAt\)===monthKey/,'monthly purchase spend must use final invoice recording date');
assert.doesNotMatch(mainSource,/monthSpend=items\.reduce\(\(sum,i\)=>\{const t=Date\.parse\(i\.updatedAt\|\|i\.receivedAt/,'monthly purchase spend must not move when status is later updated');

assert.match(mainSource,/function invoiceAmountEligible\(item\)\{return arrivedConfirmed\(item\)\}/,'invoice entry requires Supervisor-confirmed arrival');
assert.match(mainSource,/PURCHASE_COMPLETED'\)\{const active=items\.filter\([\s\S]*?active\.length>0&&active\.every\(arrivedConfirmed\)/,'purchase completed requires Supervisor-confirmed arrival');

assert.match(mainSource,/function isDeliveredVehiclePartPending\(item\).*?\['RECEIVED','SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED','CUSTOMER_SETTLEMENT'\]/s,'delivered pending ends when the part physically arrives');
assert.match(mainSource,/DELIVERED_PENDING'[\s\S]*?items\.some\(isDeliveredVehiclePartPending\)/,'delivered pending bucket uses physical-arrival pending rule');

assert.match(mainSource,/function attentionAgeDays\(item,list\)\{[\s\S]*?status==='RETURNED'\?\(item\?\.returnedAt/,'15-day purchaser attention restarts from return date');

assert.match(mainSource,/const NEW_PARTS_WORK_HOURS=27;/,'new parts retention is exactly three 9-hour workshop days');
assert.match(mainSource,/workPeriods:\[\[8,13\],\[15,19\]\],closedWeekdays:\[5\]/,'new parts workshop age excludes lunch and Friday');

assert.match(mainSource,/function sparePartsPublicHoliday\(ts\).*?zukaitV2\?\.rules\?\.publicHoliday/s,'parts retention reuses global public-holiday authority');
assert.match(mainSource,/!closed\.has\(day\)&&!sparePartsPublicHoliday\(t\)/,'new parts retention excludes configured public holidays');

assert.match(mainSource,/bucket==='NEW'\)return isNewPartsList\(r\)&&statuses\.some\(s=>\['LISTED','ENQUIRY','QUOTED'\]/,'New Parts bucket retains lists with enquiry-stage items');

assert.match(mainSource,/qtyLabel=received>0\?'Received '\+received\+'\/'\+ordered\+' · Pending '\+remaining/,'Parts Waiting shows received and remaining quantities for partial arrivals');

assert.match(mainSource,/state==='ORDERED'\|\|\(state==='RECEIVED'&&!arrived\).*?Receive Remaining/s,'partial arrival must keep a receive-remaining action for Purchaser');
assert.match(mainSource,/function arrivalPendingItems\(list\).*?status\|\|''\)==='RECEIVED'&&receiptComplete\(item\)/s,'partial receipts must not appear in Supervisor arrival confirmation');
assert.match(mainSource,/if\(!receiptComplete\(item\)\)return alert\('Receipt is incomplete\./,'Supervisor confirmation rechecks full received quantity');

for(const key of ['purchaseAmount','purchaseRecordedAt','purchaseAmountRevision','billAmount','supplierCost'])assert.equal(returned.item[key],undefined,'return clears stale expense '+key);
assert.match(mainSource,/if\(p\.to==='RETURNED'\).*?delete item\.purchaseAmount;delete item\.purchaseRecordedAt/s,'server replay clears returned part purchase expense');

const partialReturned=spare.transition({id:'SP-PARTIAL-RETURN',status:'RECEIVED',qty:4,receivedQty:2,receivedAt:'2026-10-08T08:00:00Z',lastReceivedQty:2,partialReceipt:true},'RETURNED',{role:'Purchaser',actorId:'P1',reason:'Partial batch rejected'});assert.equal(partialReturned.ok,true);assert.equal(partialReturned.item.qty,4,'line return keeps original required quantity');assert.equal(partialReturned.item.receivedQty,undefined,'returned partial receipt must not remain received');assert.equal(partialReturned.item.lastReceivedQty,undefined);assert.equal(partialReturned.item.partialReceipt,undefined);const partialReenquiry=spare.transition(partialReturned.item,'ENQUIRY',{role:'Purchaser',actorId:'P1'});assert.equal(partialReenquiry.ok,true);assert.equal(partialReenquiry.item.qty,4,'replacement cycle restarts for full original line quantity');assert.equal(partialReenquiry.item.receivedQty,undefined);assert.equal(partialReenquiry.item.preReturnSnapshot,undefined,'genuine replacement retires undo snapshot');
assert.equal(spare.allowed('RETURNED','ORDERED'),false,'returned parts cannot bypass fresh enquiry/quotation');
assert.equal(spare.allowed('RETURNED','ENQUIRY'),true,'returned parts restart at enquiry');
for(const key of ['quoteAmount','price','supplier','quotationOffers','commercialRevision'])assert.equal(returned.item[key],undefined,'return clears stale commercial state '+key);
assert.match(mainSource,/RETURNED:\['Re-enquire','ENQUIRY','info'\]/,'Purchaser UI restarts returned parts at enquiry');
assert.match(mainSource,/ACTIVE_REPLACEMENT_ALREADY_EXISTS/,'returned line cannot re-enter enquiry when an identical active replacement line already exists');
assert.match(mainSource,/i!==idx&&String\(x\?\.status\|\|''\)!=='RETURNED'&&partKey\(x\?\.name,x\?\.partNo\)===key/,'duplicate replacement guard uses normalized part identity and excludes returned history');

assert.match(mainSource,/const amount=validMoney\(raw\);if\(amount==null\|\|amount<=0\)return alert\('Final invoice price must be more than 0\.000 OMR\.'\)/,'all invoice save paths reject zero final amount');
assert.match(mainSource,/bucket==='PURCHASE_COMPLETED'.*?Number\(i\.purchaseAmount\)>0/s,'Purchase Completed requires positive final invoice amounts');

assert.match(mainSource,/function reportAmount\(item\)\{if\(String\(item\?\.status\|\|''\)\.toUpperCase\(\)==='RETURNED'\)return 0;const n=Number\(item\?\.purchaseAmount\);return Number\.isFinite\(n\)&&n>0\?n:0\}/,'parts reports use only positive final purchase amount, never quotation or supplier fallback');

const apiCorrection=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(apiCorrection,/allowedAfterKeys=new Set\(\["name","partNo","qty","supplier","purchaseAmount","finalPrice","purchaseRecordedAt","status"\]\)/,'Correction after payload must be field-allowlisted');
assert.match(apiCorrection,/allowedBeforeKeys=new Set/,'Correction audit before payload must be field-allowlisted');
assert.match(apiCorrection,/invalidAfterKey \|\| invalidBeforeKey \|\| invalidPurchaseAmount \|\| invalidQty \|\| invalidPurchaseDate/,'Correction API must reject injected fields and malformed values');

const workflowReturnedQty=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/workflow.js','utf8');
const mainReturnedQty=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
assert.match(workflowReturnedQty,/from==='RETURNED'&&to!=='RETURNED'[\s\S]*delete next\.returnedQty/,'Genuine re-enquiry must clear active returnedQty');
assert.match(workflowReturnedQty,/delete next\.returnedQty;delete next\.preReturnSnapshot/,'Cancel Return must clear active returnedQty');
assert.match(mainReturnedQty,/p\.from==='RETURNED'&&p\.to!=='RETURNED'[\s\S]*delete item\.returnedQty/,'Fresh-login re-enquiry hydration must clear returnedQty');
assert.match(mainReturnedQty,/SPARE_PART_RETURN_CANCELLED[\s\S]*delete item\.returnedQty;delete item\.preReturnSnapshot/,'Fresh-login Cancel Return hydration must clear returnedQty');

const apiCommercial=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(apiCommercial,/eventType==="SPARE_PART_COMMERCIAL_UPDATED"[\s\S]*allowedKeys=new Set\(\["partId","listNo","jobCard","supplier","quoteAmount","purchaseAmount","quotationOffers"\]\)/,'Commercial payload must be strictly allowlisted');
assert.match(apiCommercial,/offers\.length>3/,'Commercial payload must enforce the three-vendor quotation limit');
assert.match(apiCommercial,/\["supplier","amount","at"\]\.includes\(k\)/,'Each quotation offer must be field-allowlisted');
assert.match(apiCommercial,/invalidKey \|\| invalidMoney \|\| invalidOffers/,'Malformed or injected commercial payloads must be rejected');
assert.match(apiCommercial,/\["Manager","Purchaser"\]\.includes\(callerRole\)/,'Commercial workflow remains Manager/Purchaser only');

const apiItemEdit=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(apiItemEdit,/eventType==="SPARE_PART_ITEM_EDITED"[\s\S]*allowedPayloadKeys=new Set\(\["partId","listNo","jobCard","reason","before","after"\]\)/,'Generic item edit payload must be allowlisted');
assert.match(apiItemEdit,/allowedAfterKeys=new Set\(\["deletedAt","deletedBy"\]\)/,'Generic item edit after-state must be deletion-only');
assert.match(apiItemEdit,/invalidDeletedBy=String\(after\.deletedBy\|\|""\)!==String\(user\.id\)/,'Deletion actor must match authenticated user');
assert.match(apiItemEdit,/invalidDeletedAt=[\s\S]*Date\.parse/,'Deletion timestamp must be valid');
assert.match(apiItemEdit,/spare_item_edit_forbidden_or_invalid/,'Malformed generic item edits must be rejected');

const apiStatusPayload=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(apiStatusPayload,/eventType==="SPARE_PART_STATUS_CHANGED"[\s\S]*allowedKeys=new Set\(\["partId","listNo","jobCard","name","from","to","reason","receivedQty","lastReceivedQty","targetRole","preReturnSnapshot","returnedQty"\]\)/,'Status transition payload must be strictly allowlisted');
assert.match(apiStatusPayload,/invalidIdentity=!String\(p\.partId/,'Status transitions must carry authoritative item/list/job identity');
assert.match(apiStatusPayload,/\["receivedQty","lastReceivedQty","returnedQty"\]\.some/,'Status quantity fields must be validated');
assert.match(apiStatusPayload,/invalidTargetRole[\s\S]*"Supervisor"/,'Transition notification target must not be injectable');
assert.match(apiStatusPayload,/spare_transition_payload_invalid/,'Malformed status payloads must be rejected before commit');

const apiListed=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(apiListed,/eventType==="SPARE_PART_LISTED"[\s\S]*allowedKeys=new Set\(\["partId","listNo","jobCard","name","partNo","qty","targetRole"\]\)/,'New part payload must be strictly allowlisted');
assert.match(apiListed,/invalidQty=!Number\.isInteger\(qty\)\|\|qty<=0\|\|qty>100000/,'New part quantity must be a positive bounded integer');
assert.match(apiListed,/invalidTargetRole=String\(p\.targetRole\|\|""\)!=="Purchaser"/,'New parts must route only to Purchaser');
assert.match(apiListed,/spare_part_create_forbidden_or_invalid/,'Injected initial part state must be rejected');

const apiListCreated=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(apiListCreated,/eventType==="SPARE_PART_LIST_CREATED"[\s\S]*allowedKeys=new Set\(\["jobCard","partId","listNo","vehicle","registration","model","year","customer","targetRole"\]\)/,'Parts-list creation payload must be strictly allowlisted');
assert.match(apiListCreated,/String\(p\.partId\|\|""\)!==String\(p\.listNo\|\|""\)/,'Parent list entity identity must match its list number');
assert.match(apiListCreated,/invalidTargetRole=String\(p\.targetRole\|\|""\)!=="Purchaser"/,'Created lists must route only to Purchaser');
assert.match(apiListCreated,/invalidYear=[\s\S]*1900[\s\S]*2100/,'Optional vehicle year must be plausibly bounded');
assert.match(apiListCreated,/spare_list_create_forbidden_or_invalid/,'Injected parent list state must be rejected');

assert.match(main,/function spareConflictReason\(reason=''\)/,'Spare Parts must classify authoritative server conflicts');
for(const code of ['stale_spare_part_status','stale_spare_manager_correction','duplicate_active_spare_part']) assert.match(main,new RegExp(code),'Known 409 conflict '+code+' must have explicit recovery');
assert.match(main,/async function recoverSpareConflict\(reason,event\)[\s\S]*await hydrateAuthoritativeLists\([^)]*\)/,'Recognized conflicts must refresh authoritative Spare Parts state');
assert.match(main,/const conflictMessage=await recoverSpareConflict\(recoveryReason,event\)/,'Commit failure path must invoke Spare Parts conflict recovery');
assert.match(main,/if\(!synced\.conflictMessage\)\{list\.items\[idx\]=previous;write\(rows\)\}/,'Status transition must not overwrite freshly hydrated server state after a recognized conflict');

assert.match(main,/if\(!synced\.conflictMessage\)\{item\.quotationOffers=previous/,'Quotation add must not rollback over authoritative conflict refresh');
assert.match(main,/if\(!synced\.conflictMessage\)\{const rollback=read\(\),old=rollback\.find/,'Quotation selection/save must preserve refreshed conflict state');
assert.match(main,/if\(!synced\.conflictMessage\)\{for\(const k of \['name','partNo','qty','supplier','purchaseAmount','status'/,'Manager correction must preserve refreshed conflict state');
assert.match(main,/if\(!synced\.conflictMessage\)\{list\.items\[idx\]=before;write\(rows\)\}/,'Cancel Return must preserve refreshed conflict state');
assert.match(main,/if\(!result\.conflictMessage\)\{if\(previous==null\)delete item\.purchaseAmount/,'Final invoice save must preserve refreshed conflict state');

assert.match(main,/else if\(!result\.queued&&!result\.conflictMessage\)\{list\.items=list\.items\.filter/,'Additional Parts must not delete authoritative state after duplicate/conflict refresh');
assert.match(main,/done\.conflictMessage\|\|\('Could not confirm arrival:/,'Arrival acceptance must surface authoritative conflict recovery');
assert.match(main,/return \{ok:false,reason:synced\.conflictMessage\|\|'SYNC_FAILED',detail:synced\.reason\}/,'Non-optimistic Spare Parts writes must propagate authoritative conflict messages');
assert.match(main,/Could not save additional part:[^\n]*synced\.reason/,'Additional Parts ordinary failures must still be reported without claiming a failed item remains saved');

assert.match(api,/eventType==="SPARE_PART_FINAL_PRICE_RECORDED"[\s\S]*price<=0/,'Final Spare Parts invoice amount must be strictly positive at API boundary');
assert.match(api,/stale_spare_final_price/,'API must map stale final-price writes to a conflict');
assert.match(main,/stale_spare_final_price[\s\S]*final invoice amount was changed on another device/,'Client must refresh and explain final-price conflicts');
const stateGuardFinalPrice=fs.readFileSync('supabase/V215_SPARE_PART_ACTIVE_STATE_GUARD.sql','utf8');
assert.match(stateGuardFinalPrice,/new\.event_type='SPARE_PART_FINAL_PRICE_RECORDED'[\s\S]*e\.event_type='SPARE_PART_FINAL_PRICE_RECORDED'[\s\S]*coalesce\(e\.revision,0\)>=coalesce\(new\.revision,0\)[\s\S]*stale_spare_final_price/,'Database must reject stale or duplicate final-price revisions');

assert.match(api,/eventType==="SPARE_PART_FINAL_PRICE_RECORDED"[\s\S]*price<=0[\s\S]*price>1000000/,'Final Spare Parts invoice amount must be strictly positive and bounded');
assert.match(api,/SPARE_PART_FINAL_PRICE_RECORDED"[\s\S]*allowedKeys=new Set\(\["partId","listNo","jobCard","finalPrice","expectedPurchaseAmount"\]\)/,'Final invoice payload must be strictly allowlisted');
assert.match(api,/workshop_v2_spare_part_state"[\s\S]*invoiceEligibleStatuses=new Set\(\["SUPERVISOR_VERIFIED","DENTER_CHECKED","SUPERVISOR_CONFIRMED","FITTED"\]\)/,'Server must require authoritative confirmed-arrival state before final price');
assert.match(api,/spare_final_price_not_eligible/,'Final price must reject mismatched or ineligible part/list/JC state');
assert.match(stateGuardFinalPrice,/event_type='SPARE_PART_FINAL_PRICE_RECORDED'[\s\S]*coalesce\(e\.revision,0\)>=coalesce\(new\.revision,0\)[\s\S]*stale_spare_final_price/,'Database must reject stale/equal final-price revisions');

assert.match(apiListCreated,/eventType==="SPARE_PART_FINAL_PRICE_RECORDED"[\s\S]*allowedKeys=new Set\(\["partId","listNo","jobCard","finalPrice","expectedPurchaseAmount"\]\)[\s\S]*price<=0[\s\S]*price>1000000/,'Final Spare Parts invoice payload must be strictly allowlisted and positive');
assert.match(apiListCreated,/eventType==="SPARE_PART_FINAL_PRICE_RECORDED"[\s\S]*\["Manager","Supervisor"\]\.includes\(callerRole\)/,'Only Manager or Supervisor may record final Spare Parts invoice amounts');
assert.match(main,/stale_spare_final_price/,'Stale final invoice conflicts must refresh authoritative Spare Parts state');

assert.match(apiListCreated,/eventType==="SPARE_PART_FINAL_PRICE_RECORDED"[\s\S]*allowedKeys=new Set\(\["partId","listNo","jobCard","finalPrice","expectedPurchaseAmount"\]\)/,'Final invoice payload must remain strictly allowlisted');
assert.match(apiListCreated,/!Number\.isFinite\(price\) \|\| price<=0 \|\| price>1000000/,'Final invoice amount must remain strictly positive and bounded');
assert.match(apiListCreated,/invoiceEligibleStatuses=new Set\(\["SUPERVISOR_VERIFIED","DENTER_CHECKED","SUPERVISOR_CONFIRMED","FITTED"\]\)/,'Final invoice amount requires an eligible confirmed arrival state');
assert.match(apiListCreated,/stale_spare_final_price/,'API must map concurrent final-price revisions to conflict');
assert.match(main,/stale_spare_final_price[^\n]*final invoice amount was changed on another device/,'Client must refresh and explain concurrent final invoice conflicts');

assert.match(apiListCreated,/arrivalEligibleStatuses=new Set\(\["SUPERVISOR_VERIFIED","DENTER_CHECKED","SUPERVISOR_CONFIRMED","FITTED"\]\)/,'Arrival acceptance must require a verified authoritative part state');
assert.match(apiListCreated,/spare_arrival_acceptance_not_eligible/,'Crafted arrival acceptance must be rejected before eligible status');
assert.match(apiListCreated,/allowedTransitions=new Map\(\[/,'Spare Parts transition sequence must be enforced by the API');
assert.match(apiListCreated,/\["ORDERED",new Set\(\["RECEIVED","ENQUIRY","RETURNED","UNAVAILABLE"\]\)\]/,'Ordered parts cannot skip directly to supervisor confirmation');
assert.match(apiListCreated,/\["RECEIVED",new Set\(\["RECEIVED","ORDERED","SUPERVISOR_VERIFIED","RETURNED"\]\)\]/,'Received parts must pass Supervisor verification before confirmation');
assert.match(apiListCreated,/\["SUPERVISOR_VERIFIED",new Set\(\["SUPERVISOR_CONFIRMED","RETURNED"\]\)\]/,'Verified parts must pass confirmation before fitted');
assert.match(apiListCreated,/spare_transition_sequence_invalid/,'Invalid stage jumps must return a server conflict');

assert.match(guard,/ordered_qty numeric not null default 1/,'Authoritative Spare Parts state must track ordered quantity');
assert.match(guard,/received_qty numeric not null default 0/,'Authoritative Spare Parts state must track cumulative received quantity');
assert.match(guard,/upper\(st\)='SUPERVISOR_VERIFIED'[\s\S]*cur\.received_qty[\s\S]*cur\.ordered_qty[\s\S]*spare_receipt_incomplete/,'Supervisor verification must be blocked until the full ordered quantity is received');
assert.match(guard,/upper\(st\)='RECEIVED'[\s\S]*p->>'receivedQty'/,'Receipt projection must persist authoritative cumulative received quantity');
assert.match(apiListCreated,/spare_receipt_incomplete[^\n]*409/,'Incomplete receipt verification must surface as a conflict');

assert.match(guard,/insert into public\.workshop_v2_spare_part_state\(part_id,list_no,job_card,part_name,part_no,part_key,status,ordered_qty,received_qty,revision,last_event_id,updated_at\)/,'Historical rebuild must explicitly populate quantity projection columns');
assert.match(guard,/greatest\(1,coalesce\(nullif\(e\.payload->>'qty',''\)::numeric,1\)\) listed_qty/,'Historical ordered quantity must come from SPARE_PART_LISTED');
assert.match(guard,/latest_qty as \([\s\S]*SPARE_PART_MANAGER_CORRECTED[\s\S]*SPARE_PART_SUPERVISOR_CORRECTED/,'Historical quantity corrections must participate in rebuild');
assert.match(guard,/latest_receipt as \([\s\S]*event_type='SPARE_PART_STATUS_CHANGED'[\s\S]*'RECEIVED'[\s\S]*receivedQty/,'Historical cumulative receipts must participate in rebuild');
assert.match(guard,/end \$\$;/,'Migration DO block must use valid dollar quoting');

assert.match(guard,/afterv->>'qty'\)::numeric < coalesce\(cur\.received_qty,0\)[\s\S]*spare_quantity_below_received/,'Ordered quantity cannot be corrected below the physically received quantity');
assert.match(guard,/SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED'[\s\S]*afterv->>'qty'\)::numeric > coalesce\(cur\.received_qty,0\)[\s\S]*spare_verified_quantity_increase_requires_reopen/,'Verified parts cannot silently become incomplete through a quantity increase');
assert.match(apiListCreated,/spare_quantity_below_received[^\n]*409/,'Quantity-below-received correction must surface as conflict');
assert.match(apiListCreated,/spare_verified_quantity_increase_requires_reopen[^\n]*409/,'Verified quantity increase must surface as conflict');

assert.match(guard,/upper\(st\)='RETURNED'[\s\S]*returnedQty[\s\S]*least\(coalesce\(cur\.received_qty,0\),coalesce\(cur\.ordered_qty,1\)\)[\s\S]*spare_returned_quantity_mismatch/,'Returned quantity must equal authoritative physically received quantity');
assert.match(apiListCreated,/spare_returned_quantity_mismatch[^\n]*409/,'Returned quantity mismatch must surface as conflict');
assert.match(workflow,/physicallyReceived=Math\.max\(0,Math\.min\(Number\(item\.qty\)\|\|0,Number\(item\.receivedQty\)\|\|0\)\)/,'Client return must record only physically received quantity');
assert.match(workflow,/delete next\.purchaseAmount;delete next\.purchaseRecordedAt;delete next\.purchaseAmountRevision/,'Returned parts must clear active Purchase Expense fields');

assert.match(guard,/new\.event_type='SPARE_PART_RETURN_CANCELLED'[\s\S]*afterv->>'receivedQty'[\s\S]*spare_return_restore_quantity_invalid/,'Cancel Return must validate restored received quantity');
assert.match(guard,/new\.event_type='SPARE_PART_RETURN_CANCELLED' then least\([\s\S]*afterv->>'receivedQty'/,'Cancel Return must restore authoritative received quantity from the audited snapshot');
assert.match(apiListCreated,/spare_return_restore_quantity_invalid[^\n]*409/,'Invalid Cancel Return quantity restoration must surface as conflict');
assert.match(workflow,/Object\.assign\(\{\},item,snapshot/,'Cancel Return must restore the captured pre-return state rather than create a new purchase record');

assert.match(apiListCreated,/SPARE_PART_RETURN_CANCELLED[\s\S]*preReturnSnapshot[\s\S]*financialKeys=\["purchaseAmount","purchaseRecordedAt","purchaseAmountRevision"/,'Cancel Return must compare restored finances with immutable pre-return snapshot');
assert.match(apiListCreated,/financialKeys\.some\(k=>!same\(after\[k\],snap\[k\]\)\)[\s\S]*spare_return_cancel_financial_mismatch/,'Cancel Return must reject altered purchase amount/date history');
assert.match(mainModule,/type==='SPARE_PART_RETURN_CANCELLED'[\s\S]*Object\.assign\(item,p\.after\)[\s\S]*continue/,'Cancel Return hydration must restore snapshot values without assigning cancellation activity as purchase date');
assert.match(mainModule,/omanMonthKey\(i\.purchaseRecordedAt\)===monthKey/,'Monthly purchase expense must use purchase transaction date');

assert.match(guard,/new\.event_type='SPARE_PART_FINAL_PRICE_RECORDED'[\s\S]*cur\.status[\s\S]*SUPERVISOR_VERIFIED[\s\S]*FITTED[\s\S]*spare_final_price_not_eligible/,'Final invoice eligibility must be rechecked atomically in the database projection');
assert.match(apiListCreated,/spare_final_price_not_eligible[^\n]*409/,'Atomic final invoice eligibility rejection must surface as conflict');

assert.match(mainModule,/function reportAmount\(item\)\{if\(String\(item\?\.status\|\|''\)\.toUpperCase\(\)==='RETURNED'\)return 0/,'Returned parts must contribute zero active purchase expense even if a stale amount remains locally');
assert.match(mainModule,/monthSpend=items\.reduce\(\(sum,i\)=>\{const amount=reportAmount\(i\)/,'Manager monthly purchase total must use return-aware report amount');
assert.match(mainModule,/if\(p\.to==='RETURNED'\)[\s\S]*delete item\.purchaseAmount;delete item\.purchaseRecordedAt;delete item\.purchaseAmountRevision/,'Later Return hydration must clear a previously committed invoice from current state');

assert.match(mainModule,/if\(bucket==='PURCHASE_COMPLETED'\)\{const active=items\.filter\(i=>String\(i\.status\|\|''\)\.toUpperCase\(\)!=='RETURNED'\);return active\.length>0&&active\.every\(arrivedConfirmed\)&&active\.every/,'Purchase Completed must evaluate active replacement lines while retaining returned history');

assert.match(mainModule,/if\(bucket==='WAITING'\)\{const active=items\.filter\(i=>String\(i\.status\|\|''\)\.toUpperCase\(\)!=='RETURNED'\);return active\.length>0&&!active\.every\(partFullyArrived\)\}/,'Waiting must follow active replacement lines, not returned history');
assert.match(mainModule,/function isPartPending\(item\)\{const status=String\(item\?\.status\|\|'LISTED'\)\.toUpperCase\(\);return !!item&&status!=='RETURNED'&&/,'Returned history must not inflate Parts Pending');
assert.match(mainModule,/if\(bucket==='ATTENTION'\)return items\.some\(i=>\['RETURNED','UNAVAILABLE'\]\.includes\(i\.status\)/,'Returned history must remain visible in Attention');

assert.match(mainModule,/function isDeliveredVehiclePartPending\(item\)\{const status=String\(item\?\.status\|\|'LISTED'\)\.toUpperCase\(\);return !!item&&status!=='RETURNED'&&/,'Returned history must not keep a delivered vehicle in Pending Parts');
assert.match(mainModule,/if\(bucket==='DELIVERED_PENDING'\)[\s\S]*items\.some\(isDeliveredVehiclePartPending\)/,'Delivered Pending must be driven by active unresolved parts');

assert.match(mainModule,/function attentionAgeDays\(item,list\)\{const status=.*status==='RETURNED'\?\(item\?\.returnedAt\|\|item\?\.updatedAt/,'Returned attention age must start from the return/update event, not the original purchase age');
assert.match(mainModule,/function pendingSince\(item,list\)\{return item\?\.reEnquiredAt\|\|item\?\.createdAt\|\|item\?\.created_at\|\|list\?\.createdAt/,'Active pending age must use the active part creation lifecycle and never inherit returnedAt');

assert.match(workflow,/from==='RETURNED'&&to!=='RETURNED'[\s\S]*to==='ENQUIRY'\)next\.reEnquiredAt=now/,'Re-enquiry must start a fresh operational aging lifecycle');
assert.match(mainModule,/function pendingSince\(item,list\)\{return item\?\.reEnquiredAt\|\|item\?\.createdAt/,'Pending age must prefer re-enquiry time over original creation time');
assert.match(mainModule,/p\.from==='RETURNED'&&p\.to!=='RETURNED'[\s\S]*p\.to==='ENQUIRY'\)item\.reEnquiredAt=r\.activityAt/,'Server hydration must reproduce the re-enquiry age reset');
assert.match(mainModule,/ACTIVE_REPLACEMENT_ALREADY_EXISTS/,'Client must block re-enquiry when an active replacement already exists');
assert.match(guard,/duplicate_active_spare_part/,'Database must retain authoritative duplicate-active protection');

assert.match(workflow,/if\(to==='RETURNED'\)[\s\S]*next\.preReturnSnapshot=snapshot/,'Every return cycle must replace the current pre-return snapshot');
assert.match(workflow,/from==='RETURNED'&&to!=='RETURNED'[\s\S]*delete next\.preReturnSnapshot/,'Re-enquiry must retire the prior return snapshot before a new purchasing cycle');
assert.match(apiListCreated,/latestStatusEvent[\s\S]*String\(latestStatusPayload\.to\|\|""\)!=="RETURNED"[\s\S]*spare_return_cancel_cycle_mismatch/,'Cancel Return must bind to the immediately current return cycle');
assert.match(apiListCreated,/latestStatusPayload\.preReturnSnapshot/,'Cancel Return must restore the current cycle snapshot rather than searching an older returned event');

assert.match(mainModule,/function arrivedConfirmed\(item\)\{return \['SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED'\]\.includes/,'Restored confirmed/fitted states must remain completion-eligible');
assert.match(mainModule,/type==='SPARE_PART_RETURN_CANCELLED'[\s\S]*Object\.assign\(item,p\.after\)[\s\S]*delete item\.preReturnSnapshot/,'Cancel Return hydration must restore the complete audited status and invoice snapshot');
assert.match(mainModule,/if\(bucket==='PURCHASE_COMPLETED'\)\{const active=items\.filter[\s\S]*active\.every\(arrivedConfirmed\)&&active\.every\(i=>Number\.isFinite\(Number\(i\.purchaseAmount\)\)&&Number\(i\.purchaseAmount\)>0\)/,'Purchase Completed must immediately accept a restored confirmed/fitted part with its positive final amount');

assert.match(mainModule,/function invoiceAmountEligible\(item\)\{return arrivedConfirmed\(item\)\}/,'Invoice Entry must only consider confirmed/checked/fitted active states');
assert.match(mainModule,/function invoicePriceMissing\(item\)\{const n=Number\(item\?\.purchaseAmount\);return item\?\.purchaseAmount==null\|\|!Number\.isFinite\(n\)\|\|n<=0\}/,'Invoice Entry must disappear as soon as a positive final amount exists');
assert.doesNotMatch(mainModule,/function arrivedConfirmed\(item\)[^\n]*RETURNED/,'Returned parts must never be invoice-entry eligible');
assert.doesNotMatch(mainModule,/function arrivedConfirmed\(item\)[^\n]*ENQUIRY/,'Re-enquired parts must not enter Invoice Entry before the arrival/confirmation flow is completed');
assert.match(mainModule,/type==='SPARE_PART_RETURN_CANCELLED'[\s\S]*Object\.assign\(item,p\.after\)/,'Cancel Return must restore the prior positive invoice amount before Invoice Entry is calculated');

assert.match(mainModule,/type==='SPARE_PART_RETURN_CANCELLED'[\s\S]*delete item\.returnedAt;delete item\.returnedBy;delete item\.returnReason;delete item\.returnedQty;delete item\.preReturnSnapshot/,'Cancel Return hydration must remove stale return/problem metadata');
assert.match(mainModule,/openProblemParts\(\)[\s\S]*\['RETURNED','UNAVAILABLE'\]\.includes\(String\(item\.status\|\|''\)\)\|\|item\.cashSettlementRequired/,'Returned/Problem must be driven by current problem status, not historical return metadata');
assert.match(mainModule,/userRole==='Manager'[\s\S]*\['RECEIVED','SUPERVISOR_VERIFIED','DENTER_CHECKED','RETURNED','UNAVAILABLE'\]\.includes\(x\.item\.status\)/,'Manager Attention must use current restored status after Cancel Return');
assert.match(mainModule,/userRole==='Purchaser'[\s\S]*purchaserAttentionItem/,'Purchaser Attention must recalculate from current item state after Cancel Return');

assert.match(mainModule,/function arrivalPendingItems\(list\)\{return \(list\?\.items\|\|\[\]\)\.filter\(item=>String\(item\?\.status\|\|''\)==='RECEIVED'&&receiptComplete\(item\)\)\}/,'Arrival confirmation queue must contain only fully received items whose current status is exactly RECEIVED');
assert.match(mainModule,/function arrivalPendingCount\(rows=read\(\)\)\{return \(rows\|\|\[\]\)\.reduce\(\(n,list\)=>n\+arrivalPendingItems\(list\)\.length,0\)\}/,'Arrival dashboard count must use the same strict queue selector');
assert.match(mainModule,/type==='SPARE_PART_RETURN_CANCELLED'[\s\S]*Object\.assign\(item,p\.after\)/,'Cancel Return must restore the audited pre-return status before arrival queues are recalculated');
assert.match(mainModule,/function partFullyArrived\(item\)[\s\S]*\['SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED'\]\.includes\(status\)/,'Restored verified/confirmed/fitted parts must remain classified as fully arrived');

assert.match(workflow,/\['status','receivedQty','receivedAt','receivedBy','lastReceivedQty','partialReceipt'/,'Return snapshot must preserve partial-receipt quantity and marker');
assert.match(workflow,/function cancelReturn\(item,ctx=\{\}\)[\s\S]*Object\.assign\(\{\},item,snapshot/,'Cancel Return must restore the exact partial-receipt snapshot');
assert.match(mainModule,/function receiptComplete\(item\)[\s\S]*received>=qty/,'Supervisor arrival confirmation must require the complete ordered quantity');
assert.match(mainModule,/state==='RECEIVED'\?'Receive Remaining':'Arrived'/,'A restored partial receipt must return to the Receive Remaining purchaser action');
assert.match(guard,/new\.event_type='SPARE_PART_RETURN_CANCELLED'[\s\S]*afterv->>'receivedQty'/,'Database projection must restore received quantity from the Cancel Return snapshot');
assert.match(guard,/spare_return_restore_quantity_invalid/,'Database must reject an impossible restored received quantity');

assert.match(workflow,/if\(to==='RETURNED'\)[\s\S]*delete next\.receivedQty;delete next\.receivedAt;delete next\.receivedBy;delete next\.lastReceivedQty;delete next\.partialReceipt/,'Return must clear active partial-receipt state before a replacement cycle');
assert.match(workflow,/from==='RETURNED'&&to!=='RETURNED'[\s\S]*to==='ENQUIRY'\)next\.reEnquiredAt=now/,'Re-enquiry must start a fresh replacement lifecycle');
assert.match(guard,/upper\(st\) in \('LISTED','ENQUIRY','QUOTED','ORDERED','RETURNED','UNAVAILABLE','CUSTOMER_SETTLEMENT'\) then 0 else received_qty end/,'Database projection must force zero received quantity throughout pre-receipt replacement states');
assert.match(mainModule,/if\(p\.to==='RETURNED'\)[\s\S]*delete item\.receivedQty;delete item\.receivedAt;delete item\.lastReceivedQty;delete item\.partialReceipt/,'Fresh hydration must not carry a returned partial quantity into re-enquiry');

{
 const batch1=spare.transition({id:'SP-BATCH',status:'ORDERED',qty:4},'RECEIVED',{role:'Purchaser',actorId:'P1',receivedQty:1});
 assert.equal(batch1.ok,true);assert.equal(batch1.item.receivedQty,1);assert.equal(batch1.item.partialReceipt,true);
 const batch2=spare.transition(batch1.item,'RECEIVED',{role:'Purchaser',actorId:'P1',receivedQty:2});
 assert.equal(batch2.ok,true);assert.equal(batch2.item.receivedQty,3);assert.equal(batch2.item.partialReceipt,true);
 const over=spare.transition(batch2.item,'RECEIVED',{role:'Purchaser',actorId:'P1',receivedQty:2});
 assert.equal(over.ok,false);assert.equal(over.reason,'INVALID_RECEIVED_QUANTITY');assert.equal(over.receivedQty,3);
 const batch3=spare.transition(batch2.item,'RECEIVED',{role:'Purchaser',actorId:'P1',receivedQty:1});
 assert.equal(batch3.ok,true);assert.equal(batch3.item.receivedQty,4);assert.equal(batch3.item.partialReceipt,undefined);
 const verified=spare.transition(batch3.item,'SUPERVISOR_VERIFIED',{role:'Supervisor',actorId:'S1'});
 assert.equal(verified.ok,true,'Supervisor verification becomes valid only after cumulative 4/4 receipt');
}
assert.match(guard,/upper\(st\)='RECEIVED'[\s\S]*receivedQty[\s\S]*cur\.ordered_qty[\s\S]*spare_received_quantity_exceeds_ordered/,'Server must reject cumulative received quantity above ordered quantity');

assert.match(mainModule,/if\(!item\|\|item\.syncConflict\|\|pendingTransition\(item\)\)return;[\s\S]*if\(to==='RECEIVED'\)/,'Purchaser receipt action must refuse a second local submission while the first transition is pending');
assert.match(mainModule,/moved\.item\.revision=nextRevision[\s\S]*list\.items\[idx\]=moved\.item;[\s\S]*commitEvent/,'Receipt transition must mark the new revision locally before awaiting network commit');
assert.match(guard,/new\.event_type='SPARE_PART_STATUS_CHANGED'[\s\S]*new\.revision,0\)<=coalesce\(cur\.revision,0\)[\s\S]*stale_spare_part_status/,'Database must reject duplicate or stale status revisions, including concurrent receipt taps from separate devices');

assert.match(mainModule,/function spareConflictReason\(reason=''\)[\s\S]*stale_spare_part_status[\s\S]*Latest Parts data has been refreshed/,'Stale receipt/status conflicts must be classified as recoverable authoritative refreshes');
assert.match(mainModule,/async function recoverSpareConflict\(reason,event\)[\s\S]*await hydrateAuthoritativeLists\([^)]*\)[\s\S]*return message/,'Recognized Spare Parts conflicts must hydrate authoritative server state before returning control');
assert.match(mainModule,/if\(!synced\.ok&&!synced\.queued\)\{if\(!synced\.conflictMessage\)\{list\.items\[idx\]=previous;write\(rows\)\}/,'A recognized stale receipt conflict must not roll the refreshed authoritative item back to the losing local snapshot');

const offlineQueue=fs.readFileSync('app/src/main/assets/v2/core/offline_queue.js','utf8');
const workshopApi=api;
const cloudSync=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
assert.match(cloudSync,/let synced=0,spareConflict=false/,'Offline queue flush must track Spare Parts conflicts separately');
assert.match(cloudSync,/startsWith\('SPARE_PART_'\)\)spareConflict=true/,'Rejected queued Spare Parts events must request authoritative reconciliation');
assert.match(cloudSync,/if\(spareConflict\)[\s\S]*sparePartsMain\?\.hydrateAuthoritativeLists\?\.\(\)/,'Reconnect after a rejected offline Spare Parts event must refresh authoritative server state');

assert.match(mainModule,/function reconcileSyncMarkers[\s\S]*state==='conflict'\)\{delete item\.pendingSync;delete item\.pendingEventId;delete item\.syncConflict;changed=true\}/,'A quarantined Spare Parts event must release its stale local pending markers before authoritative hydration');
assert.match(offlineQueue,/function pending\(\)\{return read\(\)\.filter\(x=>x\.syncState!=='synced'&&x\.syncState!=='conflict'&&x\.syncState!=='superseded'\)\}/,'Quarantined conflict events must never be retried by the offline queue');

assert.match(mainModule,/function pendingTransition\(item\)\{return !!\(item\?\.pendingSync&&item\?\.pendingEventId\)\}/,'A queued offline Spare Parts transition must remain an explicit per-item lock');
assert.match(mainModule,/async function transitionItem[\s\S]*if\(pendingTransition\(list\.items\[idx\]\)\)return \{ok:false,reason:'PENDING_SYNC'\}/,'A second status or receipt transition must be rejected while the first offline event is queued');
assert.match(mainModule,/if\(synced\.queued\)\{list\.items\[idx\]\.pendingSync=true;list\.items\[idx\]\.pendingEventId=eventId;write\(rows\)\}/,'The first offline receipt must persist its event lock before another action can be attempted');
assert.match(mainModule,/async function purchaserAdvance[\s\S]*if\(!item\|\|item\.syncConflict\|\|pendingTransition\(item\)\)return/,'Purchaser Receive Remaining must not create a chained offline receipt behind an unacknowledged receipt');

assert.match(mainModule,/const KEY='zukait_v2_spare_parts_lists_v1'/,'Spare Parts live cache must use persistent storage across app restart');
assert.match(mainModule,/function write\(v\)[\s\S]*localStorage\.setItem\(KEY,JSON\.stringify\(rows\)\)/,'Pending Spare Parts markers must persist with the cached item across restart');
assert.match(offlineQueue,/const KEY='zukait_v2_event_queue_v1'/,'Offline event queue must use persistent storage across app restart');
assert.match(offlineQueue,/function write\(rows\)\{localStorage\.setItem\(KEY,JSON\.stringify\(rows\|\|\[\]\)\)/,'Queued receipt event must persist across restart');
assert.match(mainModule,/if\(synced\.queued\)\{list\.items\[idx\]\.pendingSync=true;list\.items\[idx\]\.pendingEventId=eventId;write\(rows\)\}/,'Offline receipt must persist the exact queued event id on its part before app shutdown');
assert.match(mainModule,/function reconcileSyncMarkers[\s\S]*queueState\(item\.pendingEventId\)/,'After restart Spare Parts must reconcile the persisted part lock against the persisted queue event');

assert.match(workshopApi,/if \(event\.actorId && String\(event\.actorId\) !== String\(user\.id\)\) return reply\(\{ok:false,code:"actor_mismatch"\},403\)/,'Queued V2 events must never commit under a different authenticated user');
assert.match(cloudSync,/if\(code==='NETWORK'\|\|code==='TIMEOUT'\|\|code==='NO_SESSION'\)[\s\S]*q\.markConflict\?\.\(event\.eventId,code\)/,'Permanent ownership/auth rejections such as actor_mismatch must be quarantined rather than retried');
assert.match(cloudSync,/q\.markConflict\?\.\(event\.eventId,code\);if\(String\(event\?\.type\|\|'\'\)\.startsWith\('SPARE_PART_'\)\)spareConflict=true/,'A quarantined queued Spare Parts event from another user must trigger authoritative Parts reconciliation');

assert.match(mainModule,/if\(r==='Supervisor'&&s==='RECEIVED'\)return receiptComplete\(item\)\?'<button[\s\S]*Partial receipt/,'Supervisor Waiting view must not offer confirmation until the full ordered quantity is received');
assert.match(mainModule,/function arrivalPendingItems\(list\)\{return \(list\?\.items\|\|\[\]\)\.filter\(item=>String\(item\?\.status\|\|'\'\)==='RECEIVED'&&receiptComplete\(item\)\)\}/,'Arrival confirmation queue must contain only complete RECEIVED quantities');
assert.match(guard,/select \* into cur from public\.workshop_v2_spare_part_state where part_id=pid for update/,'Receipt and Supervisor confirmation races must serialize on the authoritative part row');
assert.match(guard,/upper\(st\)='SUPERVISOR_VERIFIED'[\s\S]*cur\.received_qty[\s\S]*cur\.ordered_qty[\s\S]*spare_receipt_incomplete/,'Database must reject Supervisor verification unless the locked authoritative receipt quantity is complete');

{
 const full={id:'SP-RACE-VERIFY',status:'RECEIVED',qty:4,receivedQty:4,revision:7};
 const verified=spare.transition(full,'SUPERVISOR_VERIFIED',{role:'Supervisor',actorId:'S1'});
 assert.equal(verified.ok,true);
 const purchaserReturnAfterVerify=spare.transition(verified.item,'RETURNED',{role:'Purchaser',actorId:'P1',reason:'Race return'});
 assert.equal(purchaserReturnAfterVerify.ok,false,'Purchaser must not return a part after Supervisor verification wins the race');
 const managerReturnAfterVerify=spare.transition(verified.item,'RETURNED',{role:'Manager',actorId:'M1',reason:'Approved return'});
 assert.equal(managerReturnAfterVerify.ok,true,'Manager retains controlled return authority after verification');
 const reopened=spare.transition(full,'ORDERED',{role:'Purchaser',actorId:'P1'});
 assert.equal(reopened.ok,true);
 const staleVerify=spare.transition(reopened.item,'SUPERVISOR_VERIFIED',{role:'Supervisor',actorId:'S1'});
 assert.equal(staleVerify.ok,false,'Supervisor cannot verify after RECEIVED was reopened to ORDERED');
}
assert.match(guard,/new\.revision,0\)<=coalesce\(cur\.revision,0\)[\s\S]*stale_spare_part_status/,'Only one same-revision competing Spare Parts status transition may win');
assert.match(guard,/upper\(trim\(coalesce\(p->>'from',''\)\)\)<>upper\(trim\(coalesce\(cur\.status,''\)\)\)[\s\S]*stale_spare_part_status/,'A losing return, reopen, or Supervisor verification must be rejected when authoritative status already changed');

{
 const received={id:'SP-VERIFIED-RETURN',status:'RECEIVED',qty:4,receivedQty:4,receivedAt:'2026-10-08T06:00:00.000Z',receivedBy:'P1',lastReceivedQty:1,revision:20};
 const verified=spare.transition(received,'SUPERVISOR_VERIFIED',{role:'Supervisor',actorId:'S1',serverTime:'2026-10-08T06:05:00.000Z'});
 assert.equal(verified.ok,true);
 const returned=spare.transition(verified.item,'RETURNED',{role:'Manager',actorId:'M1',reason:'Wrong part',serverTime:'2026-10-08T06:10:00.000Z'});
 assert.equal(returned.ok,true);
 assert.equal(returned.item.preReturnSnapshot.status,'SUPERVISOR_VERIFIED');
 assert.equal(returned.item.preReturnSnapshot.receivedQty,4);
 assert.equal(returned.item.preReturnSnapshot.supervisorVerifiedAt,'2026-10-08T06:05:00.000Z');
 assert.equal(returned.item.receivedQty,undefined);
 assert.equal(returned.item.supervisorVerifiedAt,undefined);
 assert.equal(spare.cancelReturn(returned.item,{role:'Purchaser',actorId:'P1',reason:'Undo'}).ok,false,'Purchaser must never cancel a Manager return');
 const restored=spare.cancelReturn(returned.item,{role:'Manager',actorId:'M1',reason:'Return cancelled',serverTime:'2026-10-08T06:15:00.000Z'});
 assert.equal(restored.ok,true);
 assert.equal(restored.item.status,'SUPERVISOR_VERIFIED');
 assert.equal(restored.item.receivedQty,4);
 assert.equal(restored.item.supervisorVerifiedAt,'2026-10-08T06:05:00.000Z');
 assert.equal(restored.item.preReturnSnapshot,undefined);
}
assert.match(mainModule,/function arrivalPendingItems\(list\)[\s\S]*status\|\|'\'\)==='RECEIVED'&&receiptComplete\(item\)/,'Cancel Return restoring SUPERVISOR_VERIFIED must not duplicate the Supervisor arrival-confirmation queue');
assert.match(mainModule,/if\(!\['SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED'\]\.includes\(String\(item\.status\|\|'\'\)\)\)return alert\('Wait for Supervisor verification before final arrival confirmation\.'/,'Restored verified parts remain eligible only for the post-verification Purchaser acceptance step');

{
 const accepted={id:'SP-ACCEPT-RETURN',status:'SUPERVISOR_VERIFIED',qty:2,receivedQty:2,arrivalAccepted:true,arrivalAcceptedAt:'2026-10-08T07:00:00.000Z',supervisorVerifiedAt:'2026-10-08T06:55:00.000Z'};
 const returned=spare.transition(accepted,'RETURNED',{role:'Manager',actorId:'M1',reason:'Return entered by mistake'});
 assert.equal(returned.ok,true);
 assert.equal(returned.item.arrivalAccepted,undefined,'Active acceptance must be cleared while the part is returned');
 assert.equal(returned.item.preReturnSnapshot.arrivalAccepted,true,'Cancel Return snapshot must retain the pre-return acceptance');
 const cancelled=spare.cancelReturn(returned.item,{role:'Manager',actorId:'M1',reason:'Undo mistaken return'});
 assert.equal(cancelled.ok,true);
 assert.equal(cancelled.item.status,'SUPERVISOR_VERIFIED');
 assert.equal(cancelled.item.arrivalAccepted,true,'Cancelling a mistaken return must restore the already completed physical acceptance');
 assert.equal(cancelled.item.arrivalAcceptedAt,'2026-10-08T07:00:00.000Z');
 const replacement=spare.transition(returned.item,'ENQUIRY',{role:'Purchaser',actorId:'P1'});
 assert.equal(replacement.ok,true);
 assert.equal(replacement.item.arrivalAccepted,undefined,'A genuine re-enquiry/replacement cycle must not inherit acceptance from the returned part');
 assert.equal(replacement.item.preReturnSnapshot,undefined,'A genuine replacement cycle must discard the old return snapshot');
}
assert.match(mainModule,/function purchaserTabFor\(item\)[\s\S]*!item\.arrivalAccepted/,'Restored accepted parts must remain in Purchaser history instead of asking for duplicate final acceptance');

assert.match(mainModule,/const eventId='spare-arrival-accepted-'\+itemId/,'Final arrival acceptance must use one deterministic event id per part');
assert.match(mainModule,/if\(done\.reason==='event_id_conflict'\)\{await hydrateAuthoritativeLists\([^)]*\);[\s\S]*authoritative\?\.arrivalAccepted[\s\S]*return openList\(listNo\)/,'A second-device final acceptance collision must reconcile the already-recorded acceptance instead of surfacing a false failure');
assert.match(workshopApi,/eventType==="SPARE_PART_ARRIVAL_ACCEPTED"[\s\S]*arrivalEligibleStatuses[\s\S]*spare_arrival_acceptance_not_eligible/,'Server must independently validate final arrival acceptance against authoritative verified status');

assert.match(guard,/select \* into cur from public\.workshop_v2_spare_part_state where part_id=pid for update[\s\S]*new\.event_type='SPARE_PART_ARRIVAL_ACCEPTED'[\s\S]*spare_arrival_acceptance_not_eligible/,'Final arrival acceptance must be validated under the same authoritative part-row lock used by Manager Return');
assert.match(guard,/new\.event_type='SPARE_PART_ARRIVAL_ACCEPTED'[\s\S]*SUPERVISOR_VERIFIED[\s\S]*DENTER_CHECKED[\s\S]*SUPERVISOR_CONFIRMED[\s\S]*FITTED/,'Arrival acceptance must fail at commit time after a simultaneous Return changes the locked status');
assert.match(workshopApi,/message\.includes\("spare_arrival_acceptance_not_eligible"\)[\s\S]*409/,'Acceptance-versus-Return race rejection must be exposed as a recoverable 409 conflict');

assert.match(guard,/select \* into cur from public\.workshop_v2_spare_part_state where part_id=pid for update[\s\S]*new\.event_type='SPARE_PART_FINAL_PRICE_RECORDED'[\s\S]*spare_final_price_not_eligible/,'Final invoice amount must be validated under the same authoritative row lock used by Manager Return');
assert.match(workshopApi,/message\.includes\("spare_final_price_not_eligible"\)[\s\S]*409/,'Final-price-versus-Return race must return a recoverable 409 conflict');
assert.match(mainModule,/spare_final_price_not_eligible[\s\S]*Latest Parts data has been refreshed/,'A phone losing the invoice-versus-Return race must refresh authoritative Spare Parts state');

// Execute the losing invoice writer; conflict recovery must survive its rollback path.
{
 const key='zukait_v2_spare_parts_lists_v1',store=new Map(),alerts=[];
 const before=[{listNo:'PL-RACE',jobCard:'12029',items:[{id:'SP-INVOICE-RACE',name:'Bumper',qty:1,receivedQty:1,status:'SUPERVISOR_VERIFIED',purchaseAmount:10,purchaseAmountRevision:1}]}];
 const returned=[{listNo:'PL-RACE',jobCard:'12029',items:[{id:'SP-INVOICE-RACE',name:'Bumper',qty:1,status:'RETURNED',revision:3}]}];
 store.set(key,JSON.stringify(before));
 const race={window:{me:{id:'S1',role:'Supervisor'},confirm:()=>true,zukaitV2:{},zukaitCloud:{v2CommitEvent:async()=>{throw {code:'spare_final_price_not_eligible'}}}},navigator:{onLine:true},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},alert:m=>alerts.push(m),console,Date,crypto:globalThis.crypto};
 vm.createContext(race);
 const injected=main.replace(/\}\)\(\);\s*$/,"hydrateAuthoritativeLists=async function(){write("+JSON.stringify(returned)+");return read()};window.testInvoiceSave=saveSupervisorInvoicePrice;})();");
 vm.runInContext(injected,race);
 await race.window.testInvoiceSave('PL-RACE','SP-INVOICE-RACE','invoice','25.000');
 const actual=JSON.parse(store.get(key))[0].items[0];
 assert.equal(actual.status,'RETURNED','Losing invoice save must preserve the refreshed Manager Return');
 assert.equal(actual.purchaseAmount,undefined,'Rejected invoice must not reappear in purchase expenses');
 assert.equal(actual.pendingSync,undefined,'Rejected invoice must not leave a pending local marker');
 assert.match(alerts.at(-1),/Latest Parts data has been refreshed/);
}
console.log('Invoice-versus-Manager-Return runtime recovery passed');
