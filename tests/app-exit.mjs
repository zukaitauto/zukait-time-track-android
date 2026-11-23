import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');
const assets = 'app/src/main/assets/';
const exit = read(assets + 'app_exit.js');
const updates = read(assets + 'v74_updates.js');
const account = read(assets + 'v65_updates.js');
const page = read(assets + 'offline_test.html');
for (const source of [exit, updates, account]) new vm.Script(source);
assert.match(page, /<script src="app_exit\.js\?v=1"><\/script>/);

function between(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'menu source boundaries exist');
  return source.slice(a, b);
}
const menus = [
  ['Employee', 'v84EmployeeAccount', between(updates, 'window.v84EmployeeAccount=function()', 'window.v84EmployeeLeave=function()')],
  ['Supervisor', 'v65OpenAccount', between(updates, 'window.v65OpenAccount=function()', 'function leaveToday()')],
  ['Purchaser', 'v65OpenAccount', between(updates, 'window.v65OpenAccount=function()', 'function leaveToday()')],
  ['Manager', 'v111OpenManagerMenu', updates.split('\n').find(line => line.includes('window.v111OpenManagerMenu=function()'))],
  ['Supervisor', 'openSupervisorHeaderMenu', page.split('\n').find(line => line.startsWith('function openSupervisorHeaderMenu()'))],
  ...['Employee', 'Supervisor', 'Manager', 'Purchaser'].map(role => [role, 'v65OpenAccount', between(account, 'window.v65OpenAccount=function()', 'window.v65OpenAbout=function()')])
];
function context(role = 'Employee') {
  const ctx = {
    me: {id: 'test', name: 'Test User', role},
    state: {sessions: [{id: 'running', start: 1000, end: null}]},
    savedToken: 'kept-token', html: '', alerts: [], calls: 0, confirms: 0, accept: false,
    document: {createElement: () => ({}), head: {appendChild() {}}},
    esc: String,
    openModal(html) {ctx.html = html;},
    showSupervisorModal(title, html) {ctx.html = html;},
    confirm() {ctx.confirms++; return ctx.accept;},
    alert(message) {ctx.alerts.push(message);},
    logout() {throw new Error('Exit must preserve authentication');},
    AndroidBridge: {exitApp() {ctx.calls++;}}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(exit, ctx);
  return ctx;
}
for (const [role, name, source] of menus) {
  const ctx = context(role);
  vm.runInContext(source, ctx);
  ctx[name]();
  const buttons = [...ctx.html.matchAll(/<button\b[^>]*onclick="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)]
    .filter(match => /EXIT APP/i.test(match[2].replace(/<[^>]*>/g, '')));
  assert.equal(buttons.length, 1, `${role}/${name}: one Exit App action`);
  const state = JSON.stringify(ctx.state), user = ctx.me;
  vm.runInContext(buttons[0][1], ctx);
  assert.equal(ctx.calls, 0, 'Cancel keeps app open');
  assert.equal(ctx.confirms, 1);
  ctx.accept = true;
  vm.runInContext(buttons[0][1], ctx);
  assert.equal(ctx.calls, 1, 'Confirm reaches native exit');
  vm.runInContext(buttons[0][1], ctx);
  assert.equal(ctx.calls, 1, 'Repeated taps cannot close twice');
  assert.equal(ctx.confirms, 2);
  assert.equal(ctx.me, user);
  assert.equal(ctx.savedToken, 'kept-token');
  assert.equal(JSON.stringify(ctx.state), state, 'Work sessions are untouched');
}
for (const bridge of [undefined, {getAppVersion() {return 'V301';}}]) {
  const ctx = context(); ctx.AndroidBridge = bridge; ctx.accept = true;
  assert.equal(ctx.zukaitExitApp(), false);
  assert.equal(ctx.confirms, 0, 'Browser/older APK does not offer a false exit confirmation');
  assert.equal(ctx.alerts.length, 1);
  assert.match(ctx.alerts[0], /updated Android app/);
}
const retry = context(); retry.accept = true;
retry.AndroidBridge.exitApp = () => {throw new Error('bridge unavailable');};
assert.equal(retry.zukaitExitApp(), false);
assert.equal(retry.alerts.length, 1);
retry.AndroidBridge.exitApp = () => {retry.calls++;};
assert.equal(retry.zukaitExitApp(), true);
assert.equal(retry.calls, 1, 'Bridge failure permits retry');
const native = read('app/src/main/java/com/zukait/timetrack/MainActivity.java');
assert.match(native, /@JavascriptInterface\s+public void exitApp\(\)\s*\{\s*runOnUiThread\(\(\) -> \{\s*if \(!isFinishing\(\) && !isDestroyed\(\)\) finishAndRemoveTask\(\);/);
console.log('PASS: all four dashboard roles and fallback menus, cancel/confirm, repeat taps, preserved login/timers, older APK/browser and retry.');
