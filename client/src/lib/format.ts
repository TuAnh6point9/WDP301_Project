export const formatDateTime = (value: string) => new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
export const formatDate = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Local calendar date `days` days before today, as YYYY-MM-DD (for date inputs). */
export function isoDaysAgo(days: number) {
  const date = new Date(Date.now() - days * 864e5);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
