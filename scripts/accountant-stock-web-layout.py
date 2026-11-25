"""Accountant Stock web layout update; retain all other V421 assets and APK."""
import importlib.util, json, pathlib, subprocess, sys, time, concurrent.futures
from urllib.parse import quote
spec=importlib.util.spec_from_file_location("base_repair",pathlib.Path(__file__).with_name("accountant-stock-web-repair.py"))
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
PATCH=("accountant.html","accountant.js","accountant_stock.js")
BASELINE="8e4c0f99dd6e80bb88a5f1dce189b4464c500b84"
def baseline(name):
    return subprocess.check_output(["git","show",BASELINE+":app/src/main/assets/"+str(b.safe(name))])
def candidate():
    return subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip()
def prepare():
    b.check_updater()
    b.require(not b.SITE.exists(),"Refuse to overwrite staging")
    raw=b.fetch("release-integrity.json"); record=json.loads(raw); b.check_record(record)
    previous=record.get("accountantStockWebUpdate",{})
    b.require(previous.get("sourceCommit")==BASELINE and previous.get("apkUnchanged") is True,"Unexpected live Accountant layout baseline")
    evidence=json.loads(pathlib.Path("docs/accountant-stock-backend-deployment.json").read_text())
    b.require(evidence.get("project")=="pjknotnjkufadqavcmii" and evidence.get("verified") is True and evidence.get("databaseMigrationApplied") is True and isinstance(evidence.get("backendVersion"),int) and evidence["backendVersion"]>153,"Matching production backend has not been verified")
    b.SITE.mkdir();b.EVIDENCE.mkdir(parents=True,exist_ok=True)
    original=dict(record["files"])
    def preserve(entry):
        name,sha=entry;data=b.fetch(quote(name,safe="/"))
        b.require(b.digest(data)==sha,"Live asset drift: "+name)
        dest=b.SITE/b.safe(name);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(preserve,original.items()))
    source=candidate()
    for name in PATCH:
        b.require(original.get(name)==b.digest(baseline(name)),"V421 Accountant layout baseline differs: "+name)
        data=pathlib.Path("app/src/main/assets",name).read_bytes()
        b.require(data==subprocess.check_output(["git","show",source+":app/src/main/assets/"+name]),"Uncommitted source: "+name)
        (b.SITE/name).write_bytes(data);record["files"][name]=b.digest(data)
    urls=b.dependencies((b.SITE/"accountant.html").read_bytes())
    for name in urls:
        b.require(name in record["files"] and b.digest((b.SITE/name).read_bytes())==record["files"][name],"Missing Accountant dependency: "+name)
    b.require(set(record["files"])==set(original),"Unexpected file additions or removals")
    b.require(all(record["files"][n]==sha for n,sha in original.items() if n not in PATCH),"Unrelated asset changed")
    record["accountantStockWebUpdate"]={"sourceCommit":source,"files":{n:record["files"][n] for n in PATCH},"apkUnchanged":True}
    (b.SITE/"release-integrity.json").write_text(json.dumps(record,indent=2)+"\n");(b.SITE/".nojekyll").touch()
    (b.EVIDENCE/"original-manifest.json").write_bytes(raw)
    (b.EVIDENCE/"repair.json").write_text(json.dumps(record["accountantStockWebUpdate"],indent=2)+"\n")
def verify():
    b.check_updater()
    record=json.loads((b.SITE/"release-integrity.json").read_text());b.check_record(record)
    original=json.loads((b.EVIDENCE/"original-manifest.json").read_bytes())
    b.require(record["accountantStockWebUpdate"]["sourceCommit"]==candidate(),"Candidate changed")
    b.require(all(record["files"].get(n)==sha for n,sha in original["files"].items() if n not in PATCH),"Unrelated asset changed")
    checks={quote(n,safe="/"):sha for n,sha in record["files"].items()}
    checks["release-integrity.json"]=b.digest((b.SITE/"release-integrity.json").read_bytes())
    for name,links in b.dependencies((b.SITE/"accountant.html").read_bytes()).items():
        for link in links:checks[link]=record["files"][name]
    def check(entry):
        name,sha=entry;b.require(b.digest(b.fetch(name))==sha,"Public asset mismatch: "+name)
    for attempt in range(12):
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(check,checks.items()))
            break
        except Exception:
            if attempt==11:raise
            time.sleep(10)
    (b.EVIDENCE/"verified.json").write_text(json.dumps({"verified":len(checks),"sourceCommit":candidate(),"apkUnchanged":True,"productionWrites":False},indent=2)+"\n")
if __name__=="__main__":{"prepare":prepare,"verify":verify}[sys.argv[1]]()
