import type { GuideId, GuideStage, GuideStep } from '@/components/guides/GuidedTour';
import type { TranslationKey } from '@/i18n';
import { createElement } from 'react';
import { ExcelGuideExample } from './ExcelGuideExample';

type ExcelId = Extract<GuideId, 'excel-user' | 'excel-admin'>;
type ContentName = { [Key in TranslationKey]: Key extends `guide.${infer Name}Title` ? `guide.${Name}Body` extends TranslationKey ? Name : never : never }[TranslationKey];
function step(stage: GuideStage, target: string, name: ContentName, icon: GuideStep['icon']): GuideStep {
  return {
    id: `${stage}-${name}`, stage,
    title: `guide.${name}Title` as TranslationKey,
    body: `guide.${name}Body` as TranslationKey,
    target: `[data-tour="${target}"]`, icon,
    Example: () => createElement(ExcelGuideExample, { stage, name }),
  };
}

const user: GuideStep[] = [
  step('prepare', 'excel-user-upload', 'userPrepare', 'spreadsheet'),
  step('prepare', 'excel-user-upload', 'userColumns', 'sliders'),
  step('prepare', 'excel-user-upload', 'userChoose', 'upload'),
  step('preview', 'excel-user-details', 'userPreview', 'check'),
  step('preview', 'excel-user-results', 'userErrors', 'warn'),
  step('preview', 'excel-user-actions', 'userStart', 'sparkle'),
  step('progress', 'excel-user-progress', 'userProgress', 'pulse'),
  step('progress', 'excel-user-actions', 'userResume', 'refresh'),
  step('results', 'excel-user-results', 'userResults', 'chart'),
  step('results', 'excel-user-errors', 'userFilter', 'search'),
  step('results', 'excel-user-actions', 'userExport', 'download'),
  step('history', 'excel-user-history', 'userHistory', 'file'),
  step('history', 'excel-user-new', 'userNew', 'upload'),
];
const admin: GuideStep[] = [
  step('prepare', 'excel-admin-template', 'adminTemplate', 'download'),
  step('prepare', 'excel-admin-columns', 'adminColumns', 'sliders'),
  step('prepare', 'excel-admin-upload', 'adminUpload', 'upload'),
  step('fill', 'excel-admin-fill-range', 'adminRange', 'file'),
  step('fill', 'excel-admin-fill-station', 'adminStation', 'pin'),
  step('fill', 'excel-admin-fill-apply', 'adminCheck', 'check'),
  step('preview', 'excel-admin-check', 'adminPreview', 'check'),
  step('preview', 'excel-admin-check', 'adminErrors', 'warn'),
  step('preview', 'excel-admin-save', 'adminSave', 'save'),
  step('overwrite', 'excel-admin-overwrite', 'adminOverwrite', 'warn'),
  step('overwrite', 'excel-admin-overwrite-apply', 'adminConfirm', 'check'),
  step('results', 'excel-admin-saved', 'adminResults', 'check'),
  step('results', 'excel-admin-saved', 'adminWqi', 'sparkle'),
  step('results', 'excel-admin-history', 'adminHistory', 'file'),
];

export function excelFlow(id: ExcelId): readonly GuideStep[] { return id === 'excel-user' ? user : admin; }
export function excelStartIndex(id: ExcelId, stage: GuideStage): number {
  const index = excelFlow(id).findIndex(step => step.stage === stage);
  return Math.max(index, 0);
}
