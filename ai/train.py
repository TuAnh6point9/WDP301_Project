"""CPU-only, explicitly gated research training. Run from the repository root."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import re
from pathlib import Path

import joblib
import numpy as np
import sklearn
from sklearn.base import clone
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import (balanced_accuracy_score, confusion_matrix, f1_score,
                            mean_absolute_error, mean_squared_error, r2_score)
from sklearn.model_selection import GroupKFold, GroupShuffleSplit, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ai.reference import CLASSIFICATION_VERSION, CLASS_LABELS, reference_wqi, round_wqi, quality_class
# Archived Callisto 1.0 training contract is independent of current inference.
FEATURES = ['ph', 'do', 'bod5', 'nh4', 'po4', 'coliform']
UNIT_BASIS = 'mg/L; NH4 as N; PO4 as P; Coliform MPN/100mL'
UNIT_STATUSES = ('confirmed', 'assumed-for-research')

RAW_COLUMNS = ['PH','Temp','BOD5','COD','DO','Amoni','Phosphat','Coliforms']
SOURCE_FEATURES = ['PH','DO','BOD5','Amoni','Phosphat','Coliforms']
REFERENCE_URL = 'https://quantracmoitruong.gov.vn/storage/news_file_attach/QD%201460%20TCMT%20ngay%2012.11.2019%20WQI.pdf'
REFERENCE_SHA256 = '011a694265cef2cdf0326d6de24c65f09d905c43929e21af0f8d355dfd7fe0f9'
LABEL_VERSION = 'VN_WQI_1460_2019_formula3_I_IV5_V_coliform_v1'


def training_identity(dataset_sha, unit_status):
    code_dir = Path(__file__).resolve().parent
    identity = {'datasetSha256':dataset_sha,'unitStatus':unit_status,'featureOrder':FEATURES,
        'unitBasis':UNIT_BASIS,'labelVersion':LABEL_VERSION,'referenceSha256':REFERENCE_SHA256,
        'sklearnVersion':sklearn.__version__,'numpyVersion':np.__version__,'seed':42,
        'codeSha256':{name:hashlib.sha256((code_dir/name).read_bytes()).hexdigest()
                      for name in ['train.py','reference.py','service.py']},
        'trainingConfiguration':{name:repr(estimator) for name,estimator in candidates().items()}}
    identity['fingerprint'] = hashlib.sha256(json.dumps(identity,sort_keys=True,ensure_ascii=True,
        separators=(',',':')).encode('utf-8')).hexdigest()
    return identity


def prepare_rows(rows, unit_status):
    if unit_status not in UNIT_STATUSES:
        raise ValueError('Explicit unit status confirmed or assumed-for-research is required')
    accepted, quarantine = [], []
    for row in rows:
        values = row.get('values', {})
        if set(values) != set(RAW_COLUMNS) or any(
            isinstance(values[k], bool) or not isinstance(values[k], (int,float))
            or not math.isfinite(values[k]) for k in RAW_COLUMNS):
            raise ValueError(f'Invalid or missing measurements at row {row.get("rowNumber")}')
        if not 0 <= values['PH'] <= 14 or any(values[k] < 0 for k in RAW_COLUMNS if k != 'Temp'):
            raise ValueError(f'Invalid physical measurements at row {row.get("rowNumber")}')
        reason = None
        if row['rowNumber'] == 122 and values['DO'] == 585:
            reason = 'Unresolved prior QA: source E122 DO=585; no invented decimal correction'
        if row['rowNumber'] == 257 and values['Amoni'] == 2632:
            reason = 'Unresolved prior QA: source F257 Amoni=2632; unknown original scale/basis'
        if reason:
            quarantine.append({'rowNumber':row['rowNumber'], 'reason':reason, 'values':values})
        else:
            accepted.append(row)
    return {'rows':accepted, 'quarantine':quarantine}


def group_keys(x):
    return [json.dumps(list(map(float, vector)), separators=(',',':')) for vector in x]


def locked_split(x):
    train, test = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
                       .split(x, groups=group_keys(x)))
    return train.tolist(), test.tolist()


def candidates():
    return {
        'dummy': Pipeline([('model',DummyRegressor(strategy='mean'))]),
        'ridge': Pipeline([('scale',StandardScaler()), ('model',Ridge(alpha=10))]),
        'random_forest': Pipeline([('model',RandomForestRegressor(n_estimators=160,
            min_samples_leaf=2, max_features=1.0, random_state=42, n_jobs=1))]),
        'hist_gradient_boosting': Pipeline([('model',HistGradientBoostingRegressor(
            max_iter=160, max_leaf_nodes=15, min_samples_leaf=12, l2_regularization=1,
            random_state=42))]),
    }


def select_fit(x, y, train, groups):
    x_train, y_train = x[train], y[train]
    train_groups = np.asarray(groups)[train]
    cv = GroupKFold(n_splits=3)
    scores = {}
    estimators = candidates()
    for name, estimator in estimators.items():
        errors = -cross_val_score(estimator, x_train, y_train, groups=train_groups,
            cv=cv, scoring='neg_mean_absolute_error', n_jobs=1, error_score='raise')
        scores[name] = {'maeMean':float(errors.mean()),'maeStd':float(errors.std()),
                        'foldMae':errors.tolist()}
    winner = min(scores, key=lambda name: scores[name]['maeMean'])
    estimator = clone(estimators[winner]).fit(x_train, y_train)
    return winner, estimator, scores


def metrics(y, predicted):
    actual_class = [quality_class(round_wqi(v)) for v in y]
    pred_class = [quality_class(round_wqi(v)) for v in predicted]
    matrix = confusion_matrix(actual_class,pred_class,labels=CLASS_LABELS)
    per_class = {}
    for index, name in enumerate(CLASS_LABELS):
        support = int(matrix[index].sum())
        per_class[name] = {'support':support,'recall':float(matrix[index,index]/support) if support else None}
    return {'mae':float(mean_absolute_error(y,predicted)),
        'rmse':float(math.sqrt(mean_squared_error(y,predicted))), 'r2':float(r2_score(y,predicted)),
        'macroF1DeclaredSixClasses':float(f1_score(actual_class,pred_class,labels=CLASS_LABELS,
                                                  average='macro',zero_division=0)),
        'balancedAccuracyObservedClasses':float(balanced_accuracy_score(actual_class,pred_class)),
        'classOrder':CLASS_LABELS,'confusionMatrix':matrix.tolist(),'perClass':per_class,
        'rounding':'clip 0..100 then half-up; class assigned after rounding',
        'comparison':'Predictions versus formula-derived targets, not independent observed WQI'}


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf-8')


def train(source, output, unit_status, model_version):
    if unit_status not in UNIT_STATUSES:
        raise ValueError('Explicit unit status is required')
    version_match = re.fullmatch(r'callisto ([1-9][0-9]*)\.0', model_version) if isinstance(model_version, str) else None
    if not version_match:
        raise ValueError('Explicit model version required: callisto 1.0, callisto 2.0, ...')
    previous_metadata = output / 'metadata.json'
    if previous_metadata.exists():
        previous_version = json.loads(previous_metadata.read_text(encoding='utf-8')).get('modelVersion', '')
        previous_match = re.fullmatch(r'callisto ([1-9][0-9]*)\.0', previous_version)
        if previous_match and int(version_match.group(1)) <= int(previous_match.group(1)):
            raise ValueError('Choose a higher model version before training a new release.')
    source_bytes = source.read_bytes()
    dataset_sha = hashlib.sha256(source_bytes).hexdigest()
    prepared = prepare_rows(json.loads(source_bytes.decode('utf-8')), unit_status)
    rows = prepared['rows']
    x = np.asarray([[row['values'][key] for key in SOURCE_FEATURES] for row in rows], dtype=float)
    x8 = np.asarray([[row['values'][key] for key in RAW_COLUMNS] for row in rows], dtype=float)
    # Label semantics are locked before split. No learned preprocessing is fitted here.
    y = np.asarray([round_wqi(reference_wqi(row['values'])) for row in rows], dtype=float)
    train_idx, test_idx = locked_split(x)
    groups = group_keys(x)
    name, model, cv_scores = select_fit(x,y,train_idx,groups)
    benchmark_name, benchmark, benchmark_cv = select_fit(x8,y,train_idx,groups)
    predictions = model.predict(x[test_idx])
    identity = training_identity(dataset_sha,unit_status)
    metadata = {
        'modelVersion':model_version,
        'trainingIdentity':identity,
        'classificationVersion':CLASSIFICATION_VERSION,'referenceBasis':'formula-derived','unitStatus':unit_status,
        'unitBasis':UNIT_BASIS,'featureOrder':FEATURES,'rawSourceColumns':RAW_COLUMNS,
        'labelVersion':LABEL_VERSION,'labelRounding':'half-up integer before training',
        'labelFormula':'I/100 * sqrt(mean(IV: DO_percent,BOD5,COD,N-NH4,P-PO4) * Coliform_subindex)',
        'reference':{'url':REFERENCE_URL,'sha256':REFERENCE_SHA256,'groups':['I','IV','V'],
            'organicPollutionWeighting':False,'doCubicCoefficient':0.000077774,
            'sampleArithmeticNote':'PDF example final16/19 inconsistent with printed expression; normative formula3/tables used'},
        'estimator':name,'sklearnVersion':sklearn.__version__,'seed':42,'trainCount':len(train_idx),
        'holdoutCount':len(test_idx),'sourceCount':len(rows)+len(prepared['quarantine']),
        'quarantineCount':len(prepared['quarantine']),'datasetSha256':dataset_sha,
        'createdAt':datetime.now(timezone.utc).isoformat(),
        'inputDomain':{key:{'min':float(x[train_idx,index].min()),'max':float(x[train_idx,index].max())}
                       for index,key in enumerate(FEATURES)},
        'preprocessing':'Ridge: StandardScaler fitted in training folds; tree/dummy: raw values; explicit feature order',
        'limitations':['Units/analytes assumed for research; workbook measurements not certified' if unit_status == 'assumed-for-research' else 'Units supplied as confirmed by operator',
            'No station/time/sample metadata: exact-six-vector groups only; no geographic/temporal generalization claim',
            'COD and Temp contribute to targets but are absent from six-input inference',
            'Remaining extreme/IQR values retained; no silent clipping, correction or exclusion',
            'Not a drinking-water safety certificate or independent observed WQI validation',
            'No pesticide/metal groups measured; applicability to such pollution not established'],
    }
    evaluation = {'selection':'Lowest 3-fold group-CV MAE on training partition only; holdout never used for selection',
        'cvSix':cv_scores,'selectedSix':name,'holdoutSix':metrics(y[test_idx],predictions),
        'cvEight':benchmark_cv,'selectedEight':benchmark_name,
        'holdoutEight':metrics(y[test_idx],benchmark.predict(x8[test_idx])),
        'eightComparison':'Same labels, rows, train/holdout and grouped CV; separately selected with same candidate budget',
        'holdoutOutsideSixTrainingDomainCount':int(np.any((x[test_idx]<x[train_idx].min(axis=0))|
                                                         (x[test_idx]>x[train_idx].max(axis=0)),axis=1).sum()),
        'metricsIncludeOod':'Offline regression metrics include all locked holdout rows; live service rejects OOD'}
    output = output.resolve()
    private_root = Path(__file__).resolve().parents[1] / '.local' / 'ai'
    if not output.is_relative_to(private_root.resolve()):
        raise ValueError('Generated data/artifacts must stay inside .local/ai')
    output.mkdir(parents=True, exist_ok=True)
    joblib.dump({'model':model,'metadata':metadata},output/'model.joblib')
    metadata['artifactSha256'] = hashlib.sha256((output/'model.joblib').read_bytes()).hexdigest()
    write_json(output/'metadata.json',metadata)
    write_json(output/'metrics.json',evaluation)
    write_json(output/'quarantine.json',prepared['quarantine'])
    write_json(output/'labels.json',[{'rowNumber':row['rowNumber'],'wqi':int(y[i]),
        'qualityClass':quality_class(y[i]),'labelVersion':LABEL_VERSION,'unitStatus':unit_status}
        for i,row in enumerate(rows)])
    write_json(output/'split.json',{'seed':42,'groupDefinition':'Exact six raw input vector; sample grouping unavailable',
        'trainRowNumbers':[rows[i]['rowNumber'] for i in train_idx],
        'holdoutRowNumbers':[rows[i]['rowNumber'] for i in test_idx]})
    golden = []
    for i in train_idx[:8]:
        score = round_wqi(float(model.predict(x[[i]])[0]))
        golden.append({'rowNumber':rows[i]['rowNumber'],
            'request':{'parameters':dict(zip(FEATURES,x[i].tolist())),'unitBasis':UNIT_BASIS},
            'expected':{'wqi':score,'qualityClass':quality_class(score),'modelVersion':metadata['modelVersion'],
                'classificationVersion':CLASSIFICATION_VERSION,'referenceBasis':'formula-derived','unitStatus':unit_status},
            'purpose':'Pipeline/service parity only, not a held-out accuracy test'})
    write_json(output/'golden_vectors.json',golden)
    print(json.dumps({'modelVersion':metadata['modelVersion'],'unitStatus':unit_status,
        'trainCount':len(train_idx),'holdoutCount':len(test_idx),'selectedSix':name,
        'holdoutSix':evaluation['holdoutSix'],'holdoutEight':evaluation['holdoutEight']},ensure_ascii=True,indent=2))
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=Path('.local/datasets/AKH-5_2026.raw.json'))
    parser.add_argument('--output',type=Path,default=Path('.local/ai'))
    parser.add_argument('--unit-status',choices=UNIT_STATUSES,required=True,
                        help='Explicit attestation; research assumptions do not certify source units')
    parser.add_argument('--model-version',required=True,
                        help='Explicit release name, e.g. "callisto 2.0"; never generated from an estimator or hash')
    args = parser.parse_args()
    train(args.source,args.output,args.unit_status,args.model_version)


if __name__ == '__main__':
    main()
