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
assert.match(html,/@page\{size:A4 portrait;margin:0\}/);
assert.match(html,/viewBox="0 0 840 310"/);






assert.match(html,/Customer Signature/);
assert.match(html,/Fuel/);
assert.match(html,/X = Dent/);
assert.match(html,/S = Scratch/);
assert.match(html,/M = Missing/);
assert.doesNotMatch(html,/Vehicle Damage Diagram:/);
assert.match(html,/Damage Description/);
assert.match(html,/Wheel Covers/);
assert.match(html,/Claim Number:/);
assert.doesNotMatch(html,/Claim \/ Gate Pass/);
assert.doesNotMatch(html,/Status: Waiting/);
assert.match(html,/Checklist Date:/);
assert.match(html,/LH FRONT DOOR/);
assert.match(html,/RH FRONT DOOR/);
assert.match(html,/rc-cols-vehicle/);
assert.match(html,/rc-cols-vin/);
assert.match(html,/rc-cols-customer/);
assert.match(html,/Dashboard Warning/);
const fieldOrder=["Job Type:","Insurance:","Reg No:","Make:","Model:","VIN:","Year:","KM:","Customer Name:","Mob:","Claim Number:"];
let previous=-1;
for(const field of fieldOrder){
 const next=html.indexOf('<strong>'+field+'</strong>');
 assert.ok(next>previous,"A4 field order or label missing: "+field);
 previous=next;
}
const browser=await chromium.launch({headless:true});
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
  assert.ok(dimensions.notesHeight>=260,JSON.stringify(dimensions));
  assert.ok(dimensions.carWidth>dimensions.carHeight,JSON.stringify(dimensions));
  assert.ok(dimensions.notesContentHeight<=dimensions.notesVisibleHeight+2,
    "Normal Reception notes must be fully visible on the A4 form");
  const pdf=await page.pdf({format:"A4",printBackground:true,preferCSSPageSize:true,
    margin:{top:"0mm",bottom:"0mm",left:"0mm",right:"0mm"}});
  const pageCount=(pdf.toString("latin1").match(/\/Type\s*\/Page(?!s\b)/g)||[]).length;
  assert.equal(pageCount,1,"Reception Checklist PDF must be exactly ONE A4 page");
  fs.writeFileSync(path.join(artifactDir,"Reception_Checklist_A4_Test.pdf"),pdf);
  await page.screenshot({path:path.join(artifactDir,"Reception_Checklist_A4_Test.png"),
    fullPage:true});
  // Vehicle orientation: rear at left, front at right; LH above and RH below.
  const labels=await page.locator(".rc-print-car text").allTextContents();
  assert.ok(labels.includes("FRONT") && labels.includes("REAR"));
  const lightGlass=await page.locator(".rc-print-car").evaluate(svg=>
    [...svg.querySelectorAll('[fill]')].every(x=>!["#44667d","#547a94"].includes(x.getAttribute("fill"))));
  assert.equal(lightGlass,true,"A4 diagram must use light window fills");
  console.log("PASS: actual Chromium A4 PDF is one page; accurate LH/RH, printable notes, accessories, and horizontal diagram");
} finally {
  await browser.close();
}
