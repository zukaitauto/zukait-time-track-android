import fs from'node:fs';import assert from'node:assert/strict';
const src=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
assert.equal((src.match(/\\\\n/g)||[]).length,0,'v74 Manager/UI source must not contain double-escaped newline text that renders as \\n');
assert.match(src,/Confirm Leave\\n\\nStaff:/,'Manager leave confirmation must use real JS newline escapes');
assert.match(src,/ZUKAIT AUTO - Leave Report\\n/,'Manager Leave report must use real JS newline escapes');
console.log('V145 Manager visible-newline guard passed');