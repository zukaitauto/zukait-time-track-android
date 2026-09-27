import fs from 'node:fs';
import assert from 'node:assert/strict';

const p='app/src/main/assets/v2/features/spare-parts/main_module.js';
const src=fs.readFileSync(p,'utf8');

assert.match(src,/function isPartPending\(item\)/,'Parts Pending must have one authoritative pending predicate');
assert.match(src,/PENDING_DONE=new Set\(\['SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED','CUSTOMER_SETTLEMENT'\]\)/,'Supervisor verified receipt must remove a part from pending');
assert.doesNotMatch(src,/PENDING_DONE=new Set\([^\n]*'RECEIVED'/,'Purchaser Arrived/RECEIVED must remain pending until Supervisor verifies receipt');
assert.match(src,/function pendingLists\(rows=read\(\)\)/,'Pending view must derive from full Parts List history without deleting it');
assert.match(src,/sort\(\(a,b\)=>b\.oldestDays-a\.oldestDays/,'Oldest pending vehicles must be surfaced first');
assert.match(src,/Search by Registration \/ Job Card/,'Pending view must support registration and Job Card search');
assert.match(src,/PARTS PENDING LIST/g,'Pending detail/print must be clearly distinguished from the full Parts List');
assert.match(src,/printPendingList/,'Pending list must support Print/PDF');
assert.match(src,/whatsAppPendingList/,'Pending list must support WhatsApp');
assert.match(src,/Arrived – Awaiting Supervisor/,'Arrived items must visibly wait for Supervisor confirmation');
assert.match(src,/Vehicles Pending/);
assert.match(src,/Parts Pending/);
assert.match(src,/Arrived – Awaiting Confirmation/);
assert.match(src,/Oldest Pending/);

const dashboardMatches=(src.match(/\['🔎','Parts Pending',pendingSummary\(rows\)\.parts,'PENDING'\]/g)||[]).length;
assert.ok(dashboardMatches>=2,'Manager and Supervisor dashboards must expose Parts Pending');
assert.match(src,/onclick="zukaitV2\.sparePartsMain\.openPartsPending\(\)"[^>]*><span>🔎<\/span><b>Parts Pending<\/b>/,'Purchaser dashboard must expose Parts Pending');
assert.match(src,/\['Manager','Supervisor','Purchaser'\]\.includes\(role\(\)\)/,'Pending follow-up must be available to all three operational roles');

console.log('Parts Pending follow-up regression passed');
