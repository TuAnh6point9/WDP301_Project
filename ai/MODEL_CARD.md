# callisto 2.0 — CatBoost Tuned model card

## Artifact and confirmed inputs

Lecturer-provided `CatBoost_Tuned_Top6 (1).cbm`; native SHA-256 `cbc6efa74027812d0dea074f6bef679a3aa4d50ebced05923908ef90a20c7008`. Loaded with CatBoost 1.2.10. User reports lecturer confirmation on 12/10/2026 that the artifact's six features are authoritative: **Coliforms, Amoni, PH, Phosphat, DO, COD**, in that exact order. This supersedes the Temp list in `CB_tuned_6_params.docx` for this integration.

500 trees, depth 5, learning rate approximately 0.03, RMSE loss, numeric features only, native nan_mode Min. Built-in scale/bias `(1, 53.391178131103516)` is already applied by `predict`. PKL contains the same native bytes; H5 is an HDF5 container holding the PKL bytes. Tuned joblib differs only in model GUID/finish-time metadata and produces identical results. The non-Tuned joblib is a different 1000-tree model and is not activated. The supplied best_params JSON is empty; runtime parameters are read from the model rather than that file.

## Serving and provenance

Schema `catboost-top6-amoni-v1`, version `callisto 2.0`, algorithm `CatBoost`, reference basis `lecturer-provided`, unit status `unverified`. API `nh4`/`po4` names do not establish N/P analytes. Raw numeric values are mapped explicitly to native positions, with no inferred transformation or imputation.

The handover does not establish measurement units, any external preprocessing, training-label origin, external inverse target transform, training min/max or independent evaluation. These remain unverified. No Callisto domain, label formula or MAE/RMSE/R2 is inherited. Native WQI outside 0–100 or nonfinite is rejected, not clipped. For display, the app uses half-up rounding then the existing six WQI bands (91/76/51/26/10). This is not a claim that the lecturer trained against VN-WQI 1460-derived labels.

## Verification and limitations

Parity checks on synthetic numeric inputs prove serialization/mapping/API consistency, not predictive accuracy. Automated tests cover login, model inference, MongoDB persistence, reload and owner history. Run `npm run ai:test` and the integration checks described in the repository README to verify a deployment; local run evidence is not distributed with the repository.

Native artifact remains private in `.local/ai/catboost/`. Old predictions and the Callisto 1.0 artifact remain unchanged; no data migration or historical recalculation is performed. See [CALLISTO_1_MODEL_CARD.md](CALLISTO_1_MODEL_CARD.md) for the old model's metrics only.
