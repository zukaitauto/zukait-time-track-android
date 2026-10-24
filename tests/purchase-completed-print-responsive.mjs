import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {sample,render} from './purchase-completed-print-clean.mjs';
fs.mkdirSync('artifacts/purchase-print',{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:794,height:1123}});
 await page.emulateMedia({media:'print'});
 await page.setContent(render());
 const rows=await page.locator('tbody tr').count();assert.equal(rows,4);
 assert.equal(await page.locator('tbody').getByText('OMR').count(),0);
 const cells=await page.locator('tbody .money').evaluateAll(els=>els.map(el=>({align:getComputedStyle(el).textAlign,space:getComputedStyle(el).whiteSpace})));
 assert.ok(cells.every(x=>x.align==='right'&&x.space==='nowrap'));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const pdf=await page.pdf({path:'artifacts/purchase-print/purchase-completed.pdf',format:'A4',preferCSSPageSize:true,printBackground:true});
 assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'four-row sample prints on one A4 page');
 await page.screenshot({path:'artifacts/purchase-print/purchase-completed.png',fullPage:true});
 await page.setContent(render({...sample,items:[{name:'A long replacement part description that must wrap inside the part column without overlapping the quantity or price',qty:1,supplier:'A workshop supplier with a long name',quoteAmount:11.5,purchaseAmount:12.38}]}));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'long part/vendor names fit A4 width');
 assert.equal(await page.locator('th').count(),6);
 await page.close();
}finally{await browser.close()}
console.log('Purchase Completed A4: one-page sample, aligned number-only rows, long text and optional columns passed.');
