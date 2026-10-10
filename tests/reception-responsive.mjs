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
          const result=c.operation==='CAPABILITIES'?{allowed:true,manager:true}:c.operation==='MASTER'?{companies:[{id:1,name:'Test Insurance'}]}:c.operation==='LIST'?{rows:[{rc_no:'RC-TEST',details:{make:'Toyota',model:'Corolla',registration:'TEST',customer:'Customer <script>unsafe</script>'},insurance_company:'Test Insurance',location:'VWC',approval_status:'APPROVED'}]}:{};
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
      await page.locator('[data-rc-action=new]').click();
      await page.locator('#rc-form').waitFor();
      assert.equal(await page.locator('#rc-form [name=make]').getAttribute('required'),'');
      assert.equal(await page.locator('#rc-form [name=tools]').count(),9);
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
      await page.close();
      console.log(`${engine} ${width}: list, editor, keyboard and overflow checks passed`);
    }
  } finally {await browser.close();}
}
