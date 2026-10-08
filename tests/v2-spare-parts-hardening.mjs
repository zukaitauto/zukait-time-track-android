import fs from'node:fs';import assert from'node:assert/strict';
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const sql=fs.readFileSync('supabase/ARCHITECTURE_V2_REPORTING.sql','utf8');
const hist=fs.readFileSync('supabase/ARCHITECTURE_V2_BOUNDED_HISTORY.sql','utf8');
const main=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
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
assert.match(workflow,/if\(to==='FITTED'\)return role==='Manager'/,'Post-arrival fitting authority must remain Manager-only');
assert.match(workflow,/if\(to==='SUPERVISOR_VERIFIED'\)return role==='Supervisor'\|\|role==='Manager'/,'Supervisor must retain physical-arrival verification authority');
assert.match(workflow,/if\(to==='CUSTOMER_SETTLEMENT'\)return role==='Supervisor'\|\|role==='Manager'/,'Purchaser must not have customer-settlement authority');
console.log('V2 Spare Parts hardening guard passed');
assert.match(main,/if\(!\['Manager','Supervisor'\]\.includes\(role\(\)\)\)return;const rows=read\(\),list=/,'Audited correction save must allow Manager and Supervisor only');
assert.match(main,/Correction reason is required\./,'Manager parts correction must require a reason');
assert.match(main,/SPARE_PART_MANAGER_CORRECTED/,'Manager correction must emit an auditable server event');assert.match(main,/SPARE_PART_SUPERVISOR_CORRECTED/,'Supervisor correction must emit a distinct auditable server event');
assert.match(main,/managerCorrectionAudit/,'Manager correction must retain before\/after audit history');
assert.ok(main.includes('option value="RECEIVED"')&&main.includes('>Arrived</option>'),'Manager correction must allow Arrived status');
assert.match(mainSource,/Returned parts must use Cancel Return or Re-enquire/,'manual correction cannot bypass audited returned-part flow');
assert.match(mainSource,/Cannot move a partially received part to verified\/confirmed\/fitted/,'manual correction cannot promote a partial receipt');
assert.match(mainSource,/Supervisor verification is required before confirmation/,'manual correction preserves verification gate');
assert.match(mainSource,/Supervisor confirmation is required before marking the part fitted/,'manual correction preserves fitting gate');
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

assert.match(mainSource,/saveManagerItemEdit\(listNo,itemId\).*?if\(!navigator\.onLine\)return alert\('Connect to the server before correcting a Parts item\.'\);await hydrateAuthoritativeLists\(\)/s,'parts correction must refresh authoritative state first');
assert.match(mainSource,/item\.syncConflict\|\|pendingTransition\(item\).*?pending or conflicting update/s,'parts correction must block unresolved sync conflicts');

const returned=ctx.window.zukaitV2.spareParts.transition({id:'SP-RETURN',status:'RECEIVED',qty:2,receivedQty:1,receivedAt:'old',partialReceipt:true,arrivalAccepted:true,supervisorVerifiedAt:'old'},'RETURNED',{role:'Purchaser',actorId:'P1',reason:'Wrong part'});
assert.equal(returned.ok,true,'received part can be returned by Purchaser');
for(const key of ['receivedQty','receivedAt','partialReceipt','arrivalAccepted','supervisorVerifiedAt'])assert.equal(returned.item[key],undefined,'return clears stale '+key);

assert.match(mainSource,/receivedQty>0&&qty<receivedQty.*?Quantity cannot be lower than.*?already received/s,'correction cannot reduce ordered quantity below already received quantity');

