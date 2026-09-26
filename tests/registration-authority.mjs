import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../app/src/main/assets/registration_authority.js',import.meta.url),'utf8');const ctx={window:{}};vm.createContext(ctx);vm.runInContext(src,ctx);const R=ctx.window.zukaitRegistration;
for(const v of ['6295 AB','6295AB','6295 / AB','6295-AB','6295.AB','6 2 9 5 A B','6295 ab'])assert.equal(R.key(v),'6295AB');
assert.equal(R.same('6295 / AB','6295AB'),true);assert.equal(R.key(''), '');console.log('registration authority tests passed');
