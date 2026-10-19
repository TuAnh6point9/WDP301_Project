"""Native lecturer artifact loading. No executable pickle and no legacy fallback."""
import hashlib
import json
import math
import re
from pathlib import Path

FEATURE_ORDER = ['Coliforms', 'Amoni', 'PH', 'Phosphat', 'DO', 'COD']
PARAMETER_ORDER = ['coliform', 'nh4', 'ph', 'po4', 'do', 'cod']
SCHEMA_VERSION = 'catboost-top6-amoni-v1'
UNIT_BASIS = 'training-source-unverified'


def validate_bundle(bundle):
    metadata = bundle['metadata']
    for key, value in {
        'featureOrder': FEATURE_ORDER, 'parameterOrder': PARAMETER_ORDER,
        'algorithm': 'CatBoost', 'predictionSchemaVersion': SCHEMA_VERSION,
        'unitBasis': UNIT_BASIS, 'unitStatus': 'unverified',
        'referenceBasis': 'lecturer-provided', 'preprocessing': 'native-model-only',
    }.items():
        if metadata.get(key) != value:
            raise ValueError(f'Invalid {key}')
    if not isinstance(metadata.get('modelVersion'), str) or not metadata['modelVersion'].strip():
        raise ValueError('Missing modelVersion')
    if not re.fullmatch(r'[a-f0-9]{64}', metadata.get('artifactSha256', '')):
        raise ValueError('Invalid artifactSha256')
    model = bundle['model']
    if getattr(model, 'feature_names_', None) != FEATURE_ORDER or not callable(getattr(model, 'predict', None)):
        raise ValueError('Invalid runtime model features')
    domain = metadata.get('inputDomain')
    if domain is not None:
        if set(domain) != set(PARAMETER_ORDER):
            raise ValueError('Invalid inputDomain')
        for key, bounds in domain.items():
            if set(bounds) != {'min', 'max'} or not all(
                isinstance(bounds[k], (float, int)) and not isinstance(bounds[k], bool)
                and math.isfinite(bounds[k]) for k in ('min', 'max')
            ) or bounds['min'] < 0 or bounds['max'] < bounds['min'] or (key == 'ph' and bounds['max'] > 14):
                raise ValueError('Invalid inputDomain')


def load_bundle(path, manifest_path):
    artifact = Path(path)
    if artifact.suffix.lower() != '.cbm':
        raise ValueError('Only native CBM artifacts are served')
    metadata = json.loads(Path(manifest_path).read_text(encoding='utf-8'))
    content = artifact.read_bytes()
    if hashlib.sha256(content).hexdigest() != metadata.get('artifactSha256'):
        raise ValueError('Artifact checksum mismatch')
    from catboost import CatBoostRegressor
    model = CatBoostRegressor()
    model.load_model(blob=content)
    if model.get_cat_feature_indices():
        raise ValueError('Only numeric features are supported')
    bundle = {'model': model, 'metadata': metadata}
    validate_bundle(bundle)
    return bundle
