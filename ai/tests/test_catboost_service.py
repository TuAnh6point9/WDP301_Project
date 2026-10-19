import json
import math
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from ai.service import create_app, configured_app

PARAMETERS = dict(coliform=5000, nh4=0.2, ph=7.2, po4=0.3, do=5.7, cod=25)
UNIT = 'training-source-unverified'
ORDER = ['Coliforms', 'Amoni', 'PH', 'Phosphat', 'DO', 'COD']


class CaptureModel:
    feature_names_ = ORDER
    def __init__(self, output=50.5):
        self.output = output
        self.calls = []
    def predict(self, values):
        self.calls.append(values)
        return [self.output]


def bundle(output=50.5):
    return dict(model=CaptureModel(output), metadata=dict(
        featureOrder=ORDER.copy(), parameterOrder=list(PARAMETERS), modelVersion='callisto 2.0',
        algorithm='CatBoost', predictionSchemaVersion='catboost-top6-amoni-v1',
        artifactSha256='a'*64, unitBasis=UNIT, unitStatus='unverified',
        referenceBasis='lecturer-provided',
        inputDomain=None, preprocessing='native-model-only'))


def test_native_mapping_is_independent_of_json_property_order():
    data = bundle()
    with TestClient(create_app(data)) as client:
        request = dict(parameters=dict(reversed(list(PARAMETERS.items()))), unitBasis=UNIT)
        response = client.post('/predict', json=request)
        assert response.status_code == 200
        assert data['model'].calls == [[[5000, 0.2, 7.2, 0.3, 5.7, 25]]]
        assert response.json() == dict(wqi=51, rawWqi=50.5, qualityClass='Trung bình',
            modelVersion='callisto 2.0', algorithm='CatBoost',
            predictionSchemaVersion='catboost-top6-amoni-v1', artifactSha256='a'*64,
            referenceBasis='lecturer-provided', unitStatus='unverified')
        health = client.get('/health').json()
        assert 'classificationVersion' not in health
        assert health['featureOrder'] == ORDER
        assert health['inputDomain'] is None


@pytest.mark.parametrize('change', ['missing', 'string', 'boolean', 'negative', 'ph', 'bod5', 'temp', 'unit'])
def test_current_input_validation_happens_before_inference(change):
    data = bundle()
    payload = dict(parameters=dict(PARAMETERS), unitBasis=UNIT)
    if change == 'missing': del payload['parameters']['cod']
    elif change == 'string': payload['parameters']['cod'] = '25'
    elif change == 'boolean': payload['parameters']['nh4'] = True
    elif change == 'negative': payload['parameters']['cod'] = -1
    elif change == 'ph': payload['parameters']['ph'] = 15
    elif change == 'bod5': payload['parameters']['bod5'] = 5
    elif change == 'temp': payload['parameters']['temp'] = 28
    else: payload['unitBasis'] = 'mg/L; NH4 as N; PO4 as P; Coliform MPN/100mL'
    with TestClient(create_app(data)) as client:
        assert client.post('/predict', json=payload).status_code == 422
    assert data['model'].calls == []


@pytest.mark.parametrize('output', [math.nan, math.inf, -math.inf])
def test_nonfinite_raw_output_is_rejected(output):
    with TestClient(create_app(bundle(output))) as client:
        response = client.post('/predict', json=dict(parameters=PARAMETERS, unitBasis=UNIT))
        assert response.status_code == 500
        assert response.json()['error']['code'] == 'AI_INFERENCE_ERROR'


@pytest.mark.parametrize('output', [-1e-7, -3.2, 100.0000001, 106.12])
def test_wqi_outside_0_100_is_reported_and_discarded(output):
    with TestClient(create_app(bundle(output))) as client:
        response = client.post('/predict', json=dict(parameters=PARAMETERS, unitBasis=UNIT))
        assert response.status_code == 500
        assert response.json() == {'error': {'code': 'AI_OUTPUT_OUT_OF_RANGE',
            'message': 'Model returned WQI outside 0..100; the result was discarded.'}}


def test_old_estimator_is_not_a_fallback(monkeypatch):
    path = Path(__file__).resolve().parents[2]/'.local/ai/model.joblib'
    monkeypatch.setenv('WQI_MODEL_PATH', str(path))
    monkeypatch.setenv('WQI_MODEL_MANIFEST', str(path.with_suffix('.json')))
    with TestClient(configured_app()) as client:
        assert client.get('/health').status_code == 503
        assert client.post('/predict', json=dict(parameters=PARAMETERS, unitBasis=UNIT)).status_code == 503


def test_runtime_model_feature_names_cannot_be_relabelled():
    data = bundle()
    data['model'].feature_names_ = ['Coliforms', 'Temp', 'PH', 'Phosphat', 'DO', 'COD']
    with pytest.raises(ValueError, match='feature'):
        create_app(data)


def test_native_artifact_parity_and_checksum_failure(monkeypatch, tmp_path):
    directory = Path(__file__).resolve().parents[2]/'.local/ai/catboost'
    artifact = directory/'model.cbm'
    if not artifact.exists(): pytest.skip('Private lecturer artifact is not distributed')
    from catboost import CatBoostRegressor
    model = CatBoostRegressor(); model.load_model(str(artifact))
    monkeypatch.setenv('WQI_MODEL_PATH', str(artifact))
    monkeypatch.setenv('WQI_MODEL_MANIFEST', str(directory/'manifest.json'))
    with TestClient(configured_app()) as client:
        assert client.get('/health').status_code == 200
        result = client.post('/predict', json=dict(parameters=PARAMETERS, unitBasis=UNIT)).json()
        assert result['rawWqi'] == pytest.approx(float(model.predict([[5000, 0.2, 7.2, 0.3, 5.7, 25]])[0]), abs=1e-6)
    manifest = json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
    manifest['artifactSha256'] = '0'*64
    bad = tmp_path/'manifest.json'; bad.write_text(json.dumps(manifest), encoding='utf-8')
    monkeypatch.setenv('WQI_MODEL_MANIFEST', str(bad))
    with TestClient(configured_app()) as client:
        assert client.get('/health').status_code == 503
