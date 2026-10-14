import subprocess
import sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]


def test_release_import_verifies_native_model_without_training_or_mutating_source():
    artifact = ROOT/'.local/ai/catboost/model.cbm'
    if not artifact.exists(): pytest.skip('Private lecturer model not distributed')
    original = artifact.read_bytes()
    result = subprocess.run([sys.executable, '-B', '-m', 'ai.install_catboost', '--source', str(artifact), '--verify-only'], cwd=ROOT, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert 'Verified CatBoost' in result.stdout
    assert artifact.read_bytes() == original


def test_importer_rejects_executable_serializations():
    result = subprocess.run([sys.executable, '-B', '-m', 'ai.install_catboost', '--source', str(ROOT/'.local/ai/model.joblib'), '--verify-only'], cwd=ROOT, capture_output=True, text=True)
    assert result.returncode != 0
    assert 'native CBM' in result.stderr
