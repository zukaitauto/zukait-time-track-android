import fs from 'node:fs';
import assert from 'node:assert/strict';
const suite=fs.readFileSync('tests/v215-spare-parts-entry-regression.mjs','utf8');
const prefix=suite.slice(0,suite.indexOf('\ntest('));
const {fixture}=await import('data:text/javascript;base64,'+Buffer.from(prefix+'\nexport {fixture};').toString('base64'));
for(const role of ['Supervisor','Manager']){
 const f=fixture(role);
 for(const row of f.serverRows){if(row.payload?.listNo){row.payload.vehicle='Toyota Corolla';row.payload.model='Corolla';}}
 await f.parts.open();const html=f.html();
 assert.match(html,/data-sp-card="INVOICE"/);assert.match(html,/data-sp-card="SUBLET"/);
 assert.match(html,/Parts needing invoice/);assert.match(html,/Job cards with sublet/);
 assert.match(html,/zukaitSublet.open\(\)/);assert.match(html,/openInvoiceEntry\(\)/);
 assert.ok(html.indexOf('data-sp-card="WAITING"')<html.indexOf('data-sp-card="PURCHASE_COMPLETED"'));
 assert.doesNotMatch(html,/Toyota Corolla · Corolla/,'recent vehicle model is not repeated');
 assert.equal(f.commits.length,0,'opening dashboard never writes workshop data');
}
const pur=fixture('Purchaser');await pur.parts.open();assert.match(pur.html(),/v2-sp-purchaser-liquid/);assert.equal(pur.commits.length,0);
const source=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
for(const name of ['pendingVehicleLabel','spareRecentRows']){
 assert.ok(source.includes('function '+name+'('));
}
const css=fs.readFileSync('app/src/main/assets/dashboard_cards.css','utf8');
for(const file of ['offline_test.html','receptionist.html','accountant.html'])assert.match(fs.readFileSync('app/src/main/assets/'+file,'utf8'),/href="dashboard_cards.css\?v=1"/);
assert.match(css,/prefers-reduced-motion/);assert.match(css,/@media print/);
console.log('Shared dashboard cards: Manager/Supervisor actions, role-specific Purchaser UI, readable count labels, priority order, deduplicated model and read-only behavior passed.');
