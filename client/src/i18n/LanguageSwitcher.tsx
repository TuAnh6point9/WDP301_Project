import { Icon } from '@/components/Icon';
import { changeLocale, msg, useLocale, type Locale } from './index';

// Short visible code; the full name (in its own language) stays the accessible name and tooltip.
const OPTIONS: [Locale, string, string][] = [['vi', 'VI', 'Tiếng Việt'], ['en', 'EN', 'English']];

export function LanguageSwitcher() {
  const locale = useLocale();
  return <div className="language-switcher" role="group" aria-label={msg('common.language')}>
    <Icon name="globe"/>
    {OPTIONS.map(([value, short, name]) => <button key={value} type="button" lang={value} aria-pressed={locale === value} aria-label={name} title={name} onClick={() => changeLocale(value)}>{short}</button>)}
  </div>;
}
