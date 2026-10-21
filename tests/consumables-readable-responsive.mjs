import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const source=fs.readFileSync('app/src/main/assets/consumables_ui.js','utf8');
let css='';const out={innerHTML:''};
const names=['Water Paper 800','BASE WHITE','Masking Tape','2K Slow Thinner','Long material name that must remain completely readable'];
const materials=names.map((name,i)=>({id:'M'+i,name,unit:i===0?'Piece':'Liter'}));
const brands=['CARSHINE','BASE WHITE','MASKING TAPE','SAYARA','Long brand name without truncation'].map((name,i)=>({id:'B'+i,name}));
const lines=materials.map((m,i)=>({materialId:m.id,brandId:brands[i].id,quantity:i===1?0.4:1}));
const ctx={window:{},state:{},draft:{jc:{job:{no:'TEST'}},lines},C:()=>({ensureState:()=>({materials,brands}),allowance:()=>lines}),esc:x=>String(x),document:{getElementById:id=>id==='consActualRows'?out:null,createElement:()=>({textContent:''}),head:{appendChild:s=>{css+=s.textContent}}}};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function consCompactEntryStyle(){'),source.indexOf('window.openConsumablesAdditional='))+'\nconsCompactEntryStyle();',ctx);
vm.runInContext(source.slice(source.indexOf('window.consRenderActualRows=function(){'),source.indexOf('window.consAddActualMaterial=')),ctx);
ctx.window.consRenderActualRows();assert.doesNotMatch(out.innerHTML,/>MATERIAL</);
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
try{for(const width of [320,390,600,768,1280]){
 const page=await browser.newPage({viewport:{width,height:950}});
 await page.setContent('<style>body{margin:0;padding:12px;font:16px Arial}main{padding:12px}input{padding:20px;font-size:24px}'+css+'</style><main>'+out.innerHTML+'</main>');
 assert.equal(await page.locator('.cons-actual-line-name').count(),names.length);
 for(const card of await page.locator('.cons-actual-line-card').all()){
  const result=await card.evaluate(el=>{const children=[...el.children],rects=children.map(x=>x.getBoundingClientRect()),input=el.querySelector('input');return {overflow:[el,...el.querySelectorAll('*')].some(x=>x.scrollWidth>x.clientWidth+1),overlap:rects.some((a,i)=>rects.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)),font:parseFloat(getComputedStyle(input).fontSize),height:input.getBoundingClientRect().height,nameFont:parseFloat(getComputedStyle(el.querySelector('b')).fontSize)};});
  assert.equal(result.overflow,false,'text/input overflow at '+width);assert.equal(result.overlap,false,'panels overlap at '+width);assert.ok(result.font>=16&&result.nameFont>=16&&result.height>=44);
 }
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(await page.locator('input').evaluateAll(inputs=>inputs.map(x=>Number(x.value))),lines.map(l=>l.quantity));
 await page.close();
}}finally{await browser.close();}
console.log('PASS: actual material names, brands, suggested/actual quantities stay readable without overlap at 320–1280px; values unchanged.');
