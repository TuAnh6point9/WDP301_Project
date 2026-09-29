import { useEffect, useRef, useState } from 'react';

// Portrait phones get lighter 9:16 crops (-m) so the subject stays in frame and less data is downloaded.
const HERO_VIDEOS = [
  { name: 'hero-water', label: 'Aquatic environment' },
  { name: 'hero-lab', label: 'Lab analysis' },
];
const MOBILE_QUERY = '(max-width: 720px) and (orientation: portrait)';

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

/** Background video for the home hero: plays each clip once, then cross-fades to the next and loops. */
export function HeroVideo() {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  // Clips that fail to load (missing file, unsupported codec) are skipped so the hero never sits on a blank frame.
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const suffix = useIsMobile() ? '-m' : '';

  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (!video) return;
      if (index !== active) { video.pause(); return; }
      video.currentTime = 0;
      if (!prefersReducedMotion()) video.play().catch(() => { /* autoplay blocked: poster stays visible */ });
    });
  }, [active, suffix]);

  const nextPlayable = (from: number, skip: ReadonlySet<number>) => {
    for (let step = 1; step <= HERO_VIDEOS.length; step++) {
      const index = (from + step) % HERO_VIDEOS.length;
      if (!skip.has(index)) return index;
    }
    return from;
  };
  const next = () => {
    setProgress(0);
    const target = nextPlayable(active, failed);
    if (target !== active) { setActive(target); return; }
    const video = videos.current[active]; // only one playable clip left: loop it in place
    if (video) { video.currentTime = 0; video.play().catch(() => {}); }
  };
  const onError = (index: number) => {
    const skip = new Set(failed).add(index);
    setFailed(skip);
    if (index === active) { setProgress(0); setActive(nextPlayable(index, skip)); }
  };
  const playable = HERO_VIDEOS.map((video, index) => ({ ...video, index })).filter(video => !failed.has(video.index));

  return <>
    <div className="hero-media" aria-hidden="true">
      {HERO_VIDEOS.map((video, index) => <video
        key={video.name}
        ref={el => { videos.current[index] = el; }}
        className={`hero-video${index === active ? ' is-active' : ''}`}
        src={`/home/${video.name}${suffix}.mp4`}
        poster={index === 0 ? `/home/hero-poster${suffix}.jpg` : undefined}
        muted
        playsInline
        preload={index === 0 ? 'auto' : 'metadata'}
        onTimeUpdate={e => { const v = e.currentTarget; if (index === active && v.duration) setProgress(v.currentTime / v.duration); }}
        onEnded={() => { if (index === active) next(); }}
        onError={() => onError(index)}
      />)}
    </div>
    {playable.length > 1 && <div className="hero-reels" role="tablist" aria-label="Background video">
      {playable.map(({ index, ...video }) => <button
        key={video.name}
        type="button"
        role="tab"
        aria-selected={index === active}
        className="hero-reel"
        onClick={() => { setProgress(0); setActive(index); }}
      >
        <span className="hero-reel-bar"><i style={{ transform: `scaleX(${index === active ? progress : index < active ? 1 : 0})` }}/></span>
        {video.label}
      </button>)}
    </div>}
  </>;
}
