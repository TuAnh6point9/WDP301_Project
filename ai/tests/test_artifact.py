"""Native lecturer parity and preservation of historical Callisto provenance."""
import hashlib
import json
from pathlib import Path
import numpy as np
import pytest
from fastapi.testclient import TestClient
from ai.catboost_model import load_bundle
from ai.service import create_app

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT/'.local/ai/catboost'


def test_native_artifact_and_http_output_agree_for_numeric_vectors():
    artifact = DIRECTORY/'model.cbm'
    if not artifact.exists(): pytest.skip('Private lecturer model not distributed')
    data = load_bundle(artifact,DIRECTORY/'manifest.json')
    rng = np.random.default_rng(42)
    vectors = rng.uniform([100,0,5,0,0,1],[10000,2,9,2,10,100],size=(100,6))
    direct = data['model'].predict(vectors)
    with TestClient(create_app(data)) as client:
        for values, expected in zip(vectors,direct):
            request = dict(parameters=dict(zip(['coliform','nh4','ph','po4','do','cod'],values.tolist())),unitBasis='training-source-unverified')
            response = client.post('/predict',json=request)
            assert response.status_code == 200
            result = response.json()
            assert result['rawWqi'] == pytest.approx(float(expected),abs=1e-6)
            assert result['wqi'] == int(np.floor(expected+0.5))
            assert result['artifactSha256'] == 'cbc6efa74027812d0dea074f6bef679a3aa4d50ebced05923908ef90a20c7008'


def test_archived_callisto_artifact_and_holdout_provenance_are_preserved():
    directory = ROOT/'.local/ai'
    artifact = directory/'model.joblib'
    if not artifact.exists(): pytest.skip('Private historical artifact not distributed')
    metadata = json.loads((directory/'metadata.json').read_text(encoding='utf-8'))
    assert hashlib.sha256(artifact.read_bytes()).hexdigest() == metadata['artifactSha256']
    assert metadata['featureOrder'] == ['ph','do','bod5','nh4','po4','coliform']
    split = json.loads((directory/'split.json').read_text(encoding='utf-8'))
    assert set(split['trainRowNumbers']).isdisjoint(split['holdoutRowNumbers'])
    if (DIRECTORY/'manifest.json').exists():
        current = json.loads((DIRECTORY/'manifest.json').read_text(encoding='utf-8'))
        assert current['inputDomain'] is None
        assert current['referenceBasis'] == 'lecturer-provided'
        assert 'metrics' not in current
