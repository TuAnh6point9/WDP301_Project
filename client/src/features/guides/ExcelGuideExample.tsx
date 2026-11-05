import { msg, useLocale, type TranslationKey } from '@/i18n';
import type { GuideStage } from '@/components/guides/GuidedTour';

/** A noninteractive picture of a future stage; never submits or mutates business data. */
export function ExcelGuideExample({ stage, name }: { stage: GuideStage; name: string }) {
  useLocale();
  const isUser = name.startsWith('user');
  const title = `guide.example${stage[0].toUpperCase()}${stage.slice(1)}` as TranslationKey;
  return <figure className="wqi-guide-example" aria-label={msg('guide.exampleLabel')}>
    <figcaption><strong>{msg('guide.exampleLabel')}</strong><span>{msg('guide.exampleNotData')}</span></figcaption>
    <div className="wqi-guide-example-body">
      <b>{msg(title)}</b>
      {stage === 'prepare' && <div className="wqi-guide-example-file"><span aria-hidden="true">XLSX</span><span>{msg('guide.exampleFile')}</span></div>}
      {stage === 'fill' && <div className="wqi-guide-example-grid"><span>{msg('imports.fillFrom')}: 2</span><span>{msg('imports.fillTo')}: 3</span><span>{msg('imports.batchCode')}: D01-2026</span><span>{msg('imports.fillStations')}: AH1</span></div>}
      {stage === 'preview' && <div className="wqi-guide-example-grid"><span>{msg('imports.rowsRead')}: 2</span><span>{msg(isUser ? 'excel.validPrefix' : 'imports.rowsToSave')}: 1</span><span>{msg(isUser ? 'excel.errorsPrefix' : 'imports.rowsNotSaved')}: 1</span><span>{msg('guide.exampleIssue')}</span></div>}
      {stage === 'progress' && <><div className="wqi-guide-example-progress"><i/></div><span>{msg('guide.exampleProgress')}</span></>}
      {stage === 'overwrite' && <div className="wqi-guide-example-grid"><span>D01-2026</span><span>{msg('guide.exampleOverwrite')}</span></div>}
      {stage === 'results' && <div className="wqi-guide-example-grid"><span>{msg('excel.totalRows')}: 2</span><span>{msg('excel.succeeded')}: 1</span><span>{msg('excel.errors')}: 1</span><span>{isUser ? 'WQI: 72' : msg('guide.examplePendingWqi')}</span></div>}
      {stage === 'history' && <div className="wqi-guide-example-grid"><span>{msg('guide.exampleFile')}</span><span>{msg('common.createdAt')}</span><span>{msg('common.status')}</span></div>}
      <small>{msg('guide.exampleCurrent', { name: msg(`guide.${name}Title` as TranslationKey) })}</small>
    </div>
  </figure>;
}
