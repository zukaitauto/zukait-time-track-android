#!/usr/bin/env bash
set -euo pipefail
node --check app/src/main/assets/cloud_sync.js
node --check app/src/main/assets/consumables.js
node --check app/src/main/assets/consumables_ui.js
node --check app/src/main/assets/paint_module.js
node --check app/src/main/assets/secure_auth.js
node --check app/src/main/assets/production_pilot.js
node --check app/src/main/assets/professional_ux.js
node --check app/src/main/assets/v54_improvements.js
node --check app/src/main/assets/v63_updates.js
node --check app/src/main/assets/v65_updates.js
node --check app/src/main/assets/v66_updates.js
node --check app/src/main/assets/v67_updates.js
node --check app/src/main/assets/v68_updates.js
node --check app/src/main/assets/v69_updates.js
node --check app/src/main/assets/v74_updates.js
node --check app/src/main/assets/supervisor_stable.js
node --check app/src/main/assets/live_status_authority.js
node --check app/src/main/assets/workshop_overview.js
node --check app/src/main/assets/dashboard_diagnostics.js
node --check app/src/main/assets/job_cost_summary_v128.js
node --check app/src/main/assets/v2/core/event_contract.js
node --check app/src/main/assets/v2/core/live_selectors.js
node --check app/src/main/assets/v2/core/offline_queue.js
node --check app/src/main/assets/v2/core/event_parity.js
node --check app/src/main/assets/v2/core/reconnect_authority.js
node --check app/src/main/assets/v2/core/reconnect_shadow_audit.js
node --check app/src/main/assets/v2/core/authority_adapter.js
node --check app/src/main/assets/v2/core/reconcile_runtime.js
node --check app/src/main/assets/v2/core/pilot_activation.js
node --check app/src/main/assets/v2/core/data_paths.js
node --check app/src/main/assets/v2/features/jobcards/workflow.js
node --check app/src/main/assets/v2/features/spare-parts/workflow.js
node --check app/src/main/assets/v2/features/spare-parts/main_module.js
node --check app/src/main/assets/v2/features/estimate/main_module.js
node --check app/src/main/assets/v2/features/notifications/rules.js
node --check app/src/main/assets/v2/features/reports/service.js
node --check app/src/main/assets/v2/features/leave/rules.js
node --check app/src/main/assets/v2/features/time/work_rules.js
node --check app/src/main/assets/v2/features/time/work_events.js
python - <<'PY'
from pathlib import Path
import re
html = Path('app/src/main/assets/offline_test.html').read_text(encoding='utf-8')
scripts = re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>', html, flags=re.S|re.I)
out = Path('/tmp/zukait-inline-js')
out.mkdir(parents=True, exist_ok=True)
for i, script in enumerate(scripts):
    (out / f'inline_{i:02d}.js').write_text(script, encoding='utf-8')
print(f'Extracted {len(scripts)} inline script blocks')
PY
for f in /tmp/zukait-inline-js/*.js; do
  node --check "$f"
done

node --check app/src/main/assets/qc_delivery.js
node --check app/src/main/assets/qc_delivery_rules.js

node --check app/src/main/assets/technician_workload.js

node --check app/src/main/assets/time_management.js
node --check app/src/main/assets/time_management_rules.js

