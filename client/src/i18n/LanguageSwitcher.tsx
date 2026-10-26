import { changeLocale, msg, useLocale } from './index';

export function LanguageSwitcher() {
  const locale = useLocale();
  return <div className="language-switcher" role="group" aria-label={msg('common.language')}>
    <button type="button" lang="vi" aria-pressed={locale === 'vi'} onClick={() => changeLocale('vi')}>Tiếng Việt</button>
    <button type="button" lang="en" aria-pressed={locale === 'en'} onClick={() => changeLocale('en')}>English</button>
  </div>;
}
