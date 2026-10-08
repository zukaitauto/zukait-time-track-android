#!/usr/bin/env bash
set -euo pipefail
while IFS= read -r -d '' source_file; do
  node --check "$source_file"
done < <(find app/src/main/assets -type f -name '*.js' -print0)
node --input-type=module - <<'JS'
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
let count=0;
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(/\bsrc=/.test(m[1])||!m[2].trim())continue;
  new vm.Script(m[2]); count++;
}
console.log(`Inline JavaScript validated: ${count} scripts`);
JS
