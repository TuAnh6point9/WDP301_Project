import { errorText, messageText } from '@/i18n/messages';
import { msg, useLocale } from '@/i18n';
import { USER_MESSAGES as M, userErrorMessage } from '@wqi/contracts';
import { nativeValidationHandlers } from '@/lib/nativeValidation';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { Icon } from '@/components/Icon';
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher';

export function LoginPage() {
  useLocale();
  const { signIn, pending, status, error: sessionError, refreshSession } = useAuth();
  const [failure, setFailure] = useState('');
  const submitting = useRef(false);
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || pending || status === 'loading') return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    submitting.current = true; setFailure('');
    try {
      const user = await signIn({ email: String(fields.get('email')).trim(), password: String(fields.get('password')) });
      const allowed = from?.startsWith('/') && !from.startsWith('//') && (user.role === 'admin' || !from.startsWith('/admin'));
      form.reset();
      navigate(allowed && from ? from : user.role === 'admin' ? '/admin' : '/', { replace: true });
    } catch (error) { setFailure(userErrorMessage(error, M.LOGIN_FAILED)); }
    finally { submitting.current = false; }
  }

  return <div className="auth">
    {/* BRAND PANEL */}
    <section className="auth-brand">
      <svg className="rings" viewBox="0 0 520 520" aria-hidden="true">
        <circle cx="260" cy="260" r="259" fill="none" stroke="#1B5C71"/>
        <circle cx="260" cy="260" r="190" fill="none" stroke="#1B5C71"/>
        <circle cx="260" cy="260" r="120" fill="none" stroke="#1B5C71"/>
      </svg>
      <Link to="/" className="brand" style={{ color: '#fff', position: 'relative' }}>
        <span className="brand-mark" style={{ background: 'rgba(255,255,255,.12)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14)' }}><Icon name="drop"/></span>
        WQI An Kim Hai
      </Link>
      <div className="stack" style={{ gap: 18, position: 'relative', maxWidth: 480 }}>
        <span className="eyebrow" style={{ background: 'rgba(255,255,255,.08)', borderColor: 'rgba(255,255,255,.14)', color: '#CFE6EC' }}>{msg('auth.system')}</span>
        <h1 style={{ font: '800 clamp(26px, 3vw, 36px)/1.22 var(--font-d)', letterSpacing: '-.015em' }}>{msg('auth.introduction')}</h1>
        <p style={{ fontSize: 15, lineHeight: 1.65, color: '#B9C6CE' }}>{msg('auth.benefits')}</p>
      </div>
      <div className="row auth-stats" style={{ gap: 32, position: 'relative', alignItems: 'flex-start' }}>
        <div className="stack-4"><span className="num" style={{ fontSize: 22 }}>—</span><span className="xs" style={{ color: '#8FA6B2' }}>{msg('auth.records')}</span></div>
        <div className="stack-4"><span className="num" style={{ fontSize: 22 }}>—</span><span className="xs" style={{ color: '#8FA6B2' }}>{msg('auth.stations')}</span></div>
        <div className="stack-4"><span className="num" style={{ fontSize: 22 }}>AI</span><span className="xs" style={{ color: '#8FA6B2' }}>{msg('auth.model')}</span></div>
      </div>
    </section>

    {/* FORM PANEL */}
    <section className="auth-form">
      <div>
        <LanguageSwitcher/>
        <div className="stack-8">
          <h2 className="h1">{msg('auth.welcome')}</h2>
          <p className="sub">{msg('auth.welcomeHint')}</p>
        </div>
        <form className="stack" onSubmit={submit} {...nativeValidationHandlers}>
          <div className="field">
            <label className="label" htmlFor="email">{msg('auth.email')}</label>
            <label className="input-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
              <input id="email" name="email" className="input" type="email" required maxLength={254} placeholder="you@ankimhai.gov.vn" autoComplete="email" disabled={pending}/>
            </label>
          </div>
          <div className="field">
            <div className="row-between">
              <label className="label" htmlFor="pwd">{msg('auth.password')}</label>
              <a href="mailto:admin@ankimhai.gov.vn" className="link small">{msg('auth.forgotPassword')}</a>
            </div>
            <label className="input-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
              <input id="pwd" name="password" className="input" type="password" required maxLength={128} placeholder="••••••••" autoComplete="current-password" disabled={pending}/>
            </label>
          </div>
          {(failure || sessionError) && <div className="callout callout-warn" role="alert"><span>{failure ? messageText(failure) : errorText(sessionError, M.SESSION_RESTORE)}</span></div>}
          {status === 'error' && <button type="button" className="btn btn-secondary" onClick={() => void refreshSession()}>{msg('auth.retryConnection')}</button>}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={pending || status === 'loading' || status === 'error'}>{pending ? msg('auth.loggingIn') : status === 'loading' ? msg('auth.checkingSession') : msg('auth.login')}</button>
          <p className="hint" style={{ textAlign: 'center' }}>{msg('auth.sessionHint')}</p>
        </form>
        <hr className="divider"/>
        <p className="small muted" style={{ textAlign: 'center', lineHeight: 1.6 }}>
          {msg('auth.provisioned')}<br/>
          {msg('auth.contact')}{' '}<a href="mailto:admin@ankimhai.gov.vn" className="c-brand strong">admin@ankimhai.gov.vn</a> {' '}{msg('auth.forAccess')}</p>
        <Link to="/" className="back-link" style={{ alignSelf: 'center', color: 'var(--text-2)' }}><Icon name="back"/>{msg('common.backHome')}</Link>
      </div>
    </section>
  </div>;
}

