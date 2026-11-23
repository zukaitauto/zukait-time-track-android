import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
assert.doesNotMatch(html,/<\/script>\\n<script/,'literal escaped newline between script tags can render on login screen');
assert.match(html,/<div id="login" class="card">/);
assert.match(html,/<div id="app" class="hidden">/);
console.log('Login page has clean script separators and intact visibility shell: ok');