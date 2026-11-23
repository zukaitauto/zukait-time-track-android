import fs from 'node:fs';import assert from 'node:assert/strict';
const h=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
assert.match(h,/V167 LOGIN SCREEN AUTHORITY/);
assert.match(h,/#login \.grid\{grid-template-columns:1fr/);
assert.match(h,/#login input\{display:block;width:100%;box-sizing:border-box/);
assert.match(h,/#login \.password-wrap\{display:flex;width:100%;min-width:0/);
assert.match(h,/html,body\{min-height:100%;overflow-x:hidden\}/);
assert.doesNotMatch(h,/<\/script>\\n<script/);
console.log('Mobile login layout and artifact guards: ok');