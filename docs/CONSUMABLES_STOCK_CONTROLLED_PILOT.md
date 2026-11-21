# Consumables stock controlled pilot

Use a separate non-production project with the architecture-v2 staff session and consumables master schema. No production deployment is part of this change.

Apply the staged SQL in this order: COMPACT_FOUNDATION, COMPACT_RPC, MASTER_LINK, LEGACY_PREVIEW, REPORTS. The scripts are under `supabase/staged/CONSUMABLES_STOCK_*.sql`. Enable `ZUKAIT_STOCK_ENABLED`, `ZUKAIT_STOCK_WRITES_ENABLED` and `ZUKAIT_STOCK_MASTER_LINK_ENABLED` only in the pilot backend. For the isolated build, configure the API URL and matching publishable key in `cloud_sync.js` and the authentication URL and matching key in `secure_auth.js`. Verify both target the non-production project before allowing writes. Run `npm ci` and `npm run test:consumables:stock`. Serve the pilot web build against that backend and append `?stockPilot=1` to its app URL. The ordinary app entry remains a preview. Mechanical stock integration stays off.

Use Manager to link one saved material/brand pair, enter its physically counted opening stock, add a purchase and post a counted adjustment with a reason. Use Supervisor to read balance, history and reports and add a purchase. The Supervisor must be denied opening and adjustment. Verify that an employee and a revoked session cannot access stock. A new pair starts at zero, and linking it leaves saved prices and costing intact.

Reconcile physical minus reserved to available. Check that average cost equals stock value divided by physical quantity and that valuation includes every pair, including rows outside the first balance page. Compare old costing, prices and audit records before and after the test. Check contrast and focus on Android and web before promoting the branch.

## Android pilot

From the committed pilot branch, set `ZUKAIT_STOCK_PILOT_PROJECT_REF` and `ZUKAIT_STOCK_PILOT_PUBLISHABLE_KEY` for the isolated project above. Run `node scripts/prepare-consumables-stock-android-pilot.mjs`. It prints a temporary source directory. With Java 17, Gradle 8.9 and Android SDK 35 installed, run `gradle --no-daemon -p "$pilot_dir" assembleDebug`, where `pilot_dir` is that printed path. The debug APK is under `app/build/outputs/apk/debug/` in that directory.

Install **Zukait Stock Pilot** alongside the ordinary app and sign in with pilot accounts. Pilot sign-in and sync target the same isolated project, and release updates are disabled in the pilot build. Use sample stock only. Remove the temporary directory when finished.
