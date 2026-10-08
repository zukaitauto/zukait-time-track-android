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

assert.equal(spare.allowed('RETURNED','ORDERED'),false,'returned parts cannot bypass fresh enquiry/quotation');
assert.equal(spare.allowed('RETURNED','ENQUIRY'),true,'returned parts restart at enquiry');
for(const key of ['quoteAmount','price','supplier','quotationOffers','commercialRevision'])assert.equal(returned.item[key],undefined,'return clears stale commercial state '+key);
assert.match(mainSource,/RETURNED:\['Re-enquire','ENQUIRY','info'\]/,'Purchaser UI restarts returned parts at enquiry');

assert.match(mainSource,/const amount=validMoney\(raw\);if\(amount==null\|\|amount<=0\)return alert\('Final invoice price must be more than 0\.000 OMR\.'\)/,'all invoice save paths reject zero final amount');
assert.match(mainSource,/bucket==='PURCHASE_COMPLETED'.*?Number\(i\.purchaseAmount\)>0/s,'Purchase Completed requires positive final invoice amounts');

assert.match(mainSource,/function reportAmount\(item\)\{const n=Number\(item\?\.purchaseAmount\);return Number\.isFinite\(n\)&&n>0\?n:0\}/,'parts reports use only positive final purchase amount, never quotation or supplier fallback');
