import type { ComponentProps } from 'react';
import { GuideButton, type GuideId, type GuideStage, type GuideStep } from '@/components/guides/GuidedTour';
import { displayText, msg, useLocale, type TranslationKey } from '@/i18n';
import { INPUT_FIELDS } from '@/features/predictions/inputFields';
import { useAuth } from '@/features/auth/AuthContext';
import { excelFlow } from './excelGuideFlow';

type ContentName = { [Key in TranslationKey]: Key extends `guide.${infer Name}Title` ? `guide.${Name}Body` extends TranslationKey ? Name : never : never }[TranslationKey];
function step(id: string, name: ContentName, icon: GuideStep['icon'] = 'file'): GuideStep {
  return { id, title: `guide.${name}Title` as TranslationKey, body: `guide.${name}Body` as TranslationKey, icon, target: `[data-tour="${id}"]` };
}
function InputDetails() {
  useLocale();
  return <dl className="wqi-guide-fields">{INPUT_FIELDS.map(field => <div key={field.key}><dt>{displayText(field.label)}</dt><dd>{msg(`guide.field${field.key}`)}</dd></div>)}</dl>;
}
function SourceNote() { useLocale(); return <p className="wqi-guide-note">{msg('guide.sourceNote')}</p>; }
function ResetNote() { useLocale(); return <p className="wqi-guide-note">{msg('guide.resetNote')}</p>; }
function ResultSummary() { useLocale(); return <ul className="wqi-guide-summary"><li>{msg('guide.resultScore')}</li><li>{msg('guide.resultInputs')}</li><li>{msg('guide.resultHistory')}</li></ul>; }
const calculation: GuideStep[] = [
  { ...step('intro', 'welcome', 'drop'), target: '[data-wqi-guide="intro"]' },
  { ...step('inputs', 'inputs', 'sliders'), target: '[data-wqi-guide="inputs"]', Content: InputDetails },
  { ...step('validation', 'check', 'check'), target: '[data-wqi-guide="validation"]', Content: SourceNote },
  { ...step('actions', 'calculate', 'sparkle'), target: '[data-wqi-guide="actions"]', Content: ResetNote },
  { ...step('results', 'results', 'chart'), target: undefined, Content: ResultSummary },
];
const definitions: Record<GuideId, { title: TranslationKey; stages: Partial<Record<GuideStage, GuideStep[]>> }> = {
  calculate: { title: 'guide.title', stages: { overview: calculation } },
  chart: { title: 'guide.chartTitle', stages: { overview: [
    step('chart-filters', 'chartFilters', 'search'), step('chart-rounds', 'chartRounds', 'chart'),
    { ...step('chart-parameters', 'chartParameters', 'sliders'), target: '[data-tour="chart-parameters"], [data-tour="chart-comparison"]' },
    step('chart-plot', 'chartPoints', 'locate'),
    step('chart-settings', 'chartSettings', 'sliders'), step('chart-table', 'chartTable', 'download'),
  ] } },
  'excel-user': { title: 'guide.userExcelTitle', stages: {} },
  'excel-admin': { title: 'guide.adminExcelTitle', stages: {} },
};
type Props = Omit<ComponentProps<typeof GuideButton>, 'title' | 'steps' | 'accountId'>;
export function FeatureGuide(props: Props) {
  const auth = useAuth();
  const definition = definitions[props.id];
  const steps = props.id === 'excel-user' || props.id === 'excel-admin' ? excelFlow(props.id) : definition.stages[props.stage];
  const allowed = auth.status === 'anonymous' || (auth.status === 'authenticated' && auth.autoGuides);
  return steps ? <GuideButton {...props} title={definition.title} steps={steps} accountId={auth.user?._id} introAllowed={allowed}
    ready={props.ready !== false && auth.status !== 'loading' && !auth.pending}
    autoStart={props.autoStart !== false && allowed}/> : null;
}
