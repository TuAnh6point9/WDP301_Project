import { lazy, Suspense, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '@/components/Brand';
import { HeroVideo } from '../components/HeroVideo';

const MapPreview = lazy(() => import('../components/MapPreview').then(m => ({ default: m.MapPreview })));

export function HomePage() {
  return <>
    <main>
      {/* HERO */}
      <section className="hero hero-has-video">
        <HeroVideo/>
        <div className="container hero-inner">
          <div className="stack-20 hero-copy">
            <h1 className="display hero-title">Water Quality Index<br/><span className="hero-accent">Monitoring System</span></h1>
            <p className="lead" style={{ maxWidth: "520px" }}>
              Historical monitoring data, spatial station mapping and AI-based WQI prediction for the An Kim Hai area.
            </p>
            <div className="row row-wrap" style={{ gap: "12px", marginTop: "4px" }}>
              <Link to="/calculate" className="btn btn-primary btn-lg">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>
                Calculate WQI Now
              </Link>
              <Link to="/map" className="btn btn-secondary btn-lg">View Area Map</Link>
            </div>
            <div className="hero-stats">
              <div>
                <span className="num">—</span>
                <span className="small text-2">Historical data records</span>
              </div>
              <div>
                <span className="num">8</span>
                <span className="small text-2">Monitored parameters</span>
              </div>
              <div>
                <span className="num">AI</span>
                <span className="small text-2">WQI prediction model</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* WQI SCALE */}
      <section className="section white">
        <div className="container stack" style={{ gap: "36px" }}>
          <div className="section-head">
            <h2 className="h2">What is WQI?</h2>
            <p className="sub" style={{ fontSize: "15px", lineHeight: "1.65" }}>
              The Water Quality Index (WQI) combines monitored parameters into a single 0–100 score, giving a quick assessment of how suitable a water source is.
            </p>
          </div>
          <div className="stack-12" style={{ maxWidth: "1180px", width: "100%", margin: "0 auto" }}>
            <div className="scale lg">
              <i/>
              <i/>
              <i/>
              <i/>
              <i/>
            </div>
            <div className="scale-labels">
              <div>
                <b>0–25</b>
                <span>Very Poor</span>
              </div>
              <div>
                <b>26–50</b>
                <span>Poor</span>
              </div>
              <div>
                <b>51–75</b>
                <span>Fair</span>
              </div>
              <div>
                <b>76–90</b>
                <span>Good</span>
              </div>
              <div>
                <b>91–100</b>
                <span>Excellent</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* PROCESS */}
      <section className="section">
        <div className="container stack" style={{ gap: "40px" }}>
          <div className="section-head">
            <h2 className="h2">WQI Calculation Process</h2>
            <p className="sub">From raw measurements to a classified score in four steps.</p>
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
              <h3 className="h3" style={{ fontSize: "16px" }}>Enter 6 Parameters</h3>
              <p className="text-2" style={{ fontSize: "13.5px", lineHeight: "1.6" }}>Users enter measured values and units for 6 water quality parameters via Web or Mobile.</p>
            </div>
            <div className="card step-card">
              <span className="step-idx">02</span>
              <span className="step-num">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/>
                  <path d="m9 12 2 2 4-4"/>
                </svg>
              </span>
              <h3 className="h3" style={{ fontSize: "16px" }}>Validate Data</h3>
              <p className="text-2" style={{ fontSize: "13.5px", lineHeight: "1.6" }}>The system checks data types and valid value ranges before submission.</p>
            </div>
            <div className="card step-card">
              <span className="step-idx">03</span>
              <span className="step-num">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>
                  <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>
                </svg>
              </span>
              <h3 className="h3" style={{ fontSize: "16px" }}>AI Service Analysis</h3>
              <p className="text-2" style={{ fontSize: "13.5px", lineHeight: "1.6" }}>Preprocesses the data and runs inference with the AI model to compute the WQI value.</p>
            </div>
            <div className="card step-card">
              <span className="step-idx">04</span>
              <span className="step-num">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18"/>
                  <path d="M8 17V10M13 17V6M18 17v-4"/>
                </svg>
              </span>
              <h3 className="h3" style={{ fontSize: "16px" }}>Results & History</h3>
              <p className="text-2" style={{ fontSize: "13.5px", lineHeight: "1.6" }}>
                Displays the WQI score, classification, and charts, then automatically saves it to the calculation history.
              </p>
            </div>
          </div>
        </div>
      </section>
      {/* MAP TEASER */}
      <section className="section white">
        <div className="container split" style={{ '--split': "minmax(0, 1fr) minmax(0, 1.1fr)", alignItems: "center", gap: "clamp(28px, 5vw, 56px)" } as CSSProperties}>
          <div className="stack">
            <span className="eyebrow">Interactive map</span>
            <h2 className="h2" style={{ fontSize: "clamp(22px, 2.6vw, 28px)" }}>The An Kim Hai Area on the Map</h2>
            <p className="sub" style={{ fontSize: "15px", lineHeight: "1.65" }}>
              View the locations of historical water quality monitoring points, and select one to see its details, measurements, and related WQI.
            </p>
            <Link to="/map" className="link" style={{ fontSize: "15px" }}>
              View Full Map
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </Link>
          </div>
          <Link to="/map" aria-label="Open the full monitoring map" className="map-canvas card-hover" style={{ height: "320px", borderRadius: "var(--r-lg)", border: "1px solid #C7DAE1", display: "block" }}>
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
            <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>A system for calculating and monitoring the Water Quality Index for the An Kim Hai area.</p>
          </div>
          <div className="footer-cols">
            <div className="stack-12">
              <h4>Product</h4>
              <Link to="/map">Map</Link>
              <Link to="/historical-data">Historical Data</Link>
              <Link to="/calculate">Calculate WQI</Link>
              <Link to="/history">History</Link>
            </div>
            <div className="stack-12">
              <h4>Admin</h4>
              <Link to="/admin">Dashboard</Link>
              <Link to="/admin/import">Excel Data Import</Link>
              <Link to="/admin/users">Users</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">© 2026 WQI An Kim Hai. Historical data — no real-time sensor connection.</div>
      </div>
    </footer>
  </>;
}
