import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {chromium} from 'playwright';
const source=fs.readFileSync('app/src/main/assets/accountant_bill_intent.mjs');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/intent.mjs'?'text/javascript':'text/html');res.end(req.url==='/intent.mjs'?source:'<!doctype html><title>Synthetic bill recovery</title>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
const command={requestId:'79000000-0000-4000-8000-000000000001',entityId:'79000000-0000-4000-8000-000000000002',supplierId:'79000000-0000-4000-8000-000000000003',deviceId:'QA',reason:'Reviewed invoice',expectedSupplierRevision:1,expectedPayableRevision:1,expectedWorkshopRevision:1,invoiceReference:'QA',invoiceDate:'2026-10-21',transactionDate:'2026-10-21',invoiceTotalMills:1000,expectedMaterialMills:1000,invoiceReviewed:true,sources:[{type:'PAINT_ORDER',id:'PO_QA',expectedReceiptDigest:'a'.repeat(32)}]};
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext();const url=`http://127.0.0.1:${server.address().port}`;
 async function page(){const p=await context.newPage();await p.goto(url);await p.evaluate(async()=>{const {billIntents}=await import('/intent.mjs');window.actor={verified:true,id:'QA_A',role:'Accountant',sessionId:'QA_SESSION'};window.sent=[];window.client=billIntents({storage:localStorage,project:'QA',session:()=>window.actor,online:()=>navigator.onLine,send:async b=>{window.sent.push(b);return new Promise(r=>window.ack=r)}})});return p;}
 const a=await page(),b=await page();await a.evaluate(c=>{window.result=client.submit(c).then(()=> 'ok',e=>e.message)},command);
 await a.waitForFunction(()=>sent.length===1);
 assert.equal(await b.evaluate(()=>client.retry().then(()=> 'ok',e=>e.message)),'bill_busy');assert.equal(await b.evaluate(()=>sent.length),0);
 // Browser context releases its real Web Lock on tab termination; intent survives.
 await a.close();await b.waitForFunction(async()=>!(await navigator.locks.query()).held.length);await b.evaluate(()=>{window.result=client.retry().then(()=> 'ok',e=>e.message)});await b.waitForFunction(()=>sent.length===1);
 assert.deepEqual(await b.evaluate(()=>sent[0].command),command);await b.evaluate(()=>ack({ok:true,duplicate:true}));assert.equal(await b.evaluate(()=>result),'ok');assert.equal(await b.evaluate(()=>client.pending()),null);
 // Same-tab reload also keeps the exact uncertain request, with no automatic send.
 await b.evaluate(c=>{window.result=client.submit(c).catch(e=>e.message)},command);await b.waitForFunction(()=>sent.length===2);await b.reload();await b.waitForFunction(async()=>!(await navigator.locks.query()).held.length);const c=await page();assert.equal(await c.evaluate(()=>client.pending().command.requestId),command.requestId);assert.equal(await c.evaluate(()=>sent.length),0);
 await c.evaluate(()=>{window.result=client.retry().then(()=> 'ok',e=>e.message)});await c.waitForFunction(()=>sent.length===1);await c.evaluate(()=>{actor={...actor,id:'QA_B',sessionId:'OTHER'};ack({ok:true})});assert.equal(await c.evaluate(()=>result),'bill_account_changed');assert.equal(await c.evaluate(()=>client.pending()),null);
 await c.evaluate(()=>{actor={verified:true,id:'QA_A',role:'Accountant',sessionId:'REVERIFIED'};window.result=client.retry().then(()=> 'ok',e=>e.message)});await c.waitForFunction(()=>sent.length===2);await c.evaluate(()=>ack({ok:true,duplicate:true}));assert.equal(await c.evaluate(()=>result),'ok');
 await context.close();console.log('PASS Chromium real Web Locks across tabs, tab termination/reload with exact durable retry, no automatic replay, account-switch late-ack isolation and reverified recovery. Synthetic local server only.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
