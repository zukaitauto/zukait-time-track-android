// Pure offline reader splice. Does not contact Supabase or modify production.
import assert from 'node:assert/strict';

export function historyReaderRegion(source) {
  assert.equal(typeof source,'string','Source must be UTF-8 text');
  const tag='async function baseStateForRevision(';
  const marker='// FINAL_SESSION_STATUS_BEGIN';
  const start=source.indexOf(tag);
  const end=source.indexOf(marker,start);
  assert.ok(start>0&&end>start,'History reader anchor or boundary missing');
  assert.equal(source.indexOf(tag,start+1),-1,'Ambiguous history-reader function');
  assert.equal(source.indexOf(marker,end+marker.length),-1,'Ambiguous history-reader boundary');
  return {start,end,text:source.slice(start,end)};
}

export function assembleReaderCandidate(baseline,readerSource) {
  assert.ok(baseline&&Array.isArray(baseline.files),'Source bundle files required');
  const names=baseline.files.map(file=>file.name);
  assert.equal(new Set(names).size,names.length,'Duplicate baseline files');
  const original=baseline.files.find(file=>file.name==='index.ts');
  assert.ok(original&&typeof original.content==='string','Source handler missing');
  const target=historyReaderRegion(original.content);
  const replacement=historyReaderRegion(readerSource);
  assert.match(replacement.text,/ZUKAIT_HISTORY_READER_COMPAT/,'Reader must remain opt-in only');
  assert.match(replacement.text,/admin\.from\("workshop_state_history"\)/,'Legacy fallback required');
  const candidate=structuredClone(baseline);
  candidate.files.find(file=>file.name==='index.ts').content=
    original.content.slice(0,target.start)+replacement.text+original.content.slice(target.end);
  assert.equal(candidate.files.find(file=>file.name==='index.ts').content.slice(0,target.start),
    original.content.slice(0,target.start),'Non-reader prefix changed');
  assert.ok(candidate.files.find(file=>file.name==='index.ts').content.endsWith(
    original.content.slice(target.end)),'Non-reader suffix changed');
  assert.deepEqual(candidate.files.filter(file=>file.name!=='index.ts'),
    baseline.files.filter(file=>file.name!=='index.ts'),'Supporting modules must remain byte-identical');
  return candidate;
}
