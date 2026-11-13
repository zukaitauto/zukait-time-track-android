import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
const start=src.indexOf('function reportAmount(item)'),end=src.indexOf('function omanDateKey',start);
assert.ok(start>=0&&end>start,'spare parts unit-price calculator must exist');
const {reportAmount,reportTotalAmount}=vm.runInNewContext('(function(){'+src.slice(start,end)+';return {reportAmount,reportTotalAmount}})()');

assert.equal(reportAmount({status:'FITTED',purchaseAmount:10,qty:2}),10,'saved purchaseAmount is ONE unit price');
assert.equal(reportTotalAmount({status:'FITTED',purchaseAmount:10,qty:2}),20,'2 units at 10 OMR cost 20 OMR');
assert.equal(reportTotalAmount({status:'RECEIVED',purchaseAmount:10,qty:3}),30);
assert.equal(reportTotalAmount({status:'RETURNED',purchaseAmount:10,qty:2}),0,'returned parts cannot remain active expense');
assert.equal(reportTotalAmount({status:'FITTED',quoteAmount:999,qty:2}),0,'quotation must not become purchase expense');
assert.equal(reportTotalAmount({status:'FITTED',purchaseAmount:10,qty:0}),0);
assert.match(src,/Final Price OMR \\(per unit\\)/,'Invoice and Manager price labels state per-unit semantics');
assert.match(src,/amount:reportTotalAmount\\(item\\)/,'Part report totals use unit price times quantity');
assert.match(src,/const invoiceTotal=\\(r\\.items\\|\\|\\[\\]\\)\\.reduce\\(\\(n,x\\)=>n\\+reportTotalAmount\\(x\\),0\\)/,'Parts List summary uses the same quantity-aware total');
assert.match(src,/Total Final Price · Qty × Unit Price/,'Total label specifies formula');
console.log('Spare Parts unit-price input, quantity totals, returns, quotations and summary parity: PASS');
