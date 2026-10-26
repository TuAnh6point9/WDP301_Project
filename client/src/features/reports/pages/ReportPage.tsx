import { msg, useLocale } from '@/i18n';
import { Link } from 'react-router-dom';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { Icon } from '@/components/Icon';
import { Brand } from '@/components/Brand';
import { useAuth } from '@/features/auth/AuthContext';
import { listCalculationPage } from '@/features/predictions/api';
import { fieldsForRows, calculationCsv } from '@/features/predictions/snapshotFields';
import { ClassificationBadge } from '@/features/predictions/components/ClassificationBadge';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import { displayModelVersion } from '@/features/predictions/modelIdentity';
import { printInEnglish } from '@/i18n/printing';

/** A limited, printable preview of the current user's latest calculations. */
export function ReportPage() {
  useLocale();
  const { user, sessionEpoch } = useAuth();
  const { data, error, loading, reload } = useAsync(() => listCalculationPage(1, 20), [user?._id, sessionEpoch]);
  usePageReadiness(error ? 'error' : loading ? 'pending' : data?.data.length ? 'ready' : 'empty');
  if (loading || error || !data) return <PageStatus error={error} onRetry={reload}/>;
  const rows = data.data;
  const fields = fieldsForRows(rows);
  function exportCsv() {
    downloadCsv('wqi-latest-20-calculations.csv', calculationCsv(rows));
  }
  return <main className="container page">
    <div className="stack-4"><Link to="/history" className="back-link"><Icon name="back"/>{msg('common.history')}</Link><h1 className="h1">{msg('report.title')}</h1><p className="sub">{msg('report.description')}</p></div>
    <div className="report-layout">
      <aside className="card card-pad stack-24 report-options">
        <div className="stack-8"><span className="label-caps">{msg('report.scope')}</span><p className="small text-2">{msg('report.latest')}{' '}{rows.length} {msg('common.of')} {data.meta.total} {' '}{msg('report.scopeHint')}</p><Link to="/history" className="link small">{msg('report.allHistory')}</Link></div>
        <hr className="divider"/>
        <div className="stack-8"><span className="label-caps">{msg('common.download')}</span><button type="button" className="btn btn-primary" disabled={!rows.length} onClick={printInEnglish}><Icon name="download"/>{msg('report.print')}</button><button type="button" className="btn btn-secondary" disabled={!rows.length} onClick={exportCsv}><Icon name="download"/>{msg('report.csv')}</button></div>
      </aside>
      <section className="preview-stage" aria-label={msg('report.preview')}><article className="paper" lang="en">
        <div className="row-between" style={{ borderBottom: '2px solid var(--ink)', paddingBottom: 16 }}><div className="brand" style={{ fontSize: 14 }}><Brand small/>WQI An Kim Hai</div><span className="muted" style={{ fontSize: 11 }}>Generated {formatDateTime(new Date().toISOString(), 'en')}</span></div>
        <div className="stack-4"><h2 className="num" style={{ fontSize: 20 }}>WQI Calculation History Report</h2><p className="small text-2">Latest {rows.length} of {data.meta.total} calculations · {user?.name}</p></div>
        <p className="small text-2">Inputs and measurement units belong to each saved result. Missing measurements are shown as ?. Classification and source details are listed below.</p>
        <div className="stack-8"><h3 className="h4">Input Parameters and Results</h3><div className="table-wrap"><table className="table"><thead><tr><th>Calculated At</th>{fields.map(field => <th key={field.key}>{field.label}</th>)}<th>WQI</th><th>Class</th></tr></thead><tbody>{!rows.length && <tr><td colSpan={fields.length + 3} className="muted">No calculations yet.</td></tr>}{rows.map(item => <tr key={item.id}><td>{formatDateTime(item.at, 'en')}</td>{fields.map(field => <td key={field.key}>{item.inputs[field.key] ?? '—'}</td>)}<td className="strong">{item.wqi}</td><td><ClassificationBadge value={item.qualityClass} locale="en"/></td></tr>)}</tbody></table></div></div>
        {rows.length > 0 && <div className="stack-8"><h3 className="h4">Calculation Provenance</h3>{rows.map(item => <p className="small text-2" key={item.id} style={{ overflowWrap: 'anywhere' }}>{formatDateTime(item.at, 'en')} · {displayModelVersion(item.modelVersion)} · {item.unitStatus ?? 'Units not recorded'} · {item.unitBasis} · {item.referenceBasis ?? 'Source not recorded'}</p>)}</div>}
        <hr className="divider"/><p className="muted" style={{ fontSize: 10.5, textAlign: 'center' }}>WQI An Kim Hai · WQI research predictions · Latest 20 results only</p>
      </article></section>
    </div>
  </main>;
}
