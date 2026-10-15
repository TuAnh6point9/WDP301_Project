> Historical Callisto 1.0 document. It does not describe the current CatBoost inference service.

# callisto 1.0 ? WQI research model and AI Service

This service predicts WQI from six raw measurements with a trained scikit-learn pipeline. It does not run the reference formula at inference time. The current artifact is a research model trained against formula-derived VN_WQI labels; the source units/analytes were explicitly accepted as assumptions for research and are not certified measurements. See [MODEL_CARD.md](MODEL_CARD.md).

Run these commands from the repository root. Python 3.12 and `uv` are required. The virtual environment and generated data stay inside the workspace.

```powershell
$env:UV_CACHE_DIR = "$PWD/.local/uv-cache"
uv venv ai/.venv --python 3.12
uv pip install --python ai/.venv/Scripts/python.exe -r ai/requirements.txt
```

On Linux/macOS use `ai/.venv/bin/python` instead of `ai/.venv/Scripts/python.exe`.

Training requires an explicit unit status and `--model-version "callisto N.0"` (positive integer N); omission rejects the command. The current release is `callisto 1.0`. Use a higher version, such as `callisto 2.0`, for a new release; the CLI rejects the same or a lower version than the artifact in the chosen output directory. If a valid artifact already exists, skip training. Checksums and estimator names remain separate technical provenance. `confirmed` must only be used with documented source-unit confirmation. The initial training command is:

```powershell
$env:OMP_NUM_THREADS = '1'
$env:OPENBLAS_NUM_THREADS = '1'
$env:PYTHONUTF8 = '1'
ai/.venv/Scripts/python.exe -m ai.train --source .local/datasets/AKH-5_2026.raw.json --output .local/ai --unit-status assumed-for-research --model-version "callisto 1.0"
```

One native thread also avoids Windows sandbox restrictions on multiprocessing named pipes. Training compares Dummy, Ridge, RandomForest and HistGradientBoosting by three-fold grouped CV on the training partition. It keeps the 20% holdout frozen, does not refit on that holdout, and evaluates an eight-input benchmark on the same labels/split. No synthetic measurement rows are generated. The output directory must stay under `.local/ai`.

The generated files are private/ignored:

| File | Purpose |
| --- | --- |
| `model.joblib` | Six-input fitted pipeline and embedded metadata |
| `metadata.json` | Source/reference hashes, versions, assumptions, training domain and artifact hash |
| `metrics.json` | CV selection, six/eight holdout results, class supports and OOD coverage |
| `labels.json` | Formula-derived integer targets with source row provenance |
| `quarantine.json` | Explicit unresolved source values/reasons; raw is unchanged |
| `split.json` | Frozen training/holdout row identities |
| `golden_vectors.json` | Model/service parity cases; these are not accuracy evidence |

Only load trusted artifacts produced and reviewed by this project: joblib loading can execute Python code. Select the artifact explicitly; this module does not change backend configuration or enable production:

```powershell
$env:WQI_MODEL_PATH = "$PWD/.local/ai/model.joblib"
$env:OMP_NUM_THREADS = '1'
$env:OPENBLAS_NUM_THREADS = '1'
ai/.venv/Scripts/python.exe -m uvicorn ai.service:configured_app --factory --host 127.0.0.1 --port 8000
```

Without `WQI_MODEL_PATH`, health and inference return 503. A missing or invalid configured artifact also keeps readiness false and inference unavailable; health reports `reason: "artifact_missing" | "artifact_invalid"` without exposing file paths or exception details. Bind on localhost unless deployment authentication/network controls have been configured separately.

## HTTP contract

`POST /predict` takes this exact shape, with numeric values and no extra fields:

```json
{
  "parameters": {"ph": 7, "do": 5, "bod5": 10, "nh4": 1, "po4": 0.2, "coliform": 5000},
  "unitBasis": "mg/L; NH4 as N; PO4 as P; Coliform MPN/100mL"
}
```

The fixed feature order is `ph, do, bod5, nh4, po4, coliform`. NH4 is reported as N; PO4 as P. DO/BOD5/N/P use mg/L; pH is dimensionless and Coliform uses MPN/100mL. Temp and COD are absent from inference. Preserve both separately in application/source records.

Success is an unwrapped object with exactly `wqi` (integer 0–100), `qualityClass`, `modelVersion`, `classificationVersion: "VN_WQI_1460_2019"`, `referenceBasis: "formula-derived"` and `unitStatus: "confirmed" | "assumed-for-research"`. WQI is rounded half-up before assigning the six-class label. No warning field is added to this strict response; the unit-status field identifies the research assumptions.

`GET /health` returns `ready`, `modelVersion`, `classificationVersion`, `unitStatus` and `inputDomain` (six `{min,max}` entries). With no model, ready is false and modelVersion/unitStatus/inputDomain are null (HTTP 503); with a loaded valid model, HTTP 200. Technical readiness does not certify units, accuracy or water safety.

Physical/schema invalidity returns 422 `AI_INVALID_INPUT`. Numeric values outside the fitted training min/max return 422 `AI_INPUT_OUTSIDE_DOMAIN`, with `error.details` keyed by the offending field and containing `{min,max,value}`. Missing model returns 503 `AI_MODEL_NOT_READY`; failed/nonfinite/out-of-scale model inference returns 500 `AI_INFERENCE_ERROR`. No formula fallback, silent extrapolation, retry or successful-prediction persistence occurs inside this service.

## Verification

```powershell
ai/.venv/Scripts/python.exe -m pytest -c ai/pytest.ini ai/tests -q
```

Tests cover normative breakpoints/discontinuities, DO saturation, class boundaries/rounding, strict input validation, OOD/not-ready handling, unit gating, source-preserving quarantine and grouped splitting. If private artifacts exist, additional acceptance tests verify their SHA-256, frozen split and real trained-pipeline HTTP golden vectors. Those tests skip explicitly on a checkout without private data/artifacts.

Changing label semantics requires a new `LABEL_VERSION` and model version, fresh golden vectors and a documented evaluation plan. Do not tune against the existing holdout or reuse published scores for a changed pipeline.
