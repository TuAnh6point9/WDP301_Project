import { parameterDisplayKeys, qualityClassLabel } from '@wqi/contracts';
import type { Calculation, PreviewCalculation } from './types';
import { displayModelVersion } from './modelIdentity';

const LABELS: Record<string, string> = { coliform: 'Coliform', nh4: 'Amoni', ph: 'pH', po4: 'Phosphat', do: 'DO', cod: 'COD', bod5: 'BOD5', temp: 'Temp', tss: 'TSS' };
// Fields of older calculations (bod5, temp, tss) come after the six current ones.
const ORDER: string[] = [...parameterDisplayKeys, 'bod5', 'temp', 'tss'];
export function fieldsForSnapshot(item: PreviewCalculation) {
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
  return [['Calculated At', ...fields.map(field => field.label), 'Unit Basis', 'WQI', 'Raw WQI', 'Classification', 'Model Version', 'Original Model Identifier', 'Prediction Schema Version', 'Algorithm', 'Artifact SHA256', 'Unit Status', 'Reference Basis'],
    ...rows.map(item => [item.at, ...fields.map(field => item.inputs[field.key] ?? null), item.unitBasis, item.wqi, item.rawWqi ?? null, qualityClassLabel(item.qualityClass), displayModelVersion(item.modelVersion), item.modelVersion, item.predictionSchemaVersion ?? null, item.algorithm ?? null, item.artifactSha256 ?? null, item.unitStatus ?? null, item.referenceBasis ?? null])];
}
