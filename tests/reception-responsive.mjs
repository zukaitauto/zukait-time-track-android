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
          const c=JSON.parse(args.body).command;
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
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${engine} ${width}: editor overflow`);
      await page.locator('[name=make]').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>document.activeElement.name),'model');
      await page.locator('[data-rc-action=close]').click();
      assert.equal(await page.locator('#rc-root').count(),0);
      await page.close();
      console.log(`${engine} ${width}: list, editor, keyboard and overflow checks passed`);
    }
  } finally {await browser.close();}
}
