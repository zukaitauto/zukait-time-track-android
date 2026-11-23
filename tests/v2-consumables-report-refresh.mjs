import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const ui=fs.readFileSync(new URL('../app/src/main/assets/consumables_ui.js',import.meta.url),'utf8');
const cloud=fs.readFileSync(new URL('../app/src/main/assets/cloud_sync.js',import.meta.url),'utf8');

test('manager report refreshes before computing cached finalized consumption',()=>{
 assert.match(ui,/onclick="consRefreshAndRunReports\(\)">View Report/);
 assert.match(ui,/window\.consRefreshAndRunReports=async function\(\)/);
 assert.match(ui,/await window\.zukaitCloud\.syncNow\(\)/);
 assert.match(ui,/if\(syncResult!==true\)throw/);
 assert.match(ui,/consRunReports\(\);/);
});
test('offline and failed sync do not generate an apparent zero-cost report',()=>{
 assert.match(ui,/Report not generated: offline/);
 assert.match(ui,/Report not generated: server refresh failed/);
 assert.match(ui,/consReportRefreshPending/);
 assert.match(cloud,/return refreshed===true&&!cloudDirty/);
});
test('consumables report dates use Oman UTC plus four hours',()=>{
 assert.match(ui,/new Date\(n\+4\*3600000\)\.toISOString\(\)\.slice\(0,10\)/);
});
