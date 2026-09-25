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
  name: 'WQI An Kim Hai', org: 'Hai Phong Department of Natural Resources & Environment', lang: 'English', tz: 'dmy',
  std: 'A2' as Column, limits: limitsOf('A2'),
  size: '10', dup: 'skip', partial: true, recalc: true,
  alert: true, threshold: '50', importMail: false, outage: true,
  session: '2h', twoFactor: false, signup: false, pwLen: '8',
};
type Settings = typeof INITIAL;

function Row({ title, hint, children, labelFor }: { title: string; hint: string; children: ReactNode; labelFor?: string }) {
  return <div className="set-row">
    <div className="stack-4"><b>{labelFor ? <label htmlFor={labelFor}>{title}</label> : title}</b><span className="small muted">{hint}</span></div>
    {children}
  </div>;
}
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <label className="switch"><input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={event => onChange(event.target.checked)}/><span/></label>;
}

export function AdminSettingsPage() {
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
        <h1 className="h1">Settings</h1>
        <p className="sub">System-wide configuration. Changes apply to all users after saving.</p>
      </div>
    </div>

    <div className="settings">
      <nav className="settings-nav" aria-label="Settings sections">
        {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} className={activeSection === id ? 'on' : undefined} aria-current={activeSection === id ? 'true' : undefined} onClick={event => { event.preventDefault(); refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{label}</a>)}
      </nav>

      <form className="stack-24" onSubmit={event => event.preventDefault()}>
        <section className="card card-pad set-sec" id="general" ref={section('general')} aria-labelledby="h-general">
          <h2 className="h3" id="h-general">General</h2>
          <Row title="System name" hint="Shown in the header, reports and emails." labelFor="s-name"><input id="s-name" className="input sm" value={s.name} onChange={e => set('name', e.target.value)}/></Row>
          <Row title="Managing organization" hint="Printed on exported PDF reports." labelFor="s-org"><input id="s-org" className="input sm" value={s.org} onChange={e => set('org', e.target.value)}/></Row>
          <Row title="Default language" hint="Users can still change their own language." labelFor="s-lang"><select id="s-lang" className="input sm" value={s.lang} onChange={e => set('lang', e.target.value)}><option>Tiếng Việt</option><option>English</option></select></Row>
          <Row title="Time zone & date format" hint="Used for sample dates and charts." labelFor="s-tz"><select id="s-tz" className="input sm" value={s.tz} onChange={e => set('tz', e.target.value)}><option value="dmy">GMT+7 (Asia/Ho_Chi_Minh) · dd/mm/yyyy</option><option value="ymd">GMT+7 (Asia/Ho_Chi_Minh) · yyyy-mm-dd</option></select></Row>
        </section>

        <section className="card card-pad set-sec stack" id="standard" ref={section('standard')} aria-labelledby="h-standard">
          <h2 className="h3" id="h-standard">WQI &amp; Limits</h2>
          <div className="set-row" style={{ paddingTop: 0 }}>
            <div className="stack-4"><b><label htmlFor="s-std">Reference standard</label></b><span className="small muted">Limits drive the ▲ flags, chart reference lines and alerts.</span></div>
            <select id="s-std" className="input sm" value={s.std} onChange={e => { const column = e.target.value as Column; setS(previous => ({ ...previous, std: column, limits: limitsOf(column) })); }}>
              {(Object.keys(STD) as Column[]).map(column => <option key={column} value={column}>QCVN 08-MT:2015 · Column {column}</option>)}
            </select>
          </div>
          <Row title="WQI method" hint="The AI model is trained against this method." labelFor="s-method"><select id="s-method" className="input sm"><option>VN_WQI (Decision 1460/QĐ-TCMT)</option></select></Row>
          <div className="card card-flush" style={{ boxShadow: 'none' }}>
            <div className="table-wrap">
              <table className="table compact limits-table">
                <thead><tr><th>Parameter</th><th>Unit</th><th>Lower limit</th><th>Upper limit</th></tr></thead>
                <tbody>
                  {PARAMS.map(([key, name, unit]) => <tr key={key}>
                    <td className="strong">{name}</td><td className="text-2">{unit}</td>
                    {[0, 1].map(bound => <td key={bound}><input type="number" step="any" className="input sm" placeholder="—" aria-label={`${name} ${bound ? 'upper' : 'lower'} limit`} value={s.limits[key][bound]} onChange={e => setS(previous => ({ ...previous, limits: { ...previous.limits, [key]: bound ? [previous.limits[key][0], e.target.value] : [e.target.value, previous.limits[key][1]] } }))}/></td>)}
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>
          <span className="xs muted">Changing the standard fills in its default limits. You can still edit individual values.</span>
        </section>

        <section className="card card-pad set-sec" id="import" ref={section('import')} aria-labelledby="h-import">
          <h2 className="h3" id="h-import">Data Import</h2>
          <Row title="Maximum file size" hint="Applies to Excel uploads." labelFor="s-size"><div className="input-unit"><input id="s-size" type="number" min="1" max="50" className="input sm" value={s.size} onChange={e => set('size', e.target.value)}/><em>MB</em></div></Row>
          <Row title="Default duplicate handling" hint="Same station and date already stored." labelFor="s-dup"><select id="s-dup" className="input sm" value={s.dup} onChange={e => set('dup', e.target.value)}><option value="skip">Skip duplicate rows</option><option value="replace">Replace existing values</option></select></Row>
          <Row title="Allow partial imports" hint="Import valid rows even when some rows have errors."><Switch label="Allow partial imports" checked={s.partial} onChange={v => set('partial', v)}/></Row>
          <Row title="Recalculate WQI after import" hint="Runs the AI model for every new sample."><Switch label="Recalculate WQI after import" checked={s.recalc} onChange={v => set('recalc', v)}/></Row>
        </section>

        <section className="card card-pad set-sec" id="notify" ref={section('notify')} aria-labelledby="h-notify">
          <h2 className="h3" id="h-notify">Notifications</h2>
          <Row title="Email alert on poor water quality" hint="Send to all admins when a station's WQI falls below the threshold."><Switch label="Email alert on poor water quality" checked={s.alert} onChange={v => set('alert', v)}/></Row>
          <Row title="Alert threshold" hint="50 = boundary between Fair and Poor." labelFor="s-th"><div className="input-unit"><input id="s-th" type="number" min="0" max="100" className="input sm" disabled={!s.alert} value={s.threshold} onChange={e => set('threshold', e.target.value)}/><em>WQI</em></div></Row>
          <Row title="Import summary email" hint="Send the uploader a summary after each import."><Switch label="Import summary email" checked={s.importMail} onChange={v => set('importMail', v)}/></Row>
          <Row title="Service outage alert" hint="When a component in System Status is down for more than 5 minutes."><Switch label="Service outage alert" checked={s.outage} onChange={v => set('outage', v)}/></Row>
        </section>

        <section className="card card-pad set-sec" id="security" ref={section('security')} aria-labelledby="h-security">
          <h2 className="h3" id="h-security">Security</h2>
          <Row title="Session timeout" hint="Users are signed out after this period of inactivity." labelFor="s-session"><select id="s-session" className="input sm" value={s.session} onChange={e => set('session', e.target.value)}><option value="30m">30 minutes</option><option value="2h">2 hours</option><option value="8h">8 hours</option></select></Row>
          <Row title="Require two-factor sign-in for admins" hint="Admins confirm sign-in with a code sent by email."><Switch label="Require two-factor sign-in for admins" checked={s.twoFactor} onChange={v => set('twoFactor', v)}/></Row>
          <Row title="Allow public sign-up" hint="When off, only admins can create User accounts."><Switch label="Allow public sign-up" checked={s.signup} onChange={v => set('signup', v)}/></Row>
          <Row title="Minimum password length" hint="Applies to new and changed passwords." labelFor="s-pw"><div className="input-unit"><input id="s-pw" type="number" min="6" max="32" className="input sm" value={s.pwLen} onChange={e => set('pwLen', e.target.value)}/><em>characters</em></div></Row>
        </section>

        <div className="save-bar" hidden={!dirty} role="region" aria-label="Unsaved changes">
          <span>You have unsaved changes</span>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setS(saved)}>Discard</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setSaved(s); toast.show('Settings saved'); }}>Save Changes</button>
          </div>
        </div>
      </form>
    </div>
    {toast.element}
  </main>;
}
