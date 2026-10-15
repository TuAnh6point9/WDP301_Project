import math
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from ai.service import create_app, configured_app
from ai.tests.test_catboost_service import PARAMETERS, UNIT, bundle


class MatrixModel:
    feature_names_ = ['Coliforms', 'Amoni', 'PH', 'Phosphat', 'DO', 'COD']
    def predict(self, values):
        # Hand-checkable result depends on all six positions.
        return [sum((index + 1) * value for index, value in enumerate(row)) / 100 for row in values]


def test_batch_matches_single_and_isolates_invalid_outputs():
    data = bundle()
    data['model'] = MatrixModel()
    with TestClient(create_app(data)) as client:
        single = client.post('/predict', json=dict(parameters=PARAMETERS, unitBasis=UNIT)).json()
        response = client.post('/predict/batch', json=dict(rows=[
            dict(rowNumber=2, parameters=dict(reversed(list(PARAMETERS.items())))),
            dict(rowNumber=5, parameters={**PARAMETERS, 'cod': 100000}),
        ], unitBasis=UNIT))
        assert response.status_code == 200
        rows = response.json()['rows']
        assert rows[0] == dict(rowNumber=2, result=single)
        assert rows[1]['rowNumber'] == 5 and rows[1]['error']['code'] == 'AI_INFERENCE_ERROR'


@pytest.mark.parametrize('rows', [[], [dict(rowNumber=2, parameters=PARAMETERS)] * 101,
    [dict(rowNumber=2, parameters=PARAMETERS)] * 2,
    [dict(rowNumber=2, parameters={**PARAMETERS, 'ph': '7,2'})]])
def test_batch_rejects_invalid_shape(rows):
    with TestClient(create_app(bundle())) as client:
        assert client.post('/predict/batch', json=dict(rows=rows, unitBasis=UNIT)).status_code == 422


def test_batch_never_serializes_nan_as_a_success():
    data = bundle(math.nan)
    with TestClient(create_app(data)) as client:
        response = client.post('/predict/batch', json=dict(rows=[dict(rowNumber=2, parameters=PARAMETERS)], unitBasis=UNIT))
        assert response.status_code == 200
        assert 'error' in response.json()['rows'][0]


def test_batch_rejects_an_unexpected_artifact_before_computing():
    with TestClient(create_app(bundle())) as client:
        response = client.post('/predict/batch', json=dict(rows=[dict(rowNumber=2, parameters=PARAMETERS)],
            unitBasis=UNIT, expectedArtifactSha256='b' * 64))
        assert response.status_code == 409
        assert response.json()['error']['code'] == 'AI_MODEL_CHANGED'


def test_batch_domain_error_does_not_block_valid_rows_or_blank_row_gaps():
    data = bundle()
    data['model'] = MatrixModel()
    data['metadata']['inputDomain'] = {key: dict(min=0, max=14 if key == 'ph' else 10000) for key in PARAMETERS}
    data['metadata']['inputDomain']['do']['max'] = 5
    with TestClient(create_app(data)) as client:
        response = client.post('/predict/batch', json=dict(rows=[dict(rowNumber=2, parameters=PARAMETERS),
            dict(rowNumber=10005, parameters={**PARAMETERS, 'do': 5})], unitBasis=UNIT))
        assert response.status_code == 200
        assert response.json()['rows'][0]['error']['code'] == 'AI_INPUT_OUTSIDE_DOMAIN'
        assert response.json()['rows'][1]['result']['wqi'] == 52


def test_native_batch_parity_for_distinct_measurements(monkeypatch):
    directory = Path(__file__).resolve().parents[2] / '.local/ai/catboost'
    if not (directory / 'model.cbm').exists():
        pytest.skip('Private lecturer artifact is not distributed')
    monkeypatch.setenv('WQI_MODEL_PATH', str(directory / 'model.cbm'))
    monkeypatch.setenv('WQI_MODEL_MANIFEST', str(directory / 'manifest.json'))
    inputs = [dict(coliform=1000 + i * 300, nh4=0.1 + i * 0.01, ph=6.8 + i * 0.03,
        po4=0.1 + i * 0.02, do=4 + i * 0.1, cod=10 + i) for i in range(20)]
    with TestClient(configured_app()) as client:
        response = client.post('/predict/batch', json=dict(rows=[dict(rowNumber=i + 2, parameters=values)
            for i, values in enumerate(inputs)], unitBasis=UNIT))
        assert response.status_code == 200
        for values, row in zip(inputs, response.json()['rows']):
            single = client.post('/predict', json=dict(parameters=values, unitBasis=UNIT))
            assert single.status_code == 200
            assert row['result']['rawWqi'] == pytest.approx(single.json()['rawWqi'], abs=1e-6)
            assert row['result']['wqi'] == single.json()['wqi']
            assert row['result']['qualityClass'] == single.json()['qualityClass']
