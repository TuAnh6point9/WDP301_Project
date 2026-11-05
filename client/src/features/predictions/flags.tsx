import type { ReactNode } from 'react';
import { inputFlag, type InputFlag, type PredictionParameters } from '@wqi/contracts';
import { msg, type TranslationKey } from '@/i18n';

// Preprocessing v1 (05/11/2026): a flag only draws the eye. Red: likely typo; amber: the model cannot score this pH.
const TEXT: Record<InputFlag, [label: TranslationKey, hint: TranslationKey]> = {
  'likely-typo': ['flags.typo', 'flags.typoHint'],
  'ai-unreliable': ['flags.ai', 'flags.aiHint'],
};
export const flagLabel = (flag: InputFlag) => msg(TEXT[flag][0]);
export const flagHint = (flag: InputFlag) => msg(TEXT[flag][1]);

/** A table cell for one of the six measurements, marked when it carries a flag. */
export function FlagCell({ name, value, children }: { name: keyof PredictionParameters; value: number | undefined; children: ReactNode }) {
  const flag = inputFlag(name, value);
  if (!flag) return <td>{children}</td>;
  return <td className={flag === 'likely-typo' ? 'cell-flag' : 'cell-flag is-warn'} title={flagHint(flag)}>{children}<span className="sr-only"> ({flagLabel(flag)})</span></td>;
}
