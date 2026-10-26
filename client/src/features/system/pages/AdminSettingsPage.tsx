import { displayText } from '@/i18n';
import { msg, useLocale } from '@/i18n';
import { nativeValidationHandlers } from '@/lib/nativeValidation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useToast } from '@/components/Modal';

// QCVN 08-MT:2015/BTNMT surface water limits per column.
const STD = {
  A1: { ph: [6, 8.5], do: [6, null], bod: [null, 4], cod: [null, 10], nh4: [null, .3], col: [null, 2500] },
  A2: { ph: [6, 8.5], do: [5, null], bod: [null, 6], cod: [null, 15], nh4: [null, .3], col: [null, 5000] },
  B1: { ph: [5.5, 9], do: [4, null], bod: [null, 15], cod: [null, 30], nh4: [null, .9], col: [null, 7500] },
  B2: { ph: [5.5, 9], do: [2, null], bod: [null, 25], cod: [null, 50], nh4: [null, .9], col: [null, 10000] },
} as const;
type Column = keyof typeof STD;
type ParamKey = keyof typeof STD.A2;
const PARAMS: [ParamKey, string, string][] = [['ph', 'pH', '—'], ['do', 'DO', 'mg/L'], ['bod', 'BOD5', 'mg/L'], ['cod', 'COD', 'mg/L'], ['nh4', 'NH₄⁺', 'mg/L'], ['col', 'Coliform', 'MPN/100mL']];
const SECTIONS = [['general', 'General'], ['standard', 'WQI & Limits'], ['import', 'Data Import'], ['notify', 'Notifications'], ['security', 'Security']] as const;
const limitsOf = (column: Column) => Object.fromEntries(PARAMS.map(([key]) => [key, STD[column][key].map(v => v === null ? '' : String(v))])) as Record<ParamKey, string[]>;

const INITIAL = {
  name: 'WQI An Kim Hai', org: 'Hai Phong Department of Natural Resources & Environment', lang: 'Vietnamese', tz: 'dmy',
  std: 'A2' as Column, limits: limitsOf('A2'),
  size: '10', dup: 'skip', partial: true, recalc: true,
  alert: true, threshold: '50', importMail: false, outage: true,
  session: '2h', twoFactor: false, signup: false, pwLen: '8',
};
type Settings = typeof INITIAL;

function Row({ title, hint, children, labelFor }: { title: string; hint: string; children: ReactNode; labelFor?: string }) {
  useLocale();
  return <div className="set-row">
    <div className="stack-4"><b>{labelFor ? <label htmlFor={labelFor}>{displayText(title)}</label> : displayText(title)}</b><span className="small muted">{displayText(hint)}</span></div>
    {children}
  </div>;
}
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  useLocale();
  return <label className="switch"><input type="checkbox" role="switch" aria-label={displayText(label)} checked={checked} onChange={event => onChange(event.target.checked)}/><span/></label>;
}

