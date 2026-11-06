import { errorText } from '@/i18n/messages';
import { msg, useLocale } from '@/i18n';
import { USER_MESSAGES as M, parameterDisplayKeys, parameterLabels } from '@wqi/contracts';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { batchText, tone, wqiText } from '@/lib/wqi';
import { Icon } from '@/components/Icon';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { PageStatus } from '@/components/PageStatus';
import { Pager } from '@/components/Pager';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import { useFirstLoadReadiness } from '@/features/system/components/AdminControls';
import { ClassificationBadge } from '@/features/predictions/components/ClassificationBadge';
import type { Calculation } from '@/features/predictions/types';
import { listAdminRecords } from '@/features/water-records/api';
import type { AdminRecord } from '@/features/water-records/types';
import { listAdminStations } from '../api';
import type { Station } from '../types';

const COLUMNS = 3 + parameterDisplayKeys.length;

/** /admin/stations/details?station=<code>: one station's approved measurements, read only. Waiting and rejected rows stay on Review Data. */
export function AdminStationDetailPage() {
  useLocale();
  const code = useSearchParams()[0].get('station')?.trim() ?? '';
  const stations = useAsync(listAdminStations);
  if (!stations.data) return <PageStatus admin error={stations.error} onRetry={stations.reload}/>;
  const station = stations.data.find(s => s.code === code);
  return station ? <StationRecords key={station.id} station={station}/> : <StationNotFound code={code}/>;
}

function StationNotFound({ code }: { code: string }) {
  useLocale();
  usePageReadiness('empty');
  return <main className="admin-body">
    <div className="callout callout-warn" role="alert"><Icon name="warn"/><span>{msg('stations.notFound', { code })}</span></div>
    <div><Link to="/admin/stations" className="btn btn-secondary"><Icon name="back"/>{msg('stations.backToList')}</Link></div>
  </main>;
}

function StationRecords({ station }: { station: Station }) {
  useLocale();
  const [page, setPage] = useState(1);
  const records = useAsync(() => listAdminRecords({ status: 'verified', stationId: station.id, createdFrom: '', createdTo: '', page }), [station.id, page], { keepPrevious: true });
  useFirstLoadReadiness(records.loading, records.error);
  const rows = records.data?.data ?? [];
  const total = records.data?.meta.total;
  const { latest } = station;
  // The row the station shows on the map (decision 28).
  const onMap = (r: AdminRecord) => !!latest && r.batchCode === latest.batchCode && (r.batchRow ?? null) === latest.batchRow;
  const active = station.status === 'active';

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <Link to="/admin/stations" className="back-link"><Icon name="back"/>{msg('common.stations')}</Link>
        <h1 className="h1">{msg('stations.detailsHeading', { code: station.code })}</h1>
        <p className="sub">{station.name}</p>
      </div>
    </div>

    <dl className="card card-pad dash-numbers">
      <div><dt>{msg('common.status')}</dt><dd><span className={`status ${active ? 'ok' : 'off'}`}>{msg(active ? 'common.active' : 'common.inactive')}</span></dd></div>
      <div><dt>{msg('stations.area')}</dt><dd>{station.administrativeArea}</dd></div>
      <div><dt>{msg('common.coordinates')}</dt><dd className="mono">{station.lat.toFixed(4)}, {station.lng.toFixed(4)}</dd></div>
      <div><dt>{msg('stations.showing')}</dt><dd>{latest
        ? <span className="stack-4"><span className="row" style={{ gap: 6 }}><span className={`dot ${tone(latest.wqi)}`}/>{wqiText(latest)}</span><span className="xs muted">{batchText(latest)}</span></span>
        : <span className="row muted" style={{ gap: 6 }}><span className="dot none"/>{msg('stations.noApprovedBatch')}</span>}</dd></div>
    </dl>

    <section className="card card-flush" aria-labelledby="approved-title">
      <div className="card-head">
        <h2 className="h3" id="approved-title">{msg('stations.approvedData')}</h2>
        {total !== undefined && <span className="small text-2">{msg('records.total', { count: total })}</span>}
      </div>
      <div className="table-wrap" aria-busy={records.loading}>
        <table className="table">
          <thead><tr><th>{msg('records.batchColumn')}</th>{parameterDisplayKeys.map(key => <th key={key}>{parameterLabels[key]}</th>)}<th>WQI</th><th>{msg('map.classification')}</th></tr></thead>
          <tbody>
            {records.loading && !records.data && <tr className="empty-row"><td colSpan={COLUMNS}><LoadingIndicator scope="inline"/></td></tr>}
            {records.error && <tr className="empty-row"><td colSpan={COLUMNS} role="alert">{errorText(records.error, M.LOAD_FAILED)} <button type="button" className="btn btn-secondary btn-sm" onClick={records.reload}><Icon name="refresh"/>{msg('common.retry')}</button></td></tr>}
            {records.data && !rows.length && <tr className="empty-row"><td colSpan={COLUMNS}><div className="empty-state">
              <p>{msg('stations.noApprovedData', { code: station.code })}</p>
              <p className="small">{msg('stations.pendingElsewhere')}</p>
              <Link to="/admin/data" className="btn btn-secondary">{msg('stations.openReview')}</Link>
            </div></td></tr>}
            {rows.map(r => <tr key={r._id}>
              <td>{r.measuredAt ? formatDateTime(r.measuredAt) : r.batchCode ? <span className="stack-4">
                <span>{r.batchRow == null ? r.batchCode : msg('records.batchCell', { code: r.batchCode, row: r.batchRow })}</span>
                {onMap(r) && <span className="row xs c-brand strong" style={{ gap: 4 }}><Icon name="pin" width={14} height={14}/>{msg('records.onMap')}</span>}
              </span> : '—'}</td>
              {parameterDisplayKeys.map(key => <td key={key}>{r.parameters[key]}</td>)}
              <td className="strong">{r.wqi ?? '—'}</td>
              <td>{r.qualityClass ? <ClassificationBadge value={r.qualityClass as Calculation['qualityClass']}/> : '—'}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager meta={records.data?.meta} noun="records" onPage={setPage}/>
    </section>
  </main>;
}
