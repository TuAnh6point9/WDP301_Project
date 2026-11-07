import type { PredictionStatus } from '@wqi/contracts';
import { calculateWqi, previewWqi, rememberPreview } from '@/features/predictions/api';
import { checkInputs, type FieldErrors, type InputValues } from '@/features/predictions/formRules';
import type { PreviewCalculation } from '@/features/predictions/types';

export type PredictionOutcome =
  | { kind: 'invalid'; errors: FieldErrors; firstInvalid: number }
  | { kind: 'saved'; id: string }
  | { kind: 'preview'; preview: PreviewCalculation };

/** Same path as the web form: the shared rules, then the same API calls (a guest's result is not stored). */
export async function submitPrediction(values: InputValues, signedIn: boolean, inputDomain?: PredictionStatus['inputDomain']): Promise<PredictionOutcome> {
  const { parsed, errors, firstInvalid } = checkInputs(values, inputDomain);
  if (!parsed.success || firstInvalid >= 0) return { kind: 'invalid', errors, firstInvalid };
  if (signedIn) return { kind: 'saved', id: (await calculateWqi(parsed.data)).id };
  const preview = await previewWqi(parsed.data);
  rememberPreview(preview);
  return { kind: 'preview', preview };
}

/** The web's checks on a chosen workbook (ExcelFileButton): an .xlsx file of at most 5 MB. Returns the message to show, or null. */
export function fileProblem(name: string, size: number | undefined) {
  return !/\.xlsx$/i.test(name) || (size ?? 0) > 5 * 1024 * 1024 ? 'Please choose an .xlsx file up to 5 MB.' : null;
}
