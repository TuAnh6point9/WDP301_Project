> Historical Callisto 1.0 document. It does not describe the current CatBoost inference service.

# AKH WQI research model — initial run

The artifact predicts a same-sample VN_WQI reference from six measurements; it is not a future forecast. It is a **research approximation of a specified formula-derived target**, not validation against independently observed WQI, a regulatory publication or a drinking-water safety certificate.

## Artifact and data

Selected estimator: HistGradientBoostingRegressor (160 iterations, 15 leaf nodes, min leaf size 12, L2=1, seed 42), wrapped in a pipeline. Input order: **pH, DO, BOD5, Amoni as N, Phosphat as P, Coliform**. The six model inputs are raw values; no Temp auxiliary input or DO% feature is requested at inference. Tree preprocessing is identity. Ridge comparison uses StandardScaler fitted only inside training folds.

Model version: `callisto 1.0`, explicitly named at release; future releases use `callisto 2.0`, `callisto 3.0`, etc. The algorithm and fingerprints are technical provenance, not the model name. The existing artifact was renamed without retraining; predictions and its original training identity are unchanged. Historical identifiers are preserved in saved results. The identity fingerprint covers dataset SHA-256, unit status/basis, reference implementation, feature order, label/reference versions, training configuration/code, sklearn and NumPy versions. Source dataset SHA-256: `83111d5af3` prefix; complete checksums, code hashes and artifact hash are in private `.local/ai/metadata.json`. Dataset: 756 source rows, eight measurements; 754 eligible derived rows after explicit quarantine. Raw rows are unchanged.

Current `unitStatus` is **`assumed-for-research`**, authorized by the user. Assumptions: water Temp in °C; DO/BOD5/COD in mg/L; Amoni as N-NH4 in mg/L; Phosphat as P-PO4 in mg/L; Coliform in MPN/100mL; pH dimensionless. Workbook headers do not certify those analytes/units, laboratory methods, limits of detection or zero qualifiers.

Two source cells are quarantined in the derived training data: E122 DO=585 and F257 Amoni=2632, because prior QA questions remain unresolved. No decimal correction is invented. Remaining extreme values, including Amoni=1568, and IQR flags remain; IQR alone is not evidence of erroneous data. Quarantine values/reasons and source row references are logged privately.

## Reference target

Reference: [QD1460/QĐ-TCMT, 12/11/2019 official PDF](https://quantracmoitruong.gov.vn/storage/news_file_attach/QD%201460%20TCMT%20ngay%2012.11.2019%20WQI.pdf), SHA-256 `011a694265cef2cdf0326d6de24c65f09d905c43929e21af0f8d355dfd7fe0f9`.

Label version: `VN_WQI_1460_2019_formula3_I_IV5_V_coliform_v1`. Normative Formula 3 is used without extra organic-pollution weighting:

`WQI = (WQI_pH / 100) × sqrt(mean(WQI_DO%, WQI_BOD5, WQI_COD, WQI_N-NH4, WQI_P-PO4) × WQI_Coliform)`.

Targets use all eight source columns: Temp converts DO to saturation percentage offline; COD contributes a fifth group-IV index. The saturation polynomial cubic coefficient is **0.000077774**, checked against the official PDF. Target values are rounded half-up to integer before training. Inference predictions are rounded half-up and assigned six bands: <10, 10–25, 26–50, 51–75, 76–90, 91–100. Class labels follow section 1.4/the official announcement; the PDF's later descriptive table uses different wording for two bands, so labels are not mixed across tables.

The PDF worked example prints final values 16/19 inconsistent with its own displayed arithmetic. Normative tables and Formula 3 take precedence; those inconsistent totals are not golden expected outputs. A groups-I/IV/V case does not include the metal/pesticide multipliers present in that full worked example.

This is a partial set of VN_WQI groups **I, IV and V**, satisfying the structural minimum of three groups and at least three group-IV variables when other applicability/QA conditions are met. Groups II/III were not measured; their absence is not evidence that pesticide/metal pollution is absent. Research labeling does not certify suitability for official VN_WQI publication.

## Selection and locked evaluation

Exact six-input vectors are grouped before the fixed 20% holdout split (seed 42). Training has **603 rows**, holdout **151**. Three-fold GroupKFold on training only chooses the lowest MAE among Dummy, Ridge, RandomForest and HistGradientBoosting, using a small fixed candidate budget. Six-input CV mean MAE: Dummy 24.812, Ridge 16.701, RF 2.236, HGB **1.823** (fold SD 0.288). No tuning, preprocessing fitting or final refit uses the holdout.

| Locked holdout metric | Six raw inputs | Eight raw inputs benchmark |
| --- | ---: | ---: |
| MAE, WQI points | 1.364 | 1.279 |
| RMSE, WQI points | 2.122 | 2.104 |
| R² | 0.9945 | 0.9946 |
| Macro-F1, declared six classes | 0.9495 | 0.9584 |
| Balanced accuracy, observed classes | 0.9514 | 0.9635 |

The eight-input benchmark independently selects HGB with the same candidate budget, label definition, rows and folds. It is not exposed as the six-input service. Full CV, confusion matrices, class supports/recalls and metric definitions are in private `.local/ai/metrics.json`.

Six-input holdout class supports are 2/32/17/28/48/24, ordered from <10 to 91–100; recalls are 1.000/0.875/1.000/1.000/1.000/0.833. The most polluted class has only two holdout examples. Metrics must not be read as certainty for rare extremes or independent environmental quality.

COD and Temp influence the target but are absent from six-input inference. Their correlations with retained variables help prediction on this dataset but do not guarantee performance elsewhere. Formula-derived supervision is intentional; computing target-related subindices as model inputs or fitting transformations on the holdout would be leakage and is not done here.

There are no exact duplicate six/eight vectors in the original 756 rows. Without station/time/sample/campaign metadata, near-duplicate or related sample families cannot be reliably grouped. No temporal/new-station holdout or geographic generalization claim is supported. The fixed split is exploratory research evidence and is not an independent external validation.

## Serving domain and limits

Only fitted training min/max define the live numeric domain:

| Input | Minimum | Maximum |
| --- | ---: | ---: |
| pH | 5.2 | 7.99 |
| DO | 0.01 | 8.5 |
| BOD5 | 1.7 | 130.6 |
| N-NH4 | 0 | 1568 |
| P-PO4 | 0 | 5.46 |
| Coliform | 45 | 3,500,000 |

Physical validity is checked separately (finite/nonnegative; pH ≤14). Physical validity does not imply fitted-domain coverage. Three of 151 holdout rows fall outside these training bounds; reported offline regression metrics include all 151, while live service rejects those three as OOD rather than extrapolating. Accepted live coverage is therefore 148/151 for this holdout; no separate accepted-only accuracy claim is made.

Golden vectors check pipeline/service consistency, not model accuracy. `ready:true` means a valid artifact loaded successfully. It does not certify source units, pollution-group completeness or safe water use. Maintain immutable history snapshots/version identifiers; resolve units/QA and obtain independent station/time-aware validation before broader use.
