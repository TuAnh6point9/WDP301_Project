import importlib
import math

import pytest


def reference():
    spec = importlib.util.find_spec('ai.reference')
    assert spec is not None, 'Offline VN_WQI reference is required'
    return importlib.import_module('ai.reference')


@pytest.mark.parametrize('name,value,expected', [
    ('bod5', 4, 100), ('bod5', 6, 75), ('bod5', 15, 50), ('bod5', 50, 10),
    ('cod', 10, 100), ('cod', 15, 75), ('cod', 30, 50), ('cod', 150, 10),
    ('nh4', 0.299, 100), ('nh4', 0.3, 75), ('nh4', 0.6, 50), ('nh4', 5, 10),
    ('po4', 0.1, 100), ('po4', 0.2, 75), ('po4', 0.3, 50), ('po4', 4, 10),
    ('coliform', 2500, 100), ('coliform', 5000, 75), ('coliform', 10000, 25),
    ('coliform', 10001, 10), ('bod5', 5, 87.5),
])
def test_official_concentration_breakpoints(name, value, expected):
    assert reference().concentration_index(name, value) == pytest.approx(expected)


@pytest.mark.parametrize('value,expected', [(5.49,10),(5.5,50),(5.75,75),(6,100),
                                         (8.5,100),(8.75,75),(9,50),(9.01,10)])
def test_ph_piecewise(value, expected):
    assert reference().ph_index(value) == pytest.approx(expected)


@pytest.mark.parametrize('value,expected', [(19,10),(20,25),(50,50),(75,75),(88,100),
                                         (112,100),(125,75),(150,50),(200,25),(201,10)])
def test_do_saturation_breakpoints(value, expected):
    assert reference().do_index(value) == pytest.approx(expected)


def test_offline_label_uses_all_five_group_iv_subindices():
    ref = reference()
    temp = 27.5
    sample = dict(PH=7.2, Temp=temp, DO=ref.do_saturation(temp), BOD5=4,
                  COD=30, Amoni=0.2, Phosphat=0.1, Coliforms=2500)
    # I=100, IV mean=(100+100+50+100+100)/5=90, V=100.
    assert ref.reference_wqi(sample) == pytest.approx(math.sqrt(90 * 100))


@pytest.mark.parametrize('score,label', [(100,'Rất tốt'),(91,'Rất tốt'),(90,'Tốt'),
    (76,'Tốt'),(75,'Trung bình'),(51,'Trung bình'),(50,'Xấu'),(26,'Xấu'),
    (25,'Kém'),(10,'Kém'),(9,'Ô nhiễm rất nặng'),(0,'Ô nhiễm rất nặng')])
def test_six_official_classes(score, label):
    assert reference().quality_class(score) == label


def test_rounding_half_up_not_python_bankers_rounding():
    ref = reference()
    assert ref.round_wqi(50.5) == 51
    assert ref.round_wqi(100.0000001) == 100
    assert ref.round_wqi(-0.0000001) == 0


def test_normative_do_coefficient_and_independent_three_group_case():
    ref = reference()
    # Independent arithmetic using the normative cubic coefficient, not the rounded PDF example.
    assert ref.do_saturation(27.5) == pytest.approx(7.79668759375, abs=1e-10)
    sample = dict(PH=7.2, Temp=27.5, DO=5.7, BOD5=20, COD=25,
                  Amoni=0.2, Phosphat=0.3, Coliforms=10000)
    # Only groups I/IV/V; no metal/pesticide multiplier from the full PDF example.
    assert ref.round_wqi(ref.reference_wqi(sample)) == 40
