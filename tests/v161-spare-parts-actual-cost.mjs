import fs from 'node:fs';import assert from 'node:assert/strict';
const src=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
assert.match(src,/Quotation OMR<input[^>]*id="v2SpPurchaseQuote"/,'Purchaser must keep quotation separate');
assert.match(src,/Purchase Amount OMR<input[^>]*id="v2SpPurchaseAmount"/,'Purchaser must capture actual purchase amount');
assert.match(src,/function reportAmount\(item\)\{for\(const k of \['purchaseAmount','supplierCost','billAmount','price'\]\)/,'Reporting must prefer actual purchase amount over fallback legacy price fields');
assert.match(src,/quoteAmount:r\.item\.quoteAmount\?\?null,purchaseAmount:r\.item\.purchaseAmount\?\?null/,'Sync event must preserve quotation and purchase amount separately');
assert.doesNotMatch(src,/function reportAmount\(item\)[\s\S]{0,180}'quoteAmount'/,'Quotation must not be used as actual Job Card part cost');
console.log('Spare Parts actual-cost priority: ok');
