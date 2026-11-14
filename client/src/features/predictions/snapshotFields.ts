import { parameterDisplayKeys, rawParameterColumns } from '@wqi/contracts';
import type { Calculation, PreviewCalculation } from './types';

const LABELS: Record<string, string> = { coliform: 'Coliform', nh4: 'Amoni', ph: 'pH', po4: 'Phosphat', do: 'DO', cod: 'COD', bod5: 'BOD5', temp: 'Temp', tss: 'TSS' };
// Fields of older calculations (bod5, temp, tss) come after the six current ones.
const ORDER: string[] = [...parameterDisplayKeys, 'bod5', 'temp', 'tss'];
export function fieldsForSnapshot(item: PreviewCalculation) {
  const keys = [...ORDER.filter(key => Object.hasOwn(item.inputs, key)), ...Object.keys(item.inputs).filter(key => !ORDER.includes(key))];
  return keys.map(key => {
    const unit = key === 'ph' ? 'dimensionless' : item.unitBasis === 'training-source-unverified' ? 'source unit (unverified)'
      : key === 'temp' ? '°C' : key === 'coliform' && item.unitBasis.includes('Coliform MPN/100mL') ? 'MPN/100mL'
      : item.unitBasis.startsWith('mg/L') ? 'mg/L' : 'unit not recorded';
    return { key, label: LABELS[key] ?? key, unit };
  });
}
export function fieldsForRows(rows: Calculation[]) {
  const fields = new Map<string, { key: string; label: string }>();
  for (const row of rows) for (const field of fieldsForSnapshot(row)) fields.set(field.key, { key: field.key, label: field.label });
  return [...fields.values()];
}
// Printed and downloaded reports use the data-entry template's column names (user's request 06/11).
const TEMPLATE: Record<string, string> = { ...rawParameterColumns, bod5: 'BOD5', temp: 'Temp', tss: 'TSS' };
export const templateColumn = (key: string) => TEMPLATE[key] ?? key;