export function AdminSettingsPage() {
  useLocale();
  const toast = useToast();
  const [saved, setSaved] = useState(INITIAL);
  const [s, setS] = useState(INITIAL);
  const [activeSection, setActiveSection] = useState('general');
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setS(previous => ({ ...previous, [key]: value }));

  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) setActiveSection(entry.target.id); }), { rootMargin: '-30% 0px -60% 0px' });
    Object.values(refs.current).forEach(element => { if (element) observer.observe(element); });
    return () => observer.disconnect();
  }, []);
  const section = (id: string) => (element: HTMLElement | null) => { refs.current[id] = element; };

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">{msg('common.settings')}</h1>
        <p className="sub">{msg('settings.description')}</p>
      </div>
    </div>

    <div className="settings">
      <nav className="settings-nav" aria-label={msg('settings.sections')}>
        {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} className={activeSection === id ? 'on' : undefined} aria-current={activeSection === id ? 'true' : undefined} onClick={event => { event.preventDefault(); refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{displayText(label)}</a>)}
      </nav>

      <form className="stack-24" {...nativeValidationHandlers} onSubmit={event => event.preventDefault()}>
        <section className="card card-pad set-sec" id="general" ref={section('general')} aria-labelledby="h-general">
          <h2 className="h3" id="h-general">{msg('settings.general')}</h2>
          <Row title={msg('settings.systemName')} hint={msg('settings.systemNameHint')} labelFor="s-name"><input id="s-name" className="input sm" value={s.name} onChange={e => set('name', e.target.value)}/></Row>
          <Row title={msg('settings.organization')} hint={msg('settings.organizationHint')} labelFor="s-org"><input id="s-org" className="input sm" value={s.org} onChange={e => set('org', e.target.value)}/></Row>
          <Row title={msg('settings.defaultLanguage')} hint={msg('settings.languageHint')} labelFor="s-lang"><select id="s-lang" className="input sm" value={s.lang} onChange={e => set('lang', e.target.value)}><option value="Vietnamese">{msg('settings.vietnamese')}</option><option value="English">{msg('settings.english')}</option></select></Row>
          <Row title={msg('settings.timezone')} hint={msg('settings.timezoneHint')} labelFor="s-tz"><select id="s-tz" className="input sm" value={s.tz} onChange={e => set('tz', e.target.value)}><option value="dmy">GMT+7 (Asia/Ho_Chi_Minh) · dd/mm/yyyy</option><option value="ymd">GMT+7 (Asia/Ho_Chi_Minh) · yyyy-mm-dd</option></select></Row>
        </section>

        <section className="card card-pad set-sec stack" id="standard" ref={section('standard')} aria-labelledby="h-standard">
          <h2 className="h3" id="h-standard">{msg('settings.limits')}</h2>
          <div className="set-row" style={{ paddingTop: 0 }}>
            <div className="stack-4"><b><label htmlFor="s-std">{msg('settings.referenceStandard')}</label></b><span className="small muted">{msg('settings.limitsHint')}</span></div>
            <select id="s-std" className="input sm" value={s.std} onChange={e => { const column = e.target.value as Column; setS(previous => ({ ...previous, std: column, limits: limitsOf(column) })); }}>
              {(Object.keys(STD) as Column[]).map(column => <option key={column} value={column}>{msg('settings.columnPrefix')}{' '}{column}</option>)}
            </select>
          </div>
          <div className="card card-flush" style={{ boxShadow: 'none' }}>
            <div className="table-wrap">
              <table className="table compact limits-table">
                <thead><tr><th>{msg('common.parameter')}</th><th>{msg('common.unit')}</th><th>{msg('settings.lowerLimit')}</th><th>{msg('settings.upperLimit')}</th></tr></thead>
                <tbody>
                  {PARAMS.map(([key, name, unit]) => <tr key={key}>
                    <td className="strong">{displayText(name)}</td><td className="text-2">{unit}</td>
                    {[0, 1].map(bound => <td key={bound}><input type="number" step="any" className="input sm" placeholder="—" aria-label={msg(bound ? 'common.upperLabel' : 'common.lowerLabel', { name })} value={s.limits[key][bound]} onChange={e => setS(previous => ({ ...previous, limits: { ...previous.limits, [key]: bound ? [previous.limits[key][0], e.target.value] : [e.target.value, previous.limits[key][1]] } }))}/></td>)}
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>
          <span className="xs muted">{msg('settings.changeStandardHint')}</span>
        </section>

        <section className="card card-pad set-sec" id="import" ref={section('import')} aria-labelledby="h-import">
          <h2 className="h3" id="h-import">{msg('settings.dataImport')}</h2>
          <Row title={msg('settings.fileSize')} hint={msg('settings.fileSizeHint')} labelFor="s-size"><div className="input-unit"><input id="s-size" type="number" min="1" max="50" className="input sm" value={s.size} onChange={e => set('size', e.target.value)}/><em>MB</em></div></Row>
          <Row title={msg('settings.duplicateHandling')} hint={msg('settings.duplicateHint')} labelFor="s-dup"><select id="s-dup" className="input sm" value={s.dup} onChange={e => set('dup', e.target.value)}><option value="skip">{msg('settings.skipDuplicate')}</option><option value="replace">{msg('settings.replace')}</option></select></Row>
          <Row title={msg('settings.partial')} hint={msg('settings.partialHint')}><Switch label={msg('settings.partial')} checked={s.partial} onChange={v => set('partial', v)}/></Row>
          <Row title={msg('settings.recalculate')} hint={msg('settings.recalculateHint')}><Switch label={msg('settings.recalculate')} checked={s.recalc} onChange={v => set('recalc', v)}/></Row>
        </section>

        <section className="card card-pad set-sec" id="notify" ref={section('notify')} aria-labelledby="h-notify">
          <h2 className="h3" id="h-notify">{msg('settings.notifications')}</h2>
          <Row title={msg('settings.emailAlert')} hint={msg('settings.emailAlertHint')}><Switch label={msg('settings.emailAlert')} checked={s.alert} onChange={v => set('alert', v)}/></Row>
          <Row title={msg('settings.threshold')} hint={msg('settings.thresholdHint')} labelFor="s-th"><div className="input-unit"><input id="s-th" type="number" min="0" max="100" className="input sm" disabled={!s.alert} value={s.threshold} onChange={e => set('threshold', e.target.value)}/><em>WQI</em></div></Row>
          <Row title={msg('settings.importEmail')} hint={msg('settings.importEmailHint')}><Switch label={msg('settings.importEmail')} checked={s.importMail} onChange={v => set('importMail', v)}/></Row>
          <Row title={msg('settings.outage')} hint={msg('settings.outageHint')}><Switch label={msg('settings.outage')} checked={s.outage} onChange={v => set('outage', v)}/></Row>
        </section>

        <section className="card card-pad set-sec" id="security" ref={section('security')} aria-labelledby="h-security">
          <h2 className="h3" id="h-security">{msg('settings.security')}</h2>
          <Row title={msg('settings.sessionTimeout')} hint={msg('settings.sessionHint')} labelFor="s-session"><select id="s-session" className="input sm" value={s.session} onChange={e => set('session', e.target.value)}><option value="30m">{msg('settings.minutes30')}</option><option value="2h">{msg('settings.hours2')}</option><option value="8h">{msg('settings.hours8')}</option></select></Row>
          <Row title={msg('settings.twoFactor')} hint={msg('settings.twoFactorHint')}><Switch label={msg('settings.twoFactor')} checked={s.twoFactor} onChange={v => set('twoFactor', v)}/></Row>
          <Row title={msg('settings.signup')} hint={msg('settings.signupHint')}><Switch label={msg('settings.signup')} checked={s.signup} onChange={v => set('signup', v)}/></Row>
          <Row title={msg('settings.passwordLength')} hint={msg('settings.passwordHint')} labelFor="s-pw"><div className="input-unit"><input id="s-pw" type="number" min="6" max="32" className="input sm" value={s.pwLen} onChange={e => set('pwLen', e.target.value)}/><em>{msg('settings.characters')}</em></div></Row>
        </section>

        <div className="save-bar" hidden={!dirty} role="region" aria-label={msg('settings.unsaved')}>
          <span>{msg('settings.unsavedHint')}</span>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setS(saved)}>{msg('settings.discard')}</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setSaved(s); toast.show('Settings saved'); }}>{msg('common.saveChanges')}</button>
          </div>
        </div>
      </form>
    </div>
    {toast.element}
  </main>;
}
