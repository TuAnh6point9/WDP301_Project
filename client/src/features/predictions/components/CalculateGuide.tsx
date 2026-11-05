import { FeatureGuide } from '@/features/guides/FeatureGuide';

export function CalculateGuide({ busy }: { busy: boolean }) {
  return <FeatureGuide id="calculate" stage="overview" busy={busy}/>;
}
