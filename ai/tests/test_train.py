import importlib
import json
from pathlib import Path

import pytest


def training():
    assert importlib.util.find_spec('ai.train') is not None, 'Reproducible training CLI required'
    return importlib.import_module('ai.train')


def test_unit_status_gate_rejects_missing_status():
    with pytest.raises(ValueError, match='unit'):
        training().prepare_rows([], None)


def test_only_explicit_unresolved_source_cells_are_quarantined():
    values = dict(PH=7, Temp=27, BOD5=10, COD=20, DO=5, Amoni=1,
                  Phosphat=0.2, Coliforms=5000)
    rows = [dict(rowNumber=121,values=values),
            dict(rowNumber=122,values={**values,'DO':585}),
            dict(rowNumber=257,values={**values,'Amoni':2632}),
            dict(rowNumber=433,values={**values,'Coliforms':5400000})]
    prepared = training().prepare_rows(rows, 'assumed-for-research')
    assert [r['rowNumber'] for r in prepared['rows']] == [121,433]
    assert [r['rowNumber'] for r in prepared['quarantine']] == [122,257]
    assert prepared['rows'][1]['values']['Coliforms'] == 5400000
    assert rows[1]['values']['DO'] == 585


def test_all_prepared_numeric_measurements_are_required():
    with pytest.raises(ValueError, match='measurements'):
        training().prepare_rows([{'rowNumber':2,'values':{'PH':7}}], 'confirmed')


def test_related_input_vectors_never_cross_locked_holdout():
    module = training()
    x = [[float(i//2)] * 6 for i in range(30)]
    train, test = module.locked_split(x)
    assert set(train).isdisjoint(test)
    assert {tuple(x[i]) for i in train}.isdisjoint({tuple(x[i]) for i in test})
    assert len(test) == 6


def test_source_dataset_has_754_eligible_rows_after_explicit_quarantine():
    source = Path(__file__).resolve().parents[2] / '.local/datasets/AKH-5_2026.raw.json'
    if not source.exists():
        pytest.skip('Private dataset is not distributed')
    prepared = training().prepare_rows(json.loads(source.read_text(encoding='utf-8')), 'assumed-for-research')
    assert len(prepared['rows']) == 754
    assert len(prepared['quarantine']) == 2


def test_training_identity_changes_with_units_and_reference_code():
    module = training()
    assert hasattr(module, 'training_identity'), 'Training identity must cover label and unit semantics'
    confirmed = module.training_identity('source-hash', 'confirmed')
    assumed = module.training_identity('source-hash', 'assumed-for-research')
    assert confirmed['fingerprint'] != assumed['fingerprint']
    assert set(confirmed['codeSha256']) == {'train.py','reference.py','service.py'}
    assert confirmed['sklearnVersion']
    assert confirmed['featureOrder'] == ['ph','do','bod5','nh4','po4','coliform']
