import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const java=fs.readFileSync('app/src/main/java/com/zukait/timetrack/MainActivity.java','utf8');
const handoff=java.slice(java.indexOf('    private boolean openDownloadedUpdateWithSystemInstaller()'),java.indexOf('    private void installDownloadedUpdateWithPackageInstaller()'));
assert.doesNotMatch(handoff,/getPackageManager\(\)\.resolveActivity/,'package visibility must not preempt a valid installer launch');
assert.match(handoff,/FLAG_GRANT_READ_URI_PERMISSION/);assert.match(handoff,/setClipData/);assert.match(handoff,/startActivity\(install\)/);
const result=java.slice(java.indexOf('    private void handleUpdateInstallResult('),java.indexOf('    @Override\n    protected void onNewIntent('));
assert.doesNotMatch(result,/installDownloadedUpdateWithPackageInstaller\(\)/,'a failed/cancelled installer must not loop into a new session');
const source=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8'),start=source.indexOf(' window.v77UpdateDownloadStatus=function('),end=source.indexOf('\n const css=',start);assert.ok(start>0&&end>start);
const elements=new Map();for(const id of ['v77ProgressWrap','v77ProgressBar','v77ProgressPct','v77ProgressText','v77UpdateState','v77DownloadBtn','v77InstallBtn'])elements.set(id,{style:{},textContent:'',innerHTML:'',disabled:false});
const ctx={window:{},document:{getElementById:id=>elements.get(id)},E:String};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
const notify=(s,msg)=>ctx.window.v77UpdateDownloadStatus(s,100,10,10,msg);
notify('SYNCING','Saving changes');assert.equal(elements.get('v77UpdateState').textContent,'Saving changes');assert.equal(elements.get('v77InstallBtn').disabled,true);
for(const [status,message] of [['SYNC_REQUIRED','Server sync failed; changes preserved'],['PERMISSION_REQUIRED','Allow unknown app installs'],['INSTALL_DIAGNOSTIC','Installer unavailable']]){notify(status,message);assert.equal(elements.get('v77InstallBtn').disabled,false);assert.ok((elements.get('v77UpdateState').textContent+elements.get('v77UpdateState').innerHTML).includes(message));}
notify('COMPLETE','Ready');assert.equal(elements.get('v77InstallBtn').disabled,false);assert.equal(elements.get('v77InstallBtn').textContent,'INSTALL UPDATE');
console.log('Installer handoff: direct visibility-safe intent, read grant, no failure loop, sync/permission diagnostics and completed-download retry passed');
