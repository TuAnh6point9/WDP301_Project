import { msg, qualityLabel, useLocale } from '@/i18n';
import { lazy, Suspense, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { CLASSIFICATION_COLORS, WQI_DISPLAY_BANDS } from '@/features/predictions/classificationDisplay';
import { HeroVideo } from '../components/HeroVideo';

const MapPreview = lazy(() => import('../components/MapPreview').then(m => ({ default: m.MapPreview })));

export function HomePage() {
  useLocale();
  return <>
    <main>
      {/* HERO */}
      <section className="hero hero-has-video">
        <HeroVideo/>
        <div className="container hero-inner">
          <div className="stack-20 hero-copy">
            <h1 className="display hero-title">{msg('home.heroLead')}<br/><span className="hero-accent">{msg('home.heroAccent')}</span></h1>
            <p className="lead" style={{ maxWidth: "520px" }}>
              {msg('home.introduction')}</p>
            <div className="hero-actions">
              <Link to="/calculate" className="btn btn-light btn-lg">{msg('home.ctaCalculate')}<Icon name="arrowRight"/></Link>
              <Link to="/map" className="btn btn-on-dark btn-lg"><Icon name="pin"/>{msg('home.ctaMap')}</Link>
            </div>
          </div>
        </div>
      </section>
      {/* WQI SCALE */}
      <section className="section white">
        <div className="container stack" style={{ gap: "36px" }}>
          <div className="section-head">
            <h2 className="h2">{msg('home.whatIsWqi')}</h2>
            <p className="sub" style={{ fontSize: "15px", lineHeight: "1.65" }}>
              {msg('home.wqiDescription')}</p>
          </div>
          <div className="stack-12" style={{ maxWidth: "1180px", width: "100%", margin: "0 auto" }}>
            <div className="scale lg" aria-hidden="true">
              {WQI_DISPLAY_BANDS.map(band => <i key={band.label} style={{ flex: band.max - band.min + 1, background: CLASSIFICATION_COLORS[band.label].background }}/>)}
            </div>
            <div className="scale-labels">
              {WQI_DISPLAY_BANDS.map(band => <div key={band.label} style={{ flex: band.max - band.min + 1 }}>
                <b>{band.min}–{band.max}</b>
                <span>{qualityLabel(band.label)}</span>
              </div>)}
            </div>
          </div>
        </div>
      </section>
      {/* PROCESS */}
      <section className="section">
        <div className="container stack" style={{ gap: "40px" }}>
          <div className="section-head">
            <h2 className="h2">{msg('home.process')}</h2>
            <p className="sub">{msg('home.processHint')}</p>
          </div>
          <div className="grid cols-4" style={{ gap: "20px" }}>
            <div className="card step-card">
              <span className="step-idx">01</span>
              <span className="step-num">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="3" width="14" height="18" rx="2"/>
                  <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>
                </svg>
              </span>
              <h3 className="h3" style={{ fontSize: "16px" }}>{msg('home.enterParameters')}</h3>
              <p className="text-2" style={{ fontSize: "13.5px", lineHeight: "1.6" }}>{msg('home.enterHint')}</p>
            </div>
            <div className="card step-card">
              <span className="step-idx">02</span>
              <span className="step-num">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/>
                  <path d="m9 12 2 2 4-4"/>
                </svg>
              </span>
              <h3 className="h3" style={{ fontSize: "16px" }}>{msg('home.validate')}</h3>
              <p className="text-2" style={{ fontSize: "13.5px", lineHeight: "1.6" }}>{msg('home.validateHint')}</p>
            </div>
            <div className="card step-card">
              <span className="step-idx">03</span>
              <span className="step-num">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>
                  <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>
                </svg>
              </span>
              <h3 className="h3" style={{ fontSize: "16px" }}>{msg('home.inference')}</h3>
              <p className="text-2" style={{ fontSize: "13.5px", lineHeight: "1.6" }}>{msg('home.inferenceHint')}</p>
            </div>
            <div className="card step-card">
              <span className="step-idx">04</span>
              <span className="step-num">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18"/>
                  <path d="M8 17V10M13 17V6M18 17v-4"/>
                </svg>
              </span>
              <h3 className="h3" style={{ fontSize: "16px" }}>{msg('home.results')}</h3>
              <p className="text-2" style={{ fontSize: "13.5px", lineHeight: "1.6" }}>
                {msg('home.resultsHint')}</p>
            </div>
          </div>
        </div>
      </section>
      {/* MAP TEASER */}
      <section className="section white">
        <div className="container split" style={{ '--split': "minmax(0, 1fr) minmax(0, 1.1fr)", alignItems: "center", gap: "clamp(28px, 5vw, 56px)" } as CSSProperties}>
          <div className="stack">
            <h2 className="h2" style={{ fontSize: "clamp(22px, 2.6vw, 28px)" }}>{msg('home.mapTitle')}</h2>
            <p className="sub" style={{ fontSize: "15px", lineHeight: "1.65" }}>
              {msg('home.mapHint')}</p>
            <Link to="/map" className="link" style={{ fontSize: "15px" }}>
              {msg('home.fullMap')}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </Link>
          </div>
          <Link to="/map" aria-label={msg('home.openMap')} className="map-canvas card-hover" style={{ height: "320px", borderRadius: "var(--r-lg)", border: "1px solid #C7DAE1", display: "block" }}>
            <Suspense fallback={null}><MapPreview/></Suspense>
          </Link>
        </div>
      </section>
    </main>

    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div className="stack-12" style={{ maxWidth: 320 }}>
            <div className="brand" style={{ color: '#fff', fontSize: 16 }}><Brand small/>WQI An Kim Hai</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>{msg('home.footerDescription')}</p>
          </div>
          <div className="footer-cols">
            <div className="row row-wrap footer-links">
              <Link to="/map">{msg('common.map')}</Link>
              <Link to="/historical-data">{msg('common.historicalData')}</Link>
              <Link to="/calculate">{msg('common.calculate')}</Link>
              <Link to="/history">{msg('common.history')}</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">{msg('home.copyright')}</div>
      </div>
    </footer>
  </>;
}
