import fs from 'node:fs';import assert from 'node:assert/strict';
const main=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(main,/const prior=reconcileSyncMarkers\(read\(\)\),pendingLists=prior\.filter\(l=>\(l\.items\|\|\[\]\)\.some\(i=>pendingTransition\(i\)\)\),local=pendingLists\.map/,'server hydration must rebuild from server history, preserving only unsynced local work');
assert.match(main,/if\(cursor\)throw Error\('SPARE_PART_SERVER_HISTORY_INCOMPLETE'\)/,'client must not replace its cache from a truncated server event history');
assert.match(main,/while\(cursor&&pages<20\)/,'server history must be paged, not assumed to fit one response');
assert.match(main,/SPARE_PART_LIST_CREATED/);
assert.match(main,/SPARE_PART_LISTED/);
assert.match(main,/SPARE_PART_STATUS_CHANGED/);
assert.match(main,/SPARE_PART_COMMERCIAL_UPDATED/);
assert.match(main,/SPARE_PART_ARRIVAL_ACCEPTED/);
assert.match(main,/SPARE_PART_FINAL_PRICE_RECORDED/);
assert.match(main,/SPARE_PART_MANAGER_CORRECTED/);
assert.match(api,/\["WIP","AUDIT","CYCLE_TIME","EFFICIENCY","REPEAT","ID001","OVERTIME","PARTS_DELAY","SPARE_PARTS"/,'API must expose Spare Parts server event history');
console.log('Spare Parts durable server-history authority regression: PASS');

assert.match(main,/function openPartsQuotation\(\)\{if\(!\['Purchaser','Manager'\]\.includes\(role\(\)\)\)return/,'quotation entry must be shared by Purchaser and Manager');
assert.match(main,/async function saveQuotationPrice\(button\)\{if\(!\['Purchaser','Manager'\]\.includes\(role\(\)\)\|\|!button\)return/,'only Purchaser and Manager can save quotation pricing');
assert.match(main,/Quotation Total <strong id="v2SpQuoteTotal"/,'quotation page must show live total');
assert.doesNotMatch(main,/Purchase Amount OMR/,'Purchaser must not have a second purchase-price entry field');
assert.match(main,/async function saveSupervisorFinalPrice\(listNo,itemId\)\{if\(!\['Supervisor','Manager'\]\.includes\(role\(\)\)\)return/,'final price authority must remain Supervisor and Manager');

assert.match(main,/function partPriceHistory\(list,item\)/,'quotation must expose historical price guidance');
assert.match(main,/function supplierSuggestions\(item\)/,'quotation must suggest prior suppliers');
assert.match(main,/Last <b>/,'quotation should display last price');
assert.match(main,/Lowest <b>/,'quotation should display lowest historical price');
assert.match(main,/document\.getElementById\('v2SpVendor_'\+nextIndex\)\?\.focus\(\)/,'saving a quote should advance focus to the next part');

assert.match(main,/function quotationOffers\(item\)/,'parts support multiple vendor quotation offers');
assert.match(main,/function addQuotationOffer\(button\)/,'Purchaser or Manager can add alternative offers without duplicate parts');
assert.match(main,/async function selectQuotationOffer\(button\)/,'an offer can be selected as the authoritative quotation');
assert.match(main,/quotationOffers:item\.quotationOffers/,'selected offer alternatives must be committed in durable event payload');
assert.match(main,/if\(Array\.isArray\(p\.quotationOffers\)\)item\.quotationOffers=p\.quotationOffers/,'server hydration must restore alternative quotation offers');

assert.match(main,/function partsLibrary\(query='',list=null\)/,'reusable parts library must derive suggestions from historical parts');
assert.match(main,/function partCategory\(name\)/,'parts must receive automatic practical grouping');
assert.match(main,/Body'.*Mechanical'.*Electrical'.*Consumables'.*Other'/s,'automatic grouping must support the five agreed groups');
assert.match(main,/function draftPartSuggestions\(\)/,'parts-list creation must provide fast historical suggestions');
assert.match(main,/vs last/,'quotation must show compact price-change guidance');
assert.match(main,/delta>0\?'up':'down'/,'price increases must be visually identifiable');
assert.match(main,/v2-sp-price-change\\.up/,'price increase styling must exist');
assert.match(main,/v2-sp-price-change\\.down/,'price reduction styling must exist');
