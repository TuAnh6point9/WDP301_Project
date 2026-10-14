"""Offline QD1460/2019 Formula 3, groups I/IV/V. Never an inference fallback.

Normative tables 1, 3, 4 take precedence over inconsistent sample arithmetic.
The class labels use section 1.4/the accompanying official announcement.
"""
import math

CLASSIFICATION_VERSION = 'VN_WQI_1460_2019'
CLASS_LABELS = ['Ô nhiễm rất nặng', 'Kém', 'Xấu', 'Trung bình', 'Tốt', 'Rất tốt']
TABLES = {
    'bod5': [(4,100),(6,75),(15,50),(25,25),(50,10)],
    'cod': [(10,100),(15,75),(30,50),(50,25),(150,10)],
    'nh4': [(0.3,75),(0.6,50),(0.9,25),(5,10)],
    'po4': [(0.1,100),(0.2,75),(0.3,50),(0.5,25),(4,10)],
    'coliform': [(2500,100),(5000,75),(7500,50),(10000,25)],
}


def interpolate(value, points):
    for (low, low_q), (high, high_q) in zip(points, points[1:]):
        if value <= high:
            return low_q + (high_q-low_q)*(value-low)/(high-low)
    return points[-1][1]


def concentration_index(name, value):
    if not math.isfinite(value) or value < 0:
        raise ValueError('Concentration must be finite and nonnegative')
    if name == 'nh4' and value < 0.3:
        return 100.0
    if name == 'coliform' and value > 10000:
        return 10.0
    points = TABLES[name]
    if value <= points[0][0]:
        return float(points[0][1])
    return interpolate(value, points)


def ph_index(value):
    if not math.isfinite(value) or not 0 <= value <= 14:
        raise ValueError('pH must be finite and in 0..14')
    if value < 5.5 or value > 9:
        return 10.0
    return interpolate(value, [(5.5,50),(6,100),(8.5,100),(9,50)])


def do_saturation(temp):
    if not math.isfinite(temp):
        raise ValueError('Water temperature must be finite')
    value = 14.652 - 0.41022*temp + 0.0079910*temp**2 - 0.000077774*temp**3
    if value <= 0:
        raise ValueError('Invalid saturation at water temperature')
    return value


def do_index(percent):
    if not math.isfinite(percent) or percent < 0:
        raise ValueError('DO saturation percentage must be finite and nonnegative')
    if percent < 20 or percent > 200:
        return 10.0
    return interpolate(percent, [(20,25),(50,50),(75,75),(88,100),(112,100),
                                 (125,75),(150,50),(200,25)])


def reference_wqi(values):
    do = values['DO']
    if not math.isfinite(do) or do < 0:
        raise ValueError('DO must be finite and nonnegative')
    group_iv = [do_index(do/do_saturation(values['Temp'])*100)]
    for name, source in [('bod5','BOD5'),('cod','COD'),('nh4','Amoni'),('po4','Phosphat')]:
        group_iv.append(concentration_index(name, values[source]))
    group_v = concentration_index('coliform', values['Coliforms'])
    return ph_index(values['PH'])/100 * math.sqrt(sum(group_iv)/5 * group_v)


def round_wqi(value):
    if not math.isfinite(value):
        raise ValueError('WQI must be finite')
    return math.floor(min(100.0, max(0.0, value)) + 0.5)


def quality_class(score):
    for lower, label in [(91,'Rất tốt'),(76,'Tốt'),(51,'Trung bình'),(26,'Xấu'),
                         (10,'Kém'),(0,'Ô nhiễm rất nặng')]:
        if score >= lower:
            return label
    raise ValueError('WQI must be nonnegative')
