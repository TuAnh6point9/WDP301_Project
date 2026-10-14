/** Only this verified artifact was renamed; unfamiliar versions keep their identity. */
const LEGACY_CALLISTO_VERSION = 'akh-vn1460-hist_gradient_boosting-e4f7df4de0428c62';
export const CURRENT_MODEL_VERSION = 'callisto 2.0';

export function displayModelVersion(version: string): string {
  return version === LEGACY_CALLISTO_VERSION ? 'callisto 1.0' : version;
}