assert.match(mainSource,/monthSpend=items\.reduce\(\(sum,i\)=>\{const amount=Number\(i\.purchaseAmount\),t=Date\.parse\(i\.purchaseRecordedAt\|\|0\)/,'monthly purchase spend must use final invoice recording date');
assert.doesNotMatch(mainSource,/monthSpend=items\.reduce\(\(sum,i\)=>\{const t=Date\.parse\(i\.updatedAt\|\|i\.receivedAt/,'monthly purchase spend must not move when status is later updated');

assert.match(mainSource,/function invoiceAmountEligible\(item\)\{return arrivedConfirmed\(item\)\}/,'invoice entry requires Supervisor-confirmed arrival');
assert.match(mainSource,/PURCHASE_COMPLETED'\)return items\.length>0&&items\.every\(arrivedConfirmed\)/,'purchase completed requires Supervisor-confirmed arrival');

assert.match(mainSource,/function isDeliveredVehiclePartPending\(item\).*?\['RECEIVED','SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED','CUSTOMER_SETTLEMENT'\]/s,'delivered pending ends when the part physically arrives');
assert.match(mainSource,/DELIVERED_PENDING'[\s\S]*?items\.some\(isDeliveredVehiclePartPending\)/,'delivered pending bucket uses physical-arrival pending rule');

assert.match(mainSource,/function attentionAgeDays\(item,list\)\{const started=Date\.parse\(item\?\.returnedAt\|\|item\?\.createdAt/,'15-day purchaser attention restarts from return date');

assert.match(mainSource,/const NEW_PARTS_WORK_HOURS=27;/,'new parts retention is exactly three 9-hour workshop days');
assert.match(mainSource,/workPeriods:\[\[8,13\],\[15,19\]\],closedWeekdays:\[5\]/,'new parts workshop age excludes lunch and Friday');

assert.match(mainSource,/function sparePartsPublicHoliday\(ts\).*?zukaitV2\?\.rules\?\.publicHoliday/s,'parts retention reuses global public-holiday authority');
assert.match(mainSource,/!closed\.has\(day\)&&!sparePartsPublicHoliday\(t\)/,'new parts retention excludes configured public holidays');

assert.match(mainSource,/bucket==='NEW'\)return isNewPartsList\(r\)&&items\.length>0&&items\.every\(i=>\['LISTED','ENQUIRY','QUOTED'\]/,'New Parts bucket excludes a list as soon as any part is ordered or beyond');

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

assert.match(mainSource,/function reportAmount\(item\)\{const n=Number\(item\?\.purchaseAmount\);return Number\.isFinite\(n\)&&n>0\?n:0\}/,'parts reports use only positive final purchase amount, never quotation or supplier fallback');

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
assert.match(main,/async function recoverSpareConflict\(reason\)[\s\S]*await hydrateAuthoritativeLists\(\)/,'Recognized conflicts must refresh authoritative Spare Parts state');
assert.match(main,/const conflictMessage=await recoverSpareConflict\(reason\)/,'Commit failure path must invoke Spare Parts conflict recovery');
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
assert.match(api,/SPARE_PART_FINAL_PRICE_RECORDED"[\s\S]*allowedKeys=new Set\(\["partId","listNo","jobCard","finalPrice"\]\)/,'Final invoice payload must be strictly allowlisted');
assert.match(api,/workshop_v2_spare_part_state"[\s\S]*invoiceEligibleStatuses=new Set\(\["SUPERVISOR_VERIFIED","DENTER_CHECKED","SUPERVISOR_CONFIRMED","FITTED"\]\)/,'Server must require authoritative confirmed-arrival state before final price');
assert.match(api,/spare_final_price_not_eligible/,'Final price must reject mismatched or ineligible part/list/JC state');
assert.match(sql,/event_type='SPARE_PART_FINAL_PRICE_RECORDED'[\s\S]*coalesce\(e\.revision,0\)>=coalesce\(new\.revision,0\)[\s\S]*stale_spare_final_price/,'Database must reject stale/equal final-price revisions');

assert.match(apiListCreated,/eventType==="SPARE_PART_FINAL_PRICE_RECORDED"[\s\S]*allowedKeys=new Set\(\["partId","listNo","jobCard","finalPrice"\]\)[\s\S]*price<=0[\s\S]*price>1000000/,'Final Spare Parts invoice payload must be strictly allowlisted and positive');
assert.match(apiListCreated,/eventType==="SPARE_PART_FINAL_PRICE_RECORDED"[\s\S]*\["Manager","Supervisor"\]\.includes\(callerRole\)/,'Only Manager or Supervisor may record final Spare Parts invoice amounts');
assert.match(main,/stale_spare_final_price/,'Stale final invoice conflicts must refresh authoritative Spare Parts state');

assert.match(apiListCreated,/eventType==="SPARE_PART_FINAL_PRICE_RECORDED"[\s\S]*allowedKeys=new Set\(\["partId","listNo","jobCard","finalPrice"\]\)/,'Final invoice payload must remain strictly allowlisted');
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
