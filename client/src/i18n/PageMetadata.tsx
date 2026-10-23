import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { msg, useLocale, type TranslationKey } from './index';

const titles: Record<string, TranslationKey> = {
  '/': 'common.home', '/map': 'common.map', '/historical-data': 'chart.title',
  '/login': 'auth.login', '/calculate': 'predictions.calculateTitle', '/result': 'predictions.resultTitle',
  '/history': 'history.title', '/history/excel': 'excel.history', '/report': 'report.title',
  '/admin': 'common.dashboard', '/admin/stations': 'stations.title', '/admin/data': 'records.title',
  '/admin/import': 'imports.title', '/admin/users': 'admin.userAccounts',
  '/admin/status': 'admin.statusTitle', '/admin/settings': 'common.settings',
};
export function PageMetadata() {
  const locale = useLocale();
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    const key = titles[pathname] ?? (pathname.startsWith('/excel/') ? 'excel.title' : 'messages.notFoundPage');
    document.title = `${msg(key)} · ${locale === 'vi' ? 'WQI An Kim Hải' : 'WQI An Kim Hai'}`;
  }, [locale, pathname]);
  return null;
}
