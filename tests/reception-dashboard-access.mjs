import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";

const source = fs.readFileSync("app/src/main/assets/v2/features/insurance/reception.js", "utf8");
const dom = new JSDOM(
  '<div id="managerView"><div class="v135-manager-header">Manager</div></div>' +
  '<div id="supervisorView" class="hidden"><div class="v91-role-identity">Supervisor</div></div>' +
  '<div id="employeeView" class="hidden"></div><div id="modal"></div>',
  {url:"https://qa.invalid",runScripts:"outside-only"}
);
const w = dom.window, calls = [];
const token = "unchanged-existing-workshop-session";
w.me = {id:"QA-MGR",role:"Manager",name:"Existing Manager"};
w.zukaitAuth = {getToken:()=>token};
w.openModal = html => w.document.getElementById("modal").innerHTML = html;
w.closeModal = () => w.document.getElementById("modal").replaceChildren();
w.fetch = async (_url, options) => {
  const req = JSON.parse(options.body);
  assert.equal(options.headers["x-zukait-session"],token,
    "Reception must reuse the existing workshop session");
  assert.equal(req.action,"reception");
  calls.push({role:w.me?.role,id:w.me?.id,operation:req.command.operation});
  const r = req.command.operation==="CAPABILITIES"
    ? {ok:true,allowed:w.me?.role==="Manager"||w.me?.role==="Supervisor",manager:w.me?.role==="Manager"}
    : req.command.operation==="LIST" ? {ok:true,rows:[]} : {ok:true};
  return {ok:true,json:async()=>r};
};
w.eval(source);
const settle = async () => {
  for (let i=0;i<15;i++) await new Promise(resolve=>setImmediate(resolve));
};
const trigger = async () => {w.zukaitReception.ensureCards();await settle();};
function buttons(id){return w.document.querySelectorAll("#"+id+" [data-rc-menu]");}
await trigger();
assert.equal(buttons("managerView").length,1);
assert.equal(buttons("supervisorView").length,0);
assert.equal(buttons("employeeView").length,0);
assert.equal(w.document.querySelector("#managerView").children[1].dataset.rcMenu,"1",
  "Manager Reception must be near header, not at dashboard bottom");
assert.equal(calls.filter(x=>x.operation==="CAPABILITIES").length,1);
await trigger();
assert.equal(buttons("managerView").length,1,"dashboard rerender cannot duplicate launcher");
buttons("managerView")[0].click();
await settle();
assert.equal(calls.filter(x=>x.operation==="LIST").length,1,"one-click Reception opens existing workspace");
assert.equal(w.document.querySelector("#rc-root h3")?.textContent,"Reception");
assert.equal(w.document.querySelector("#rc-root [data-rc-action=staff]")?.textContent,"Reception Access");

// Switching roles must remove stale buttons and recheck server identity.
w.document.getElementById("managerView").classList.add("hidden");
w.document.getElementById("supervisorView").classList.remove("hidden");
w.me = {id:"QA-SUP",role:"Supervisor",name:"Existing Supervisor"};
await trigger();
assert.equal(buttons("managerView").length,0);
assert.equal(buttons("supervisorView").length,1);
assert.equal(w.document.querySelector("#supervisorView").children[1].dataset.rcMenu,"1");
assert.equal(w.document.querySelectorAll("#rc-root [data-rc-action=staff]").length,1,
  "Manager-only permissions remain in the prior dialog until it is reopened");
buttons("supervisorView")[0].click();
await settle();
assert.equal(w.document.querySelector("#rc-root [data-rc-action=staff]"),null,
  "Supervisor cannot see Manager-only Reception Access");
assert.equal(calls.filter(x=>x.operation==="LIST").length,2);
assert.equal(calls.filter(x=>x.operation==="CAPABILITIES").length,2);

for(const role of ["Employee","Purchaser","Receptionist"]){
  w.me={id:"QA-"+role.toUpperCase(),role};
  await trigger();
  assert.equal(w.document.querySelectorAll("[data-rc-menu]").length,0,
    role+" must not have a workshop dashboard Reception launcher");
}
w.me=null;await trigger();
assert.equal(w.document.querySelectorAll("[data-rc-menu]").length,0);
dom.window.close();
console.log("Reception dashboard access: existing Manager/Supervisor sessions, one visible near-top launcher, role switch cleanup, Manager-only Access controls and dedicated Receptionist route passed.");
