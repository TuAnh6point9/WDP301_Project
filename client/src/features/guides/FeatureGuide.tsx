import type { ComponentProps } from 'react';
import { GuideButton, type GuideId, type GuideStage, type GuideStep } from '@/components/guides/GuidedTour';
import { displayText, msg, useLocale, type TranslationKey } from '@/i18n';
import { INPUT_FIELDS } from '@/features/predictions/inputFields';

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
    step('chart-parameters', 'chartParameters', 'sliders'), step('chart-plot', 'chartPoints', 'locate'),
    step('chart-settings', 'chartSettings', 'sliders'), step('chart-table', 'chartTable', 'download'),
  ] } },
  'excel-user': { title: 'guide.userExcelTitle', stages: {
    prepare: [step('excel-user-upload', 'userPrepare', 'spreadsheet'), step('excel-user-upload', 'userColumns', 'sliders'), step('excel-user-upload', 'userChoose', 'upload')],
    preview: [step('excel-user-details', 'userPreview', 'check'), step('excel-user-results', 'userErrors', 'warn'), step('excel-user-actions', 'userStart', 'sparkle')],
    progress: [step('excel-user-progress', 'userProgress', 'pulse'), step('excel-user-actions', 'userResume', 'refresh')],
    results: [step('excel-user-results', 'userResults', 'chart'), step('excel-user-errors', 'userFilter', 'search'), step('excel-user-actions', 'userExport', 'download')],
    history: [step('excel-user-history', 'userHistory', 'file'), step('excel-user-new', 'userNew', 'upload')],
  } },
  'excel-admin': { title: 'guide.adminExcelTitle', stages: {
    prepare: [step('excel-admin-template', 'adminTemplate', 'download'), step('excel-admin-columns', 'adminColumns', 'sliders'), step('excel-admin-upload', 'adminUpload', 'upload')],
    fill: [step('excel-admin-fill-range', 'adminRange', 'file'), step('excel-admin-fill-station', 'adminStation', 'pin'), step('excel-admin-fill-apply', 'adminCheck', 'check')],
    preview: [step('excel-admin-check', 'adminPreview', 'check'), step('excel-admin-check', 'adminErrors', 'warn'), step('excel-admin-save', 'adminSave', 'save')],
    overwrite: [step('excel-admin-overwrite', 'adminOverwrite', 'warn'), step('excel-admin-overwrite-apply', 'adminConfirm', 'check')],
    results: [step('excel-admin-saved', 'adminResults', 'check'), step('excel-admin-saved', 'adminWqi', 'sparkle'), step('excel-admin-history', 'adminHistory', 'file')],
  } },
};
type Props = Omit<ComponentProps<typeof GuideButton>, 'title' | 'steps'>;
export function FeatureGuide(props: Props) {
  const definition = definitions[props.id];
  const steps = definition.stages[props.stage];
  return steps ? <GuideButton {...props} title={definition.title} steps={steps}/> : null;
}
