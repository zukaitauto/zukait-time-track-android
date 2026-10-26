"""Prepare a clearly labelled Mechanical QA APK/web candidate, never production."""
import argparse, importlib.util, json, os, subprocess, sys
from pathlib import Path
sys.dont_write_bytecode=True

spec=importlib.util.spec_from_file_location('insurance_acceptance',Path(__file__).with_name('prepare-insurance-acceptance.py'))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
QA_REF='omqgkqknbdcnotabffek'
FLAGS=['ZUKAIT_MECHANICAL_ENABLED','ZUKAIT_MECHANICAL_QC_ENABLED','ZUKAIT_MECHANICAL_DELIVERY_ENABLED','ZUKAIT_MECHANICAL_DOCUMENTS_ENABLED','ZUKAIT_MECHANICAL_SIGNATURES_ENABLED','ZUKAIT_MECHANICAL_TRACKING_ENABLED','ZUKAIT_MECHANICAL_REPORTS_ENABLED']

def prepare(source,output,project,key,sha):
    if project!=QA_REF: raise ValueError('Mechanical acceptance must use the existing isolated QA project')
    result=base.prepare(source,output,project,key,sha);output=Path(output)
    injection='<script>'+''.join('window.'+flag+'=true;' for flag in FLAGS)+'</script>'
    for name in ['offline_test.html','mechanical_supervisor.html']:
        path=output/'app/src/main/assets'/name
        content=path.read_text();assert '</head>' in content
        path.write_text(content.replace('</head>',injection+'</head>',1))
        (output/'web'/name).write_text(path.read_text())
    manifest=output/'app/src/main/AndroidManifest.xml'
    manifest.write_text(manifest.read_text().replace('android:label="Zukait ACCEPTANCE"','android:label="Zukait Mechanical QA"'))
    (output/'web/index.html').write_text((output/'web/offline_test.html').read_text())
    result.update(mechanical_acceptance_only=True,production_activation=False,mechanical_client_flags=FLAGS)
    result['client_files']={str(p.relative_to(output)):base.digest(p) for p in sorted((output/'app').rglob('*')) if p.is_file()}
    (output/'acceptance-manifest.json').write_text(json.dumps(result,indent=2)+'\n')
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',type=Path,default=Path.cwd());parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    source=args.source.resolve();sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()
    if os.environ.get('GITHUB_REF')!='refs/heads/architecture-v2' or os.environ.get('GITHUB_SHA')!=sha: parser.error('Requires exact architecture-v2 GitHub Actions source')
    if subprocess.check_output(['git','status','--porcelain'],cwd=source,text=True).strip(): parser.error('Source must be clean')
    prepare(source,args.output,os.environ.get('ZUKAIT_ACCEPTANCE_PROJECT_REF',''),os.environ.get('ZUKAIT_ACCEPTANCE_PUBLISHABLE_KEY',''),sha)
    print('Prepared Mechanical QA-only source '+sha+'; production unchanged')
