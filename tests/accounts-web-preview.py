import importlib.util, pathlib, tempfile, json, hashlib
s=importlib.util.spec_from_file_location('preview','scripts/accounts-preview/site.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
 target=pathlib.Path(d);data={'index.html':b'original workshop','accountant.js':b'original accounts','nested/a.js':b'original nested'}
 record={'files':{k:hashlib.sha256(v).hexdigest() for k,v in data.items()}}
 raw=json.dumps(record).encode();m.preserve(target,record,raw,data.__getitem__)
 for k,v in data.items(): assert (target/k).read_bytes()==v
 m.preview(target,pathlib.Path('app/src/main/assets'),'f'*40)
 for k,v in data.items(): assert (target/k).read_bytes()==v
 html=(target/m.PREFIX/'accountant.html').read_text()
 assert "connect-src 'none'" in html and 'session_privacy.js' not in html
 assert 'sandbox="allow-scripts"' in (target/m.PREFIX/'index.html').read_text()
 assert (target/'release-integrity.json').read_bytes()==raw
 try: m.preserve(target,record,raw,lambda _:b'changed')
 except ValueError: pass
 else: raise AssertionError('source drift accepted')
 for path in ['../bad','/bad','https:bad','a\\b']:
  try:m.safe_path(path)
  except ValueError:pass
  else:raise AssertionError('unsafe path accepted')
print('PASS additive preview preserves workshop bytes; rejects drift and unsafe paths; sandbox and no-network CSP required.')
