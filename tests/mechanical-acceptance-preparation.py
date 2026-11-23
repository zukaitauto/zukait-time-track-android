import importlib.util,json,tempfile,os,contextlib,uuid,shutil,sys
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('mechanical_acceptance',ROOT/'scripts/prepare-mechanical-acceptance.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
tmp_root=Path(os.environ.get('ZUKAIT_TEST_TMPDIR',tempfile.gettempdir())).resolve()
@contextlib.contextmanager
def fixture_directory():
    # Synthetic build files need inherited workspace ACLs on Windows.
    path=tmp_root/('zukait-mechanical-qa-'+uuid.uuid4().hex)
    path.mkdir()
    try: yield path
    finally:
        assert path.resolve().is_relative_to(tmp_root) and path.name.startswith('zukait-mechanical-qa-')
        shutil.rmtree(path)
with fixture_directory() as tmp:
    assert Path(tmp).resolve().is_relative_to(tmp_root)
    output=Path(tmp)/'candidate'
    result=module.prepare(ROOT,output,module.QA_REF,'sb_publishable_DBp6FI8Z4ThAq_4LXrZXSg_Xw2uPPgO','a'*40)
    assert result['mechanical_acceptance_only'] and not result['production_activation']
    assert result['application_id']=='com.zukait.timetrack.acceptance' and result['updater_disabled']
    for name in ['offline_test.html','mechanical_supervisor.html']:
        html=(output/'app/src/main/assets'/name).read_text()
        for flag in module.FLAGS: assert 'window.'+flag+'=true;' in html
        assert html==(output/'web'/name).read_text()
    assert 'android:label="Zukait Mechanical QA"' in (output/'app/src/main/AndroidManifest.xml').read_text()
    assert (output/'web/index.html').read_text()==(output/'web/offline_test.html').read_text()
    assert json.loads((output/'acceptance-manifest.json').read_text())['source_sha']=='a'*40
    for project in ['pjknotnjkufadqavcmii','otherprojectreference']:
        try: module.prepare(ROOT,Path(tmp)/project,project,'sb_publishable_TEST','a'*40)
        except ValueError: pass
        else: raise AssertionError('Unexpected QA project accepted')
print('PASS Mechanical acceptance preparation: exact isolated project, separate labelled APK, disabled updater, QA-only flags, matching web assets, hashes and production denial.')
