import fs from 'node:fs';import assert from 'node:assert/strict';
const m=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
assert.match(m,/function openManagerReport\(\)\{if\(role\(\)!=='Manager'\)/);
assert.match(m,/Spare Parts Report/);
assert.match(m,/v2SpReportFrom/);assert.match(m,/v2SpReportTo/);assert.match(m,/v2SpReportSearch/);assert.match(m,/v2SpReportStatus/);
assert.match(m,/Recorded Cost/);assert.match(m,/Total Qty/);assert.match(m,/new Set\(rows\.map\(r=>r\.listNo\)\)\.size/);
assert.match(m,/role\(\)==='Manager'\?'<button class="blue"/);
assert.match(m,/openManagerReport,renderManagerReport,reportRows/);
console.log('Manager Spare Parts report: role guard, filters and totals ok');