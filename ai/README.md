# callisto 2.0 — lecturer CatBoost inference

The current service loads a native CBM once at startup, checks SHA-256 and runtime feature names against the deployment manifest, and reuses the estimator. It never loads a joblib/pickle inference model or invokes a training/reference formula fallback.

```powershell
npm run ai:setup
npm run ai:import -- --source "<path-to-reviewed-model.cbm>"
npm run dev:wqi
```

Replace the example path with the privately supplied reviewed artifact. Follow the repository [setup instructions](../README.md) for MongoDB, `.env` and the initial admin account. The import command validates the native model before copying it to `.local/ai/catboost/model.cbm` with `manifest.json`. The reviewed release manifest is `ai/catboost.manifest.json`. Artifacts stay ignored. `WQI_MODEL_PATH` overrides the native CBM path and `WQI_MODEL_MANIFEST` overrides the adjacent manifest path. A missing, corrupt, mismatched or legacy artifact leaves `/health` and valid `/predict` requests at 503. Invalid requests return 422; nonfinite native WQI returns 500 `AI_INFERENCE_ERROR`; native WQI outside 0–100 returns 500 `AI_OUTPUT_OUT_OF_RANGE` (batch: a per-row error) and is discarded, never clipped.

Ordered native features: `Coliforms, Amoni, PH, Phosphat, DO, COD`. API mapping: `coliform, nh4, ph, po4, do, cod`. Numeric source values go directly to the estimator. Its built-in scale/bias is applied by CatBoost. No external scaler, missing-value imputation, unit conversion or inverse target transform is inferred. External preprocessing/target provenance is unverified. Although native nan_mode is Min, application inputs must all be present and finite.

Units remain unverified, not inherited from Callisto. No train min/max or accuracy metrics are claimed. Raw output 0–100 is retained; half-up integer rounding and the existing six WQI bands are explicitly a display policy.

Run `npm run ai:test` for all Python regression tests. Private artifact tests compare native output to HTTP on 100 synthetic vectors and skip on CI when the private artifact is absent. Other tests cover mapping, readiness, validation and metadata integrity. Tests do not train a replacement model.

`ai/train.py` remains an archived Callisto 1.0 offline workflow with independent old feature/unit constants. `npm run ai:train` is not required for CatBoost and cannot produce a CatBoost release. See [CALLISTO_1_README.md](CALLISTO_1_README.md) for the historical training protocol; its old service startup command is superseded.
