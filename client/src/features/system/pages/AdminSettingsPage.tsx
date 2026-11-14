import { errorText } from '@/i18n/messages';
import { displayText, formatNumber, msg, useLocale, type TranslationKey } from '@/i18n';
import { useState, type ReactNode } from 'react';
import { QCVN_COLUMNS, QCVN_LIMITS, parameterDisplayKeys, parameterLabels, type QcvnChoice, type QcvnColumn, type SystemSettings } from '@wqi/contracts';
import { useToast } from '@/components/Modal';
import { PageStatus } from '@/components/PageStatus';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/http';
import { formatDateTime } from '@/lib/format';
import { getSettings, updateSettings } from '../api';
import { useFirstLoadReadiness } from '../components/AdminControls';

const UNITS: Record<string, string> = { coliform: 'MPN/100 mL', nh4: 'mg/L as N', ph: '—', po4: 'mg/L as P', do: 'mg/L', cod: 'mg/L' };
const COLUMN_HINT: Record<QcvnColumn, TranslationKey> = { A1: 'settings.columnA1', A2: 'settings.columnA2', B1: 'settings.columnB1', B2: 'settings.columnB2' };
/** "6 – 8,5", "≥ 5" or "≤ 0,3" in the reader's number format. */
function limitText([lo, hi]: readonly [number | null, number | null]) {
  if (lo !== null && hi !== null) return `${formatNumber(lo)} – ${formatNumber(hi)}`;
  return lo !== null ? `≥ ${formatNumber(lo)}` : hi !== null ? `≤ ${formatNumber(hi)}` : '—';
}

function Fixed({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return <div className="set-row">
    <div className="stack-4"><b>{title}</b><span className="small muted">{hint}</span></div>
    <span className="strong">{children}</span>
  </div>;
}

export function AdminSettingsPage() {
  useLocale();
  // keepPrevious: reloading after a save keeps the form (and its toast) on screen.
  const settings = useAsync(getSettings, [], { keepPrevious: true });
  useFirstLoadReadiness(settings.loading, settings.error);
  if (!settings.data) return <PageStatus admin error={settings.error} onRetry={settings.reload}/>;
  return <SettingsForm stored={settings.data} reload={settings.reload}/>;
}

function SettingsForm({ stored, reload }: { stored: SystemSettings; reload: () => void }) {
  useLocale();
  const toast = useToast();
  const [saved, setSaved] = useState(stored);
  const [column, setColumn] = useState<QcvnChoice>(stored.qcvnColumn);
  const [saving, setSaving] = useState(false);
  // A reload after another admin's change brings a newer stored value: follow it.
  if (stored.version > saved.version) { setSaved(stored); setColumn(stored.qcvnColumn); }
  const dirty = column !== saved.qcvnColumn;

  async function save() {
    setSaving(true);
    try {
      const next = await updateSettings({ qcvnColumn: column, version: saved.version });
      setSaved(next); setColumn(next.qcvnColumn);
      toast.show(msg('settings.saved'));
    } catch (error) {
      toast.show(errorText(error));
      // Another admin saved first: show what is stored now.
      if (error instanceof ApiError && error.status === 409) reload();
    } finally { setSaving(false); }
  }

  return <main className="admin-body settings-page">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">{msg('common.settings')}</h1>
        <p className="sub">{msg('settings.description')}</p>
      </div>
    </div>

    <form className="stack-24" onSubmit={event => { event.preventDefault(); if (dirty && !saving) void save(); }}>
      <section className="card card-pad stack" aria-labelledby="h-standard">
        <div className="stack-4">
          <h2 className="h3" id="h-standard">{msg('settings.limits')}</h2>
          <p className="small text-2">{msg('settings.limitsHint')}</p>
        </div>
        <fieldset className="qcvn-columns">
          <legend className="label">{msg('settings.columnInUse')}</legend>
          {QCVN_COLUMNS.map(option => <label key={option} className={option === column ? 'qcvn-column on' : 'qcvn-column'}>
            <input type="radio" name="qcvn-column" value={option} checked={option === column} disabled={saving} onChange={() => setColumn(option)}/>
            <span className="stack-4"><b>{msg('settings.column', { column: option })}</b><span className="small text-2">{msg(COLUMN_HINT[option])}</span></span>
          </label>)}
          <label className={column === 'none' ? 'qcvn-column qcvn-none on' : 'qcvn-column qcvn-none'}>
            <input type="radio" name="qcvn-column" value="none" checked={column === 'none'} disabled={saving} onChange={() => setColumn('none')}/>
            <span className="stack-4"><b>{msg('settings.columnNone')}</b><span className="small text-2">{msg('settings.columnNoneHint')}</span></span>
          </label>
        </fieldset>
        <p className="xs muted">{saved.updatedAt ? msg('settings.lastChanged', { time: formatDateTime(saved.updatedAt) }) : msg('settings.neverChanged')}</p>
        <div className="table-wrap">
          <table className="table compact qcvn-table">
            <caption className="small text-2">{msg('settings.tableCaption')}</caption>
            <thead><tr><th scope="col">{msg('common.parameter')}</th><th scope="col">{msg('common.unit')}</th>{QCVN_COLUMNS.map(option => <th key={option} scope="col" className={option === column ? 'is-focus' : undefined}>{msg('settings.column', { column: option })}</th>)}</tr></thead>
            <tbody>
              {parameterDisplayKeys.map(key => <tr key={key}>
                <th scope="row" className="strong">{parameterLabels[key]}</th><td className="text-2">{displayText(UNITS[key])}</td>
                {QCVN_COLUMNS.map(option => <td key={option} className={option === column ? 'is-focus' : undefined}>{limitText(QCVN_LIMITS[option][key])}</td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className="xs muted">{msg('settings.limitNote')}</p>
      </section>

      <section className="card card-pad" aria-labelledby="h-fixed">
        <div className="stack-4">
          <h2 className="h3" id="h-fixed">{msg('settings.fixed')}</h2>
          <p className="small text-2">{msg('settings.fixedHint')}</p>
        </div>
        {/* Values from server/src/modules/imports/import.routes.ts, server/src/app.ts (session) and contracts userSchema. */}
        <Fixed title={msg('settings.fileSize')} hint={msg('settings.fileSizeHint')}>5 MB</Fixed>
        <Fixed title={msg('settings.sessionTimeout')} hint={msg('settings.sessionHint')}>{msg('settings.hours8')}</Fixed>
        <Fixed title={msg('settings.passwordLength')} hint={msg('settings.passwordHint')}>{msg('settings.characters', { value: 12 })}</Fixed>
        <Fixed title={msg('settings.signup')} hint={msg('settings.signupHint')}>{msg('settings.signupValue')}</Fixed>
      </section>

      <div className="save-bar" hidden={!dirty} role="region" aria-label={msg('settings.unsaved')}>
        <span>{column === 'none' ? msg('settings.unsavedNone') : msg('settings.unsavedHint', { column })}</span>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setColumn(saved.qcvnColumn)}>{msg('settings.discard')}</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? msg('common.saving') : msg('common.saveChanges')}</button>
        </div>
      </div>
    </form>
    {toast.element}
  </main>;
}
