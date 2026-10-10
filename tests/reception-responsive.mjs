import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const appCss = [...fs.readFileSync('app/src/main/assets/offline_test.html','utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n');
const source = fs.readFileSync('app/src/main/assets/v2/features/insurance/reception.js', 'utf8');
for (const engine of ['chromium', 'webkit']) {
  const browser = await playwright[engine].launch({headless:true});
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({viewport:{width,height:900}});
      await page.setContent('<style>body{margin:0}.modal-box{width:420px;max-width:90vw;margin:20px auto}button{padding:10px}</style><div id="managerView"></div><div id="modal"></div>');
      await page.addStyleTag({content:appCss});
      await page.evaluate(() => {
        window.me={id:'MGR001',role:'Manager'};
        window.zukaitAuth={getToken:()=> 'test-session'};
        window.openModal=h=>document.getElementById('modal').innerHTML='<div class="modal-box">'+h+'</div>';
        window.closeModal=()=>document.getElementById('modal').replaceChildren();
        window.fetch=async (_,args)=>{
          const body=JSON.parse(args.body);
          if(body.action==='reception_dashboard')return {ok:true,json:async()=>({ok:true,rows:[],counts:{checklists:0},total:0})};
          const c=body.command;
          const result=c.operation==='CAPABILITIES'?{allowed:true,manager:true}:c.operation==='MASTER'?{companies:[{id:1,name:'Test Insurance'}]}:c.operation==='LIST'?{rows:[{rc_no:'RC-TEST',details:{make:'Toyota',model:'Corolla',registration:'TEST',customer:'Customer <script>unsafe</script>'},insurance_company:'Test Insurance',location:'VWC',approval_status:'APPROVED'}]}:c.operation==='GET'?{record:{rc_no:'RC-TEST',job_type:'INSURANCE',can_edit:true,revision:1,details:{make:'Toyota',model:'Corolla',registration:'TEST',customer:'Customer <script>unsafe</script>'},insurance_company:'Test Insurance',location:'VWC',approval_status:'APPROVED'},movements:[],audit:[]}:{};

          return {ok:true,json:async()=>({ok:true,...result})};
        };
      });
      // Secure browser origins normally provide UUIDs; this isolated fixture has no origin.
      await page.evaluate(() => { if(!crypto.randomUUID) crypto.randomUUID=()=> '00000000-0000-4000-8000-000000000001'; });
      await page.addScriptTag({content:source});
      await page.evaluate(()=>window.zukaitReception.open());
      await page.locator('.rc-table').waitFor();
      assert.equal(await page.locator('.rc-table tbody tr').count(),1);
      assert.equal(await page.locator('.rc-table script').count(),0);
      assert.equal(await page.locator('[data-value=VWC]').count(),1);
      const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,dialog:document.querySelector('.modal-box').getBoundingClientRect().width,row:getComputedStyle(document.querySelector('.rc-table tr')).display}));
      assert.equal(layout.overflow,false,`${engine} ${width}: horizontal overflow`);
      if(width>=1024) assert.ok(layout.dialog>900,`${engine}: desktop dialog remains narrow`);
      if(width===390) assert.equal(layout.row,'block');
      // Detail view must fit Android width while preserving two PC columns.
      await page.locator('[data-rc-action=view]').click();
      await page.locator('.rc-cl-grid > .rc-box').first().waitFor();
      const detail=await page.evaluate(()=>({
        cards:document.querySelectorAll('.rc-cl-grid > .rc-box').length,
        columns:getComputedStyle(document.querySelector('.rc-cl-grid')).gridTemplateColumns.trim().split(/\s+/).length,
        overflow:document.documentElement.scrollWidth>innerWidth,
        map:!!document.querySelector('.rc-cl-diagram svg'),
        escaped:document.querySelectorAll('#rc-root script').length===0
      }));
      assert.equal(detail.cards,5,`${engine} ${width}: checklist cards missing`);
      assert.equal(await page.locator('.rc-cl-card h4').count(),5,`${engine} ${width}: distinct heading cards`);
      assert.equal(detail.columns,width<=760?1:2,`${engine} ${width}: wrong checklist columns`);
      assert.equal(detail.overflow,false,`${engine} ${width}: checklist horizontal overflow`);
      assert.equal(detail.map,true,`${engine} ${width}: damage diagram missing`);
      assert.equal(detail.escaped,true,`${engine} ${width}: unsafe detail HTML`);
      await page.locator('[data-rc-action=home]').click();
      await page.locator('[data-rc-action=new]').click();
      await page.locator('#rc-form').waitFor();
      assert.equal(await page.locator('#rc-form [name=make]').getAttribute('required'),'');
      assert.equal(await page.locator('#rc-form [name=tools]').count(),9);
      // V305 shared desktop/WebView styling must remain prominent and readable.
      const visual=await page.evaluate(()=>({
        topbar:getComputedStyle(document.querySelector('.rc-topbar')).backgroundImage,
        save:getComputedStyle(document.querySelector('#rc-form button[type=submit]')).color,
        inputHeight:document.querySelector('#rc-form [name=registration]').getBoundingClientRect().height,
        reading:document.querySelector('#rc-form .rc-reading').getBoundingClientRect().width
      }));
      assert.match(visual.topbar,/gradient/i,engine+' '+width+': updated V305 header missing');
      assert.ok(visual.inputHeight>=49,engine+' '+width+': form input too small');
      assert.ok(visual.reading>100,engine+' '+width+': KM/Mile reading cannot fit');
      // Desktop fullscreen modal, not the old 420px centered popup.
      const dialog=await page.locator('.modal-box.rc-dialog').boundingBox();
      assert.ok(dialog, `${engine} ${width}: Reception dialog not visible`);
      assert.ok(Math.abs(dialog.width-width)<=2,`${engine} ${width}: Reception not full-width`);
      assert.ok(Math.abs(dialog.height-900)<=2,`${engine} ${width}: Reception not full-height`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${engine} ${width}: editor overflow`);
      const expected=['registration','make','model','year','odometer_unit','odometer',
        'vin','customer','contact','claim'];
      const order=await page.locator('#rc-form > .rc-grid input,#rc-form > .rc-grid select')
        .evaluateAll(nodes=>nodes.map(n=>n.name));
      assert.deepEqual(order,expected,`${engine} ${width}: ordered fields`);
      assert.equal(await page.locator('#rc-form [name=job_type]').inputValue(),'INSURANCE');
      assert.equal(await page.locator('#rc-form [name=insurance_id]').getAttribute('required'),'');
      assert.equal(await page.locator('.rc-claim').isVisible(),true);
      await page.locator('#rc-form [name=job_type]').selectOption('CASH');
      assert.equal(await page.locator('.rc-insurance').isVisible(),false);
      assert.equal(await page.locator('.rc-claim').isVisible(),false);
      assert.equal(await page.locator('#rc-form [name=customer]').getAttribute('required'),'');
      assert.equal(await page.locator('#rc-form [name=insurance_id]').getAttribute('required'),null);
      await page.locator('#rc-form [name=job_type]').selectOption('INSURANCE');
      assert.equal(await page.locator('.rc-insurance').isVisible(),true);
      assert.equal(await page.locator('.rc-claim').isVisible(),true);
      await page.locator('[name=make]').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>document.activeElement.name),'model');
      // Back should preserve edited checklist data when the user cancels leaving.
      await page.locator('#rc-form [name=registration]').fill('OM-UNSAVED');
      let warning = '';
      page.once('dialog', async dialog => {warning=dialog.message();await dialog.dismiss();});
      await page.locator('[data-rc-action=back]').click();
      assert.match(warning,/unsaved changes/i,engine+' '+width+': no unsaved-change warning');
      assert.equal(await page.locator('#rc-form').count(),1,engine+' '+width+': cancel Back kept form');
      assert.equal(await page.locator('#rc-form [name=registration]').inputValue(),'OM-UNSAVED');
      page.once('dialog', dialog => dialog.accept());
      await page.locator('[data-rc-action=back]').click();
      await page.locator('[data-rc-action=new]').waitFor();
      assert.equal(await page.locator('#rc-form').count(),0,`${engine} ${width}: Back must leave checklist form`);
      await page.locator('[data-rc-action=close]').click();
      assert.equal(await page.locator('#rc-root').count(),0);
      // A V304/Phase 1 endpoint must never expose the Phase 2 Cash save flow.
      await page.evaluate(() => {
        // page.setContent() uses about:blank where browser storage is denied.
        // Give the isolated fixture a local request journal without changing
        // the production app's fail-closed saved-action behavior.
        const journal=new Map();
        Object.defineProperty(window,'localStorage',{configurable:true,value:{
          getItem:k=>journal.has(k)?journal.get(k):null,
          setItem:(k,v)=>journal.set(k,String(v)),
          removeItem:k=>journal.delete(k)
        }});
        const previous=window.fetch;
        window.zukaitAuth={getToken:()=> 'phase1-session'};
        window.zukaitReceptionForceBackendProbe=true;
        window.fetch=async (url,args)=>{
          if(JSON.parse(args.body).action==='reception_dashboard')
            return {ok:false,json:async()=>({ok:false,code:'unsupported_action'})};
          return previous(url,args);
        };
      });
      await page.evaluate(()=>window.zukaitReception.open());
      await page.locator('[data-rc-action=new]').click();
      await page.locator('#rc-form').waitFor();
      assert.equal(await page.locator('#rc-form [name=job_type] option[value=CASH]').count(),0);
      assert.match(await page.locator('.rc-form-hint').textContent(),/Insurance checklist only/);
      assert.equal(await page.locator('#rc-form [name=insurance_id]').getAttribute('required'),'');
      assert.equal(await page.locator('.modal-box.rc-dialog').isVisible(),true);
      // A Phase 1 Back click must never invoke the Phase 2 dashboard.
      await page.evaluate(() => {
        window.zukaitReceptionDashboard={resume:()=>{throw Error("Phase 2 dashboard used on V304");}};
      });
      await page.locator('[data-rc-action=back]').click();
      await page.locator('[data-rc-action=new]').waitFor();
      assert.equal(await page.locator('#rc-form').count(),0);
      assert.equal(await page.locator('#rc-error').textContent(),"");
      // Load the same dashboard bundle used by both production entrypoints.
      await page.addScriptTag({content:fs.readFileSync('app/src/main/assets/reception_dashboard.js','utf8')});
      await page.evaluate(()=>window.zukaitReception.open());
      await page.locator('[data-rdb=tile][data-section=followup]').waitFor();
      assert.equal(await page.locator('[data-rdb=tile]').count(),10);
      assert.equal(await page.locator('#rdb-results').count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${engine} ${width}: Phase 1 dashboard overflow`);
      await page.locator('[data-rdb=tile][data-section=followup]').click();
      assert.match(await page.locator('#rdb-unavailable').textContent(),/server update/);
      await page.locator('[data-rdb=tile][data-section=new]').click();
      await page.locator('#rc-form').waitFor();
      assert.equal(await page.locator('#rc-form option[value=CASH]').count(),0);
      await page.locator('[data-rc-action=back]').click();
      await page.locator('[data-rdb=tile][data-section=followup]').waitFor();
      assert.equal(await page.locator('[data-rdb=tile]').count(),10);
      await page.close();
      console.log(`${engine} ${width}: list, editor, keyboard and overflow checks passed`);
    }
  } finally {await browser.close();}
}
