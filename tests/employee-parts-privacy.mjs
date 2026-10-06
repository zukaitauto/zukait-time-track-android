import fs from 'node:fs';import assert from 'node:assert/strict';
const src=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
const start=src.indexOf('function employeePartStatus('),end=src.indexOf('async function openList(',start),view=src.slice(start,end);
assert.ok(start>=0&&end>start,'employee parts-only renderer must exist');
assert.match(src,/if\(denterView\(\)\)return employeePartsListView\(r\)/,'Denter/employee must be routed to restricted renderer');
assert.match(view,/Part Name/);assert.match(view,/Status/);assert.match(view,/'Arrived':'Pending'/);
for(const forbidden of ['Agreed Price','Final Price','Total Final Price','OMR','quoteAmount','purchaseAmount','supplierCost','billAmount'])assert.doesNotMatch(view,new RegExp(forbidden),forbidden+' must not appear in employee Parts List renderer');
console.log('Employee Parts List exposes only part name and Pending/Arrived status');
