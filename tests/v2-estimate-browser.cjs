const fs=require('fs');
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture={id:'preview',estimateNo:'Zi-Qt018',date:'2026-10-13',type:'LS',vatEnabled:false,customerName:'Anil',mobile:'',makeModel:'Toyota RAV4',year:'2017',registration:'38368 W',vin:'JTMRF9EV8HJ151476',claimNo:'',jobCard:'',lsRows:[{id:'repair',description:'Rear accident damage repairing',amount:150}],labourRows:[{id:'lab',description:'Panel repairs and refinishing',amount:150}],partRows:[{id:'part',description:'Rear bumper bracket',qty:2,unitPrice:12.5}],lsSpareParts:0,misc:0,notes:'Repair scope subject to inspection. Additional work requires customer approval.',showCustomerSuppliedParts:false,createdBy:'manager'};
(async()=>{
 const browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:900,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const head=fs.readFileSync('app/src/main/assets/offline_test.html','utf8').split('</head>')[0];
 await page.setContent(head+'</head><body><div id="modal" class="modal-backdrop"><div class="modal-box"></div></div></body></html>');
 await page.addStyleTag({content:'.modal-box{max-width:800px;max-height:90vh;box-sizing:border-box}.modal-backdrop{box-sizing:border-box}'});
 await page.evaluate(e=>{
  window.me={id:'manager',role:'Manager'};window.state={estimates:[e],estimateAudit:[],jobs:[]};
  window.openModal=html=>document.querySelector('.modal-box').innerHTML=html;window.closeModal=()=>{};window.save=()=>{};window.user=()=>({name:'Service Manager'});
 },fixture);
 await page.addScriptTag({path:'app/src/main/assets/v2/features/estimate/main_module.js'});
 await page.evaluate(()=>zukaitEstimate.openHome());
 await page.screenshot({path:'home-desktop.png'});
 await page.evaluate(()=>zukaitEstimate.openEditor('preview'));
 await page.waitForTimeout(100);
 await page.screenshot({path:'editor-desktop.png'});
 for(const width of [360,390,768]){
  await page.setViewportSize({width,height:960});
  await page.evaluate(()=>zukaitEstimate.openHome());
  const homeOverflow=await page.evaluate(()=>document.querySelector('.modal-box').scrollWidth>document.querySelector('.modal-box').clientWidth);
  assert.equal(homeOverflow,false,'Home overflows at '+width);
  if(width===390)await page.screenshot({path:'home-mobile.png'});
  await page.evaluate(()=>zukaitEstimate.openEditor('preview'));
  await page.waitForTimeout(50);
  for(const type of ['LS','PL']){
   await page.evaluate(type=>zukaitEstimate.setType(type),type);
   assert.equal(await page.evaluate(()=>document.querySelector('.modal-box').scrollWidth>document.querySelector('.modal-box').clientWidth),false,type+' editor overflows at '+width);
  }
  if(width===390){await page.evaluate(()=>zukaitEstimate.setType('LS'));await page.screenshot({path:'editor-mobile.png'});}
 }
 await page.evaluate(()=>{zukaitEstimate.setType('PL');zukaitEstimate.setVat(true)});
 await page.locator('.est-amount:visible').fill('200');
 assert.match(await page.locator('.est-summary-line.total').innerText(),/236\.250/);
 for(const header of await page.locator('.est-section-heading').all()){
  const heading=await header.locator('h4').boundingBox(),button=await header.locator('button').boundingBox();
  assert.ok(Math.abs(heading.y+heading.height/2-button.y-button.height/2)<5,'Add button must share the section heading row');
 }
 await page.evaluate(()=>zukaitEstimate.addRow('LAB'));
 const amount=page.locator('[data-est-lab-row]').last().locator('.est-amount');
 for(const [typed,formatted] of [['30','30.000'],['30.5','30.500'],['30.125','30.125'],['100','100.000'],['0','0.000']]){
  await amount.fill('0.000');await amount.blur();await amount.focus();assert.equal(await amount.inputValue(),'','Zero-valued amount must clear on focus');
  await amount.fill(typed);assert.equal(await amount.inputValue(),typed,'Typing must not insert decimals');await amount.blur();assert.equal(await amount.inputValue(),formatted);
 }
 await amount.fill('25.125');await amount.blur();await amount.focus();assert.equal(await amount.inputValue(),'25.125','Focus must preserve nonzero saved values');
 await page.locator('[data-est-lab-row]').last().locator('button').click();

 await page.evaluate(()=>zukaitEstimate.addRow('PART'));
 assert.equal(await page.locator('[data-est-part-row]').count(),2);
 await page.locator('[data-est-part-row]').last().locator('button').click();
 assert.equal(await page.locator('[data-est-part-row]').count(),1);
 const html=await page.evaluate(e=>zukaitEstimate.estimateDocumentHtml(e),fixture);
 const partsHtml=await page.evaluate(e=>zukaitEstimate.estimateDocumentHtml({...e,type:'PL',vatEnabled:true}),fixture);
 const longHtml=await page.evaluate(e=>zukaitEstimate.estimateDocumentHtml({...e,type:'PL',partRows:Array.from({length:120},(_,i)=>({id:'p'+i,description:'Part '+(i+1),qty:1,unitPrice:1}))}),fixture);
 fs.writeFileSync('estimate-preview.html',html);
 await page.setContent(html);
 for(const width of [390,794]){
  await page.setViewportSize({width,height:1123});
  for(const table of await page.locator('.work-table,.totals').all()){
   const head=table.locator('thead th.money-cell').last();
   const amounts=table.locator('tbody td.money-cell');
   const right=(await head.boundingBox()).x+(await head.boundingBox()).width;
   for(const cell of await amounts.all()){const box=await cell.boundingBox();assert.ok(Math.abs(box.x+box.width-right)<1,'Amount heading and values must share the same right edge');}
   assert.equal(await head.evaluate(el=>el.scrollWidth>el.clientWidth),false,'Amount heading must fit without wrapping');
  }
 }

 await page.setContent(html);assert.equal(await page.locator('.company-arabic').evaluate(el=>getComputedStyle(el).direction),'rtl');assert.match(await page.locator('.company-english').innerText(),/HI-TECH AUTOMOTIVE WORKSHOP/);assert.doesNotMatch(await page.locator('.head').innerText(),/93211154|1921|1194220/);const art=await page.locator('.letterhead-artwork').boundingBox();
 const headBox=await page.locator('.head').boundingBox();
 assert.ok(Math.abs(art.width-headBox.width)<1,'Sample branding must fill the header width');
 assert.ok(art.height>185&&art.height<191,'Branding artwork must remain compact on A4');
 assert.equal(await page.locator('.letterhead-artwork image').getAttribute('href').then(x=>x.startsWith('data:image/svg+xml;base64,')),true,'Print artwork must be embedded for Android/offline sharing');
 await page.pdf({path:'estimate-preview.pdf',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true});
 await page.setViewportSize({width:794,height:1123});await page.screenshot({path:'print-preview.png',fullPage:true});
 await page.setContent(partsHtml);await page.pdf({path:'estimate-parts-preview.pdf',preferCSSPageSize:true,printBackground:true});
 await page.setContent(longHtml);await page.pdf({path:'long-estimate.pdf',preferCSSPageSize:true,printBackground:true});
 assert.match(await page.locator('.estimate-meta').innerText(),/13-10-2026/);for(const arabic of ['الماركة','الطراز','سنة الصنع','الاسم','رقم الهاتف','أجور العمل','قطع الغيار','المبلغ'])assert.ok((await page.locator('.estimate-print').innerText()).includes(arabic));assert.match(await page.locator('.doc-footer').innerText(),/92403420, 72440918/);assert.ok(parseFloat(await page.locator('.estimate-print').evaluate(el=>getComputedStyle(el).fontSize))>=14);assert.deepEqual(errors,[]);await browser.close();console.log('Desktop/mobile layout, item editing, VAT and PDF rendering: passed');
})().catch(e=>{console.error(e);process.exit(1)});
