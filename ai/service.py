"""CatBoost serving with explicit native feature mapping and no fallback."""
import hmac
import math
import os
from pathlib import Path
from typing import Literal
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, StrictFloat, StrictInt, Field, field_validator
from ai.catboost_model import (
    FEATURE_ORDER, PARAMETER_ORDER, SCHEMA_VERSION, UNIT_BASIS,
    load_bundle, validate_bundle,
)
from ai.reference import quality_class

FEATURES = PARAMETER_ORDER


class OutputOutOfRange(ValueError):
    pass

class Parameters(BaseModel):
    model_config = ConfigDict(extra='forbid')
    coliform: StrictFloat | StrictInt
    nh4: StrictFloat | StrictInt
    ph: StrictFloat | StrictInt
    po4: StrictFloat | StrictInt
    do: StrictFloat | StrictInt
    cod: StrictFloat | StrictInt

    @field_validator('*')
    @classmethod
    def physical_domain(cls, value, info):
        if not math.isfinite(value) or value < 0 or (info.field_name == 'ph' and value > 14):
            raise ValueError('Finite nonnegative values required; pH must be 0..14')
        return value

class PredictRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    parameters: Parameters
    unitBasis: Literal['training-source-unverified']

class BatchRow(BaseModel):
    model_config = ConfigDict(extra='forbid')
    rowNumber: StrictInt = Field(ge=2, le=1048576)
    parameters: Parameters

class BatchRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    rows: list[BatchRow] = Field(min_length=1, max_length=100)
    unitBasis: Literal['training-source-unverified']
    expectedArtifactSha256: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    expectedModelVersion: str | None = None

    @field_validator('rows')
    @classmethod
    def distinct_rows(cls, rows):
        if len({row.rowNumber for row in rows}) != len(rows):
            raise ValueError('Duplicate row numbers')
        return rows

def create_app(bundle=None, unavailable_reason='not_configured'):
    if bundle is not None:
        validate_bundle(bundle)
    app = FastAPI(title='CatBoost WQI model service', version='2.0.0')
    api_key = os.environ.get('AI_API_KEY', '')

    # The free hosting plan exposes this service publicly; only /health stays open for the platform health check.
    @app.middleware('http')
    async def require_api_key(request, call_next):
        if api_key and request.url.path != '/health' and not hmac.compare_digest(
                request.headers.get('authorization', '').encode(), f'Bearer {api_key}'.encode()):
            return JSONResponse(status_code=401, content={'error': {'code': 'AI_UNAUTHORIZED'}})
        return await call_next(request)

    def outside_domain(values):
        domain = bundle['metadata'].get('inputDomain')
        return {key: {**domain[key], 'value': values[key]} for key in FEATURES
            if not domain[key]['min'] <= values[key] <= domain[key]['max']} if domain else {}

    def result_for(output):
        output = float(output)
        if not math.isfinite(output):
            raise ValueError('Estimator returned invalid WQI')
        # WQI is defined only on 0..100; an overshooting prediction is reported and discarded, never clipped.
        if not 0 <= output <= 100:
            raise OutputOutOfRange()
        score = math.floor(output + 0.5)
        return {'wqi': score, 'rawWqi': output, 'qualityClass': quality_class(score),
            **{key: bundle['metadata'][key] for key in ('modelVersion', 'algorithm', 'predictionSchemaVersion',
                'artifactSha256', 'referenceBasis', 'unitStatus')}}

    @app.exception_handler(RequestValidationError)
    async def invalid_input(_request, _exception):
        return JSONResponse(status_code=422, content={'error': {
            'code': 'AI_INVALID_INPUT', 'message': 'Invalid input schema, source unit basis or physical value.'}})

    @app.get('/health')
    def health():
        metadata = bundle['metadata'] if bundle else {}
        payload = {'ready': bundle is not None, 'modelVersion': metadata.get('modelVersion'),
            'unitStatus': metadata.get('unitStatus'),
            'inputDomain': metadata.get('inputDomain'), 'algorithm': 'CatBoost',
            'featureOrder': FEATURE_ORDER, 'predictionSchemaVersion': SCHEMA_VERSION,
            'artifactSha256': metadata.get('artifactSha256'), 'referenceBasis': metadata.get('referenceBasis')}
        if bundle is None:
            payload['reason'] = unavailable_reason
        return JSONResponse(status_code=200 if bundle else 503, content=payload)

    @app.post('/predict')
    def predict(request: PredictRequest):
        if bundle is None:
            return JSONResponse(status_code=503, content={'error': {
                'code': 'AI_MODEL_NOT_READY', 'message': 'No verified CatBoost artifact is configured.'}})
        values = request.parameters.model_dump()
        outside = outside_domain(values)
        if outside:
            return JSONResponse(status_code=422, content={'error': {
                'code': 'AI_INPUT_OUTSIDE_DOMAIN', 'message': 'Input outside declared model domain.', 'details': outside}})
        try:
            return result_for(bundle['model'].predict([[values[key] for key in PARAMETER_ORDER]])[0])
        except OutputOutOfRange:
            return JSONResponse(status_code=500, content={'error': {
                'code': 'AI_OUTPUT_OUT_OF_RANGE', 'message': 'Model returned WQI outside 0..100; the result was discarded.'}})
        except Exception:
            return JSONResponse(status_code=500, content={'error': {
                'code': 'AI_INFERENCE_ERROR', 'message': 'Model inference failed or returned invalid WQI.'}})

    @app.post('/predict/batch')
    def predict_batch(request: BatchRequest):
        if bundle is None:
            return JSONResponse(status_code=503, content={'error': {'code': 'AI_MODEL_NOT_READY'}})
        metadata = bundle['metadata']
        if ((request.expectedArtifactSha256 and request.expectedArtifactSha256 != metadata['artifactSha256'])
            or (request.expectedModelVersion and request.expectedModelVersion != metadata['modelVersion'])):
            return JSONResponse(status_code=409, content={'error': {'code': 'AI_MODEL_CHANGED'}})
        results = {}
        valid = []
        for row in request.rows:
            values = row.parameters.model_dump()
            if outside_domain(values):
                results[row.rowNumber] = {'error': {'code': 'AI_INPUT_OUTSIDE_DOMAIN'}}
            else:
                valid.append((row.rowNumber, [values[key] for key in PARAMETER_ORDER]))
        if valid:
            try:
                outputs = bundle['model'].predict([values for _, values in valid])
                if len(outputs) != len(valid):
                    raise ValueError('Invalid output length')
            except Exception:
                return JSONResponse(status_code=500, content={'error': {'code': 'AI_INFERENCE_ERROR'}})
            for (number, _), output in zip(valid, outputs):
                try:
                    results[number] = {'result': result_for(output)}
                except OutputOutOfRange:
                    results[number] = {'error': {'code': 'AI_OUTPUT_OUT_OF_RANGE'}}
                except Exception:
                    results[number] = {'error': {'code': 'AI_INFERENCE_ERROR'}}
        return {'rows': [{'rowNumber': row.rowNumber, **results[row.rowNumber]} for row in request.rows]}
    return app

def configured_app():
    path = os.environ.get('WQI_MODEL_PATH')
    if not path:
        return create_app()
    try:
        artifact = Path(path)
        if not artifact.is_file():
            return create_app(unavailable_reason='artifact_missing')
        manifest = os.environ.get('WQI_MODEL_MANIFEST') or str(artifact.with_name('manifest.json'))
        return create_app(load_bundle(artifact, manifest))
    except Exception:
        return create_app(unavailable_reason='artifact_invalid')
