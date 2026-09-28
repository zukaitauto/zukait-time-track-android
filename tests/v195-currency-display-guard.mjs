import fs from 'node:fs';import assert from 'node:assert/strict';
const files=[
'app/src/main/assets/v74_updates.js',
'app/src/main/assets/job_cost_summary_v128.js',
'app/src/main/assets/consumables_ui.js',
'app/src/main/assets/paint_module.js',
'app/src/main/assets/v2/features/spare-parts/main_module.js',
'app/src/main/assets/v2/features/estimate/main_module.js',
'app/src/main/assets/workshop_overview.js'
];
for(const file of files){const src=fs.readFileSync(file,'utf8');assert.equal(src.includes('⃄'),false,file+' must not use unsupported OMR glyph');}
console.log('Currency display guard passed: production money views use text OMR, not unsupported glyph');
