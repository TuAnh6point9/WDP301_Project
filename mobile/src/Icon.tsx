import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C } from './theme';

// The web's 24×24 stroke icons (client/src/components/Icon.tsx), as react-native-svg.
const PATHS = {
  home: <><Path d="M3 11 12 4l9 7"/><Path d="M5 10v10h14V10"/></>,
  pin: <><Path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><Circle cx={12} cy={10} r={2.5}/></>,
  chart: <><Path d="M3 3v18h18"/><Path d="m7 14 4-4 3 3 5-6"/></>,
  sparkle: <Path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>,
  clock: <><Circle cx={12} cy={12} r={9}/><Path d="M12 7v5l3 2"/></>,
  globe: <><Circle cx={12} cy={12} r={9}/><Path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
  user: <><Circle cx={12} cy={8} r={4}/><Path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></>,
  logout: <><Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><Path d="m16 17 5-5-5-5M21 12H9"/></>,
  download: <><Path d="M12 3v12M7 10l5 5 5-5"/><Path d="M5 21h14"/></>,
  spreadsheet: <><Rect x={4} y={3} width={16} height={18} rx={2}/><Path d="M4 9h16M4 15h16M10 9v12"/></>,
  warn: <><Path d="M12 3 2 21h20z"/><Path d="M12 10v5M12 18h.01"/></>,
  info: <><Circle cx={12} cy={12} r={9}/><Path d="M12 11v5M12 8h.01"/></>,
  back: <Path d="M19 12H5M11 18l-6-6 6-6"/>,
  close: <Path d="M6 6l12 12M18 6 6 18"/>,
  check: <Path d="M20 6 9 17l-5-5"/>,
  save: <><Path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><Path d="M17 21v-8H7v8M7 3v5h8"/></>,
  file: <><Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><Path d="M14 3v5h5"/></>,
  refresh: <><Path d="M21 12a9 9 0 1 1-2.6-6.4"/><Path d="M21 3v6h-6"/></>,
  chevronRight: <Path d="m9 6 6 6-6 6"/>,
  chevronLeft: <Path d="m15 6-6 6 6 6"/>,
  chevronDown: <Path d="m6 9 6 6 6-6"/>,
  fit: <Path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>,
  help: <><Circle cx={12} cy={12} r={9}/><Path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/></>,
  layers: <><Path d="m12 3 9 5-9 5-9-5z"/><Path d="m3 13 9 5 9-5"/></>,
};
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, color = C.text }: { name: IconName; size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{PATHS[name]}</Svg>;
}
