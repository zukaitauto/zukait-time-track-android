import fs from 'node:fs';import assert from 'node:assert/strict';
const m=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
assert.match(m,/function openManagerReport\(\)\{if\(role\(\)!=='Manager'\)/);
assert.match(m,/Spare Parts Report/);
assert.match(m,/v2SpReportFrom/);assert.match(m,/v2SpReportTo/);assert.match(m,/v2SpReportSearch/);assert.match(m,/v2SpReportStatus/);
assert.match(m,/Recorded Amount/);assert.match(m,/Total Qty/);assert.match(m,/Fitted Qty/);assert.match(m,/Returned Qty/);assert.match(m,/Unavailable Qty/);assert.match(m,/without assuming unit vs line pricing/);assert.match(m,/new Set\(rows\.map\(r=>r\.listNo\)\)\.size/);
assert.match(m,/role\(\)==='Manager'\?'<button class="blue"/);
assert.match(m,/openManagerReport,renderManagerReport,reportRows/);
console.log('Manager Spare Parts report: role guard, filters and totals ok');
assert.match(m,/Print \/ PDF/);assert.match(m,/shareManagerReport/);assert.match(m,/navigator\.share/);assert.match(m,/printManagerReport/);assert.match(m,/>Back<\/button>/);

assert.match(m,/function filteredReportRows\(\)/);assert.match(m,/function managerReportText\(\)\{const rows=filteredReportRows\(\)/);assert.match(m,/function renderManagerReport\(\)\{if\(role\(\)!=='Manager'\)return;const rows=filteredReportRows\(\)/);assert.match(m,/From '\+f\.from/);

assert.match(m,/function reportActivityAt\(item,list\)/);assert.match(m,/item\?\.fittedAt/);assert.match(m,/item\?\.returnedAt/);assert.match(m,/item\?\.receivedAt/);assert.match(m,/r\.activityAt\|\|r\.createdAt/);assert.match(m,/Activity Date/);

const reports=fs.readFileSync('app/src/main/assets/v2/features/reports/service.js','utf8');assert.match(reports,/'SPARE_PARTS'/);assert.match(m,/loadAuthoritativeManagerReport/);assert.match(m,/svc\.page\('SPARE_PARTS'/);assert.match(m,/local-fallback/);assert.match(m,/Data source:/);

assert.match(m,/function normalizeReportRow\(r=\{\}\)/);assert.match(m,/r\.list_no/);assert.match(m,/r\.job_card/);assert.match(m,/r\.purchase_amount/);assert.match(m,/do\{const r=await svc\.page\('SPARE_PARTS',\{cursor,limit:500/);assert.match(m,/while\(cursor&&pages<20\)/);assert.match(m,/server-capped-10000/);
