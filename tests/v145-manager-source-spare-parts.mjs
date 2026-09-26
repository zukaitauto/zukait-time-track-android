import fs from'node:fs';import assert from'node:assert/strict';
const s=fs.readFileSync('app/src/main/assets/v67_updates.js','utf8');
const start=s.indexOf('function renderManager67()'),end=s.indexOf('</div></section>',start);
const block=s.slice(start,end);
for(const label of ['Today Jobs','Working Now','Not Started','Paused','Consumables','Completed Today','Repeat Work','Waiting / ID001','Spare Parts'])assert.ok(block.includes(label),label+' missing from source Manager Workshop Control renderer');
assert.ok(block.indexOf('Spare Parts')>block.indexOf('Waiting / ID001'),'Spare Parts must be ninth card / fifth-row first column');
assert.match(block,/data-v2-manager-spare-parts="1"/);
assert.match(block,/v150OpenManagerSpareParts\(\)/);
console.log('V145 Manager source Spare Parts card guard passed');