import fs from'node:fs';import assert from'node:assert/strict';import vm from'node:vm';const s={window:{},Date};vm.createContext(s);for(const f of['ui-theme.js','screens.js','standalone-ui.js'])vm.runInContext(fs.readFileSync('app/src/main/assets/v2/features/spare-parts/'+f,'utf8'),s);const p=s.window.zukaitV2.spareParts;
const sup=p.standaloneUI.dashboard('Supervisor',{WAITING:12});assert.match(sup,/Create Parts List/);assert.match(sup,/Parts Waiting/);assert.match(sup,/>12</);
const pur=p.standaloneUI.dashboard('Purchaser');assert.match(pur,/Quotation/);assert.match(pur,/Returns \/ Problems/);
const man=p.standaloneUI.dashboard('Manager');assert.match(man,/Purchase Reports/);
const rows=p.standaloneUI.compactRows([{createdAt:'2026-09-25',number:'PL-0001',jobCard:'JC2451',make:'Toyota',model:'Land Cruiser',year:'2022'}]);assert.match(rows,/PL-0001/);assert.match(rows,/Toyota Land Cruiser/);
const css=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/standalone.css','utf8');assert.match(css,/@media\(min-width:900px\)/);assert.match(css,/@media\(max-width:640px\)/);assert.match(css,/@media print/);
console.log('Responsive Spare Parts standalone UI: ok');