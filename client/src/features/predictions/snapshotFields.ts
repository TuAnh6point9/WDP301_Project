import type { Calculation } from './types';
import { displayModelVersion } from './modelIdentity';

const LABELS: Record<string, string> = { ph: 'pH', do: 'DO', cod: 'COD', bod5: 'BOD5', nh4: 'Amoni', po4: 'Phosphat', coliform: 'Coliform', temp: 'Temp', tss: 'TSS' };
const ORDER = ['ph', 'do', 'bod5', 'cod', 'nh4', 'po4', 'coliform', 'temp', 'tss'];
export function fieldsForSnapshot(item: Calculation) {
  const keys = [...ORDER.filter(key => Object.hasOwn(item.inputs, key)), ...Object.keys(item.inputs).filter(key => !ORDER.includes(key))];
  return keys.map(key => {
    const unit = key === 'ph' ? 'dimensionless' : item.unitBasis === 'training-source-unverified' ? 'source unit (unverified)'
      : key === 'temp' ? '°C' : key === 'coliform' && item.unitBasis.includes('Coliform MPN/100mL') ? 'MPN/100mL'
      : key === 'nh4' && item.unitBasis.includes('NH4 as N') ? 'mg/L as N'
      : key === 'po4' && item.unitBasis.includes('PO4 as P') ? 'mg/L as P'
      : item.unitBasis.startsWith('mg/L') ? 'mg/L' : 'unit not recorded';
    return { key, label: LABELS[key] ?? key, unit };
  });
}
export function fieldsForRows(rows: Calculation[]) {
  const fields = new Map<string, { key: string; label: string }>();
  for (const row of rows) for (const field of fieldsForSnapshot(row)) fields.set(field.key, { key: field.key, label: field.label });
  return [...fields.values()];
}
export function calculationCsv(rows: Calculation[]): (string | number | null)[][] {
  const fields = fieldsForRows(rows);
  return [['Calculated At', ...fields.map(field => field.label), 'Unit Basis', 'WQI', 'Raw WQI', 'Classification', 'Model Version', 'Original Model Identifier', 'Prediction Schema Version', 'Algorithm', 'Artifact SHA256', 'Classification Version', 'Unit Status', 'Reference Basis'],
    ...rows.map(item => [item.at, ...fields.map(field => item.inputs[field.key] ?? null), item.unitBasis, item.wqi, item.rawWqi ?? null, item.qualityClass, displayModelVersion(item.modelVersion), item.modelVersion, item.predictionSchemaVersion ?? null, item.algorithm ?? null, item.artifactSha256 ?? null, item.classificationVersion ?? null, item.unitStatus ?? null, item.referenceBasis ?? null])];
}
