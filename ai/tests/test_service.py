"""Readiness and domain regression checks for the current CatBoost service."""
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from ai.service import create_app, configured_app
from ai.tests.test_catboost_service import bundle, PARAMETERS, UNIT


def test_unconfigured_service_has_no_formula_fallback():
    with TestClient(create_app()) as client:
        assert client.get('/health').status_code == 503
        response = client.post('/predict', json=dict(parameters=PARAMETERS, unitBasis=UNIT))
        assert response.status_code == 503
        assert response.json()['error']['code'] == 'AI_MODEL_NOT_READY'


def test_declared_domain_is_enforced_before_inference():
    data = bundle()
    data['metadata']['inputDomain'] = {key: dict(min=0, max=14 if key == 'ph' else 10000) for key in PARAMETERS}
    data['metadata']['inputDomain']['do']['max'] = 5
    with TestClient(create_app(data)) as client:
        response = client.post('/predict', json=dict(parameters=PARAMETERS, unitBasis=UNIT))
        assert response.status_code == 422
        assert response.json()['error']['details']['do'] == dict(min=0, max=5, value=5.7)
    assert data['model'].calls == []


@pytest.mark.parametrize('key,value', [('featureOrder', ['Temp']*6), ('unitBasis','NH4+ as ion'), ('algorithm','HistGradientBoosting'), ('preprocessing','scaler'), ('referenceBasis','formula-derived')])
def test_inconsistent_manifest_is_rejected(key,value):
    data = bundle(); data['metadata'][key] = value
    with pytest.raises(ValueError): create_app(data)


def test_ph_declared_domain_cannot_exceed_physical_domain():
    data = bundle()
    data['metadata']['inputDomain'] = {key: dict(min=0,max=15 if key=='ph' else 10000) for key in PARAMETERS}
    with pytest.raises(ValueError,match='inputDomain'): create_app(data)


def test_missing_configured_artifact_is_not_ready(monkeypatch):
    monkeypatch.setenv('WQI_MODEL_PATH', str(Path('.local/catboost-integration/does-not-exist.cbm')))
    with TestClient(configured_app()) as client:
        assert client.get('/health').json()['reason'] == 'artifact_missing'


def test_corrupt_configured_artifact_is_not_ready(monkeypatch, tmp_path):
    artifact = tmp_path/'broken.cbm';artifact.write_bytes(b'not a native model')
    monkeypatch.setenv('WQI_MODEL_PATH', str(artifact))
    with TestClient(configured_app()) as client:
        assert client.get('/health').status_code == 503
        assert client.get('/health').json()['reason'] == 'artifact_invalid'
