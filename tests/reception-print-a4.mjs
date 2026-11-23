// Real-browser regression for the existing Reception print/PDF HTML.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const dir=fs.mkdtempSync(path.join(os.tmpdir(),"zukait-a4-"));
const filename=path.join(dir,"checklist.html");
const artifactDir=path.resolve("artifacts/reception-a4");
fs.mkdirSync(artifactDir,{recursive:true});
execFileSync(process.execPath,["tests/reception-phase1.mjs"],{
  env:{...process.env,ZUKAIT_RECEPTION_QA_HTML:filename},
  stdio:"pipe",timeout:30000
});
const html=fs.readFileSync(filename,"utf8");
assert.match(html,/ZUKAIT INTERNATIONAL LLC/);
assert.match(html,/>CHECK LIST<\/div>/);
assert.doesNotMatch(html,/VEHICLE RECEPTION CHECKLIST \/ INSPECTION FORM/);
assert.match(html,/CUSTOMER INFORMATION/);
assert.match(html,/VEHICLE & CLAIM INFORMATION/);
assert.match(html,/@page\{size:A4 portrait;margin:0\}/);
assert.match(html,/viewBox="0 0 1536 1152"/);






assert.match(html,/Customer Signature/);
assert.match(html,/Fuel/);
assert.match(html,/X = Dent/);
assert.match(html,/S = Scratch/);
assert.match(html,/M = Missing/);
assert.doesNotMatch(html,/Vehicle Damage Diagram:/);
assert.match(html,/WORK DESCRIPTIONS \/ NOTES/);
assert.match(html,/\.rc-item\{[^}]*min-height:8mm/,'Accessory rows must stay compact');
assert.match(html,/\.rc-item\{[^}]*flex-direction:row/,'Accessory checkbox and label must share a row');
assert.doesNotMatch(html,/<span>Notes:<\/span>/,'Legacy Notes heading must not appear');
assert.doesNotMatch(html,/<b>Damage Description<\/b>/);
assert.doesNotMatch(html,/repeating-linear-gradient\(to bottom/);
assert.match(html,/Wheel Covers/);
assert.match(html,/Claim Number:/);
assert.doesNotMatch(html,/Claim \/ Gate Pass/);
assert.doesNotMatch(html,/Status: Waiting/);
assert.match(html,/Checklist Date:/);
assert.match(html,/data:image\/png;base64,/);

assert.match(html,/rc-cols-vehicle/);
assert.match(html,/rc-cols-vin/);
assert.match(html,/rc-cols-customer/);
assert.match(html,/Dashboard Warning/);
const fieldOrder=["Job Type:","Insurance:","Reg No:","Make:","Model:","VIN:","Year:","KM:","Claim Number:","Customer Name:","Mob:"];
let previous=-1;
for(const field of fieldOrder){
 const next=html.indexOf('<strong>'+field+'</strong>');
 assert.ok(next>previous,"A4 field order or label missing: "+field);
 previous=next;
}
const browser=await chromium.launch({headless:true,...(process.env.ZUKAIT_CHROMIUM_PATH?{executablePath:process.env.ZUKAIT_CHROMIUM_PATH}:{})});
try{
  const page=await browser.newPage({
    viewport:{width:1240,height:1754},deviceScaleFactor:1
  });
  await page.setContent(html,{waitUntil:"load"});
  await page.emulateMedia({media:"print"});
  const dimensions=await page.evaluate(()=>{
    const s=document.querySelector(".rc-sheet");
    const n=document.querySelector(".rc-notes");
    const body=document.body;
    const r=s.getBoundingClientRect(),nr=n.getBoundingClientRect();
    return {sheetHeight:r.height,bodyHeight:body.scrollHeight,
      notesHeight:nr.height,notesContentHeight:n.scrollHeight,
      notesVisibleHeight:n.clientHeight, width:r.width,
      carWidth:document.querySelector(".rc-print-car").getBoundingClientRect().width,
      carHeight:document.querySelector(".rc-print-car").getBoundingClientRect().height};
  });
  assert.ok(dimensions.notesHeight>=90,JSON.stringify(dimensions));
  assert.ok(dimensions.carWidth>dimensions.carHeight,JSON.stringify(dimensions));
  assert.ok(dimensions.notesContentHeight<=dimensions.notesVisibleHeight+2,
    "Normal Reception notes must be fully visible on the A4 form");
  const layout=await page.evaluate(()=>{
    const table=document.querySelector('.rc-function-table'),inspection=document.querySelector('.rc-inspection'),fuel=document.querySelector('.rc-fuel');
    return {rows:table.querySelectorAll('tbody tr').length,font:parseFloat(getComputedStyle(table).fontSize),fuelBottom:fuel.getBoundingClientRect().bottom,inspectionBottom:inspection.getBoundingClientRect().bottom,accessories:document.querySelectorAll('.rc-accessories .rc-item').length};
  });
  assert.equal(layout.rows,7);
  assert.equal(layout.accessories,14);
  assert.ok(layout.font>=12,'Function Check must be at least 9pt');
  assert.ok(layout.fuelBottom<=layout.inspectionBottom,'Inspection contents must not overlap accessories');
  const pdf=await page.pdf({format:"A4",printBackground:true,preferCSSPageSize:true,
    margin:{top:"0mm",bottom:"0mm",left:"0mm",right:"0mm"}});
  const pageCount=(pdf.toString("latin1").match(/\/Type\s*\/Page(?!s\b)/g)||[]).length;
  assert.equal(pageCount,1,"Reception Checklist PDF must be exactly ONE A4 page");
  fs.writeFileSync(path.join(artifactDir,"Reception_Checklist_A4_Test.pdf"),pdf);
  await page.screenshot({path:path.join(artifactDir,"Reception_Checklist_A4_Test.png"),
    fullPage:true});
  // Vehicle orientation: rear at left, front at right; LH above and RH below.
  const labels=await page.locator(".rc-print-car text").allTextContents();
  const embedded=await page.locator(".rc-print-car image").getAttribute("href");
  assert.deepEqual(Buffer.from(embedded.split(",")[1],"base64"),fs.readFileSync("app/src/main/assets/v2/features/insurance/vehicle-inspection-approved.png"),"Printed image must be byte-identical to the approved PNG");
  const lightGlass=await page.locator(".rc-print-car").evaluate(svg=>
    [...svg.querySelectorAll('[fill]')].every(x=>!["#44667d","#547a94"].includes(x.getAttribute("fill"))));
  assert.equal(lightGlass,true,"A4 diagram must use light window fills");
  console.log("PASS: actual Chromium A4 PDF is one page; accurate LH/RH, printable notes, accessories, and horizontal diagram");
} finally {
  await browser.close();
}
