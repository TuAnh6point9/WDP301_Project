/** Download rows as a UTF-8 CSV file that opens in Excel. */
export function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const text = rows.map(row => row.map(cell => {
    const value = cell === null ? '' : String(cell);
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\uFEFF' + text], { type: 'text/csv' }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
