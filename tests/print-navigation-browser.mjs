import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
const source=fs.readFileSync('app/src/main/assets/print_navigation.js','utf8');
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.setContent('<button id="origin">Materials report</button>');
  await page.addScriptTag({content:source});
  for(const action of ['← Back','✕ Close']){
   await page.evaluate(()=>{
    document.getElementById('origin').focus();
    const p=window.zukaitOpenPrintPreview('Materials');
    p.document.write('<html><head></head><body><div class="cons-preview-nav"><button onclick="window.close()">Legacy Close</button></div><h1>Materials</h1></body></html>');
    p.document.close();
   });
   await page.frameLocator('iframe').getByRole('heading',{name:'Materials'}).waitFor();
   assert.equal(await page.locator('.zukait-print-overlay > nav').count(),1);
   assert.equal(await page.frameLocator('iframe').locator('.cons-preview-nav,.zukait-print-nav').count(),0);
   await page.evaluate(()=>{window.printCount=0;document.querySelector('iframe').contentWindow.print=()=>window.printCount++});
   await page.getByRole('button',{name:'Print / PDF',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.printCount),1);
   await page.getByRole('button',{name:action,exact:true}).click();
   assert.equal(await page.locator('.zukait-print-overlay').count(),0);
   assert.equal(await page.locator('#origin').evaluate(e=>e===document.activeElement),true);
  }
  await page.evaluate(()=>{const p=window.zukaitOpenPrintPreview('Materials');p.document.write('<html><body>Escape</body></html>');p.document.close()});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.zukait-print-overlay').count(),0);
  console.log(name+': sandbox-external Back/Close/Print and focus restoration passed');
 }finally{await browser.close()}
}
