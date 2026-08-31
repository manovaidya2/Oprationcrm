import { useCallback, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accountLedgerApi } from '@/lib/api';
import { useInstantResource } from '@/lib/useInstantResource';
import { toast } from 'sonner';

const fmt = value => `Rs ${(Number(value) || 0).toLocaleString('en-IN')}`;
const fmtDate = value => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
const inputClass = 'h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring';

function dateValue(row, basis) {
  return basis === 'submittedAt' ? row.student?.submittedAt : row.student?.createdAt;
}

function startOfDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfMonth(value) {
  if (!value) return null;
  const date = new Date(`${value}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfMonth(value) {
  if (!value) return null;
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return null;
  return new Date(year, month, 0, 23, 59, 59, 999);
}

function filterRangeLabel(mode, basis, filters) {
  const basisLabel = basis === 'submittedAt' ? 'Submitted by Center' : 'Added in CRM';
  if (mode === 'month' && filters.month) return `${basisLabel}: ${filters.month}`;
  if (mode === 'monthRange' && (filters.fromMonth || filters.toMonth)) {
    return `${basisLabel}: ${filters.fromMonth || 'Start'} to ${filters.toMonth || 'End'}`;
  }
  if (mode === 'dateRange' && (filters.fromDate || filters.toDate)) {
    return `${basisLabel}: ${filters.fromDate || 'Start'} to ${filters.toDate || 'End'}`;
  }
  return `${basisLabel}: All time`;
}

function matchesDateFilter(row, basis, mode, filters) {
  if (mode === 'all') return true;
  const value = dateValue(row, basis);
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  if (mode === 'month') {
    const from = startOfMonth(filters.month);
    const to = endOfMonth(filters.month);
    return (!from || date >= from) && (!to || date <= to);
  }

  if (mode === 'monthRange') {
    const from = startOfMonth(filters.fromMonth);
    const to = endOfMonth(filters.toMonth);
    return (!from || date >= from) && (!to || date <= to);
  }

  if (mode === 'dateRange') {
    const from = startOfDate(filters.fromDate);
    const to = endOfDate(filters.toDate);
    return (!from || date >= from) && (!to || date <= to);
  }

  return true;
}

function accountText(tx) {
  if (!tx) return '';
  const selected = tx.paidToAccount;
  const selectedText = tx.paidToAccountLabel || selected?.label || '';
  const selectedDetail = selected?.mode === 'UPI'
    ? [selected.upiId, selected.upiName].filter(Boolean).join(' / ')
    : [selected?.bankName, selected?.accountHolder, selected?.accountNumber, selected?.ifscCode].filter(Boolean).join(' / ');
  const enteredDetail = tx.mode === 'UPI'
    ? tx.upiId
    : [tx.bankName, tx.accountHolder, tx.accountNumber, tx.ifscCode].filter(Boolean).join(' / ');

  return [selectedText, selectedDetail || enteredDetail].filter(Boolean).join(' - ');
}

export default function AccountLedgerPage() {
  const [search, setSearch] = useState('');
  const [dateBasis, setDateBasis] = useState('createdAt');
  const [dateMode, setDateMode] = useState('all');
  const [dateFilters, setDateFilters] = useState({
    month: '',
    fromMonth: '',
    toMonth: '',
    fromDate: '',
    toDate: '',
  });
  const fetchFast = useCallback(() => accountLedgerApi.students({ page: 1, limit: 50 }), []);
  const fetchFull = useCallback(() => accountLedgerApi.students(), []);

  const { data, loading, refreshing } = useInstantResource(
    'account-ledger-all-students',
    fetchFast,
    {
      fetchFull,
      onError: error => toast.error(error.message || 'Failed to load account ledger'),
    }
  );

  const rows = data?.rows || [];
  const maxTransactions = Math.max(1, Number(data?.maxTransactions || 0), ...rows.map(row => row.transactions?.length || 0));
  const q = search.trim().toLowerCase();
  const searchedRows = rows.filter(row => {
    const student = row.student || {};
    return !q ||
      student.name?.toLowerCase().includes(q) ||
      student.enrollmentNumber?.toLowerCase().includes(q) ||
      student.courseName?.toLowerCase().includes(q) ||
      student.phone?.toLowerCase().includes(q);
  });
  const activeRangeLabel = filterRangeLabel(dateMode, dateBasis, dateFilters);
  const filteredRows = searchedRows.filter(row => matchesDateFilter(row, dateBasis, dateMode, dateFilters));

  const totals = useMemo(() => filteredRows.reduce((acc, row) => ({
    totalAmount: acc.totalAmount + Number(row.totalAmount || 0),
    amountPaid: acc.amountPaid + Number(row.amountPaid || 0),
    amountDue: acc.amountDue + Number(row.amountDue || 0),
  }), { totalAmount: 0, amountPaid: 0, amountDue: 0 }), [filteredRows]);

  function setDateFilter(key, value) {
    setDateFilters(prev => ({ ...prev, [key]: value }));
  }

  function resetDateFilters() {
    setDateMode('all');
    setDateFilters({ month: '', fromMonth: '', toMonth: '', fromDate: '', toDate: '' });
  }

  function downloadCsv() {
    const txHeaders = [];
    for (let index = 0; index < maxTransactions; index += 1) {
      const no = index + 1;
      txHeaders.push(`Transaction ${no} Amount Paid`, `Transaction ${no} Mode`, `Transaction ${no} UTR`, `Transaction ${no} Paid Date`, `Transaction ${no} Record Added Date`, `Transaction ${no} Verified Date`, `Transaction ${no} Paid To`);
    }

    const dateHeader = dateBasis === 'submittedAt' ? 'Submitted Date' : 'Added Date';
    const headers = ['Student Name', 'Enrollment Number', 'Course', dateHeader, 'Total Amount', 'Amount Paid', 'Amount Due', ...txHeaders];
    const csvRows = filteredRows.map(row => {
      const txValues = [];
      for (let index = 0; index < maxTransactions; index += 1) {
        const tx = row.transactions?.[index];
        txValues.push(tx?.amount || '', tx?.mode || '', tx?.utrRef || '', fmtDate(tx?.paidAt), fmtDate(tx?.recordAddedAt), fmtDate(tx?.verifiedAt), accountText(tx));
      }
      return [
        row.student?.name || '',
        row.student?.enrollmentNumber || '',
        row.student?.courseName || '',
        fmtDate(dateValue(row, dateBasis)),
        row.totalAmount || 0,
        row.amountPaid || 0,
        row.amountDue || 0,
        ...txValues,
      ];
    });

    const csv = [headers, ...csvRows].map(row => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'account-ledger.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-52 animate-pulse rounded-lg bg-slate-100" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-lg border bg-slate-100" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl border bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
            Account Ledger
          </h1>
          <div className="text-xs text-muted-foreground">All students billing ledger</div>
        </div>
        <Button size="sm" variant="outline" onClick={downloadCsv} disabled={filteredRows.length === 0}>
          <Download className="mr-1 h-4 w-4" />
          CSV
        </Button>
      </div>
      {refreshing && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
          Loading complete ledger in background...
        </div>
      )}

      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <div className="min-w-0 rounded-lg border bg-indigo-50 px-4 py-3">
          <div className="text-xs font-medium text-indigo-600">Total Amount</div>
          <div className="truncate text-lg font-bold text-indigo-700">{fmt(totals.totalAmount)}</div>
        </div>
        <div className="min-w-0 rounded-lg border bg-emerald-50 px-4 py-3">
          <div className="text-xs font-medium text-emerald-600">Amount Paid</div>
          <div className="truncate text-lg font-bold text-emerald-700">{fmt(totals.amountPaid)}</div>
        </div>
        <div className="min-w-0 rounded-lg border bg-amber-50 px-4 py-3">
          <div className="text-xs font-medium text-amber-600">Amount Due</div>
          <div className="truncate text-lg font-bold text-amber-700">{fmt(totals.amountDue)}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Search</div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9 pr-9" placeholder="Search student, enrollment, course..." value={search} onChange={event => setSearch(event.target.value)} />
              {search && (
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch('')}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Filter By</div>
            <select className={`${inputClass} w-full lg:w-44`} value={dateBasis} onChange={event => setDateBasis(event.target.value)}>
              <option value="createdAt">Added in CRM</option>
              <option value="submittedAt">Submitted by Center</option>
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Period</div>
            <select className={`${inputClass} w-full lg:w-40`} value={dateMode} onChange={event => setDateMode(event.target.value)}>
              <option value="all">All Time</option>
              <option value="month">Month</option>
              <option value="monthRange">Month Range</option>
              <option value="dateRange">Date Range</option>
            </select>
          </div>

          <Button variant="outline" onClick={resetDateFilters}>Reset</Button>
        </div>

        {dateMode !== 'all' && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
            {dateMode === 'month' && (
              <input className={inputClass} type="month" value={dateFilters.month} onChange={event => setDateFilter('month', event.target.value)} />
            )}
            {dateMode === 'monthRange' && (
              <>
                <input className={inputClass} type="month" value={dateFilters.fromMonth} onChange={event => setDateFilter('fromMonth', event.target.value)} />
                <input className={inputClass} type="month" value={dateFilters.toMonth} onChange={event => setDateFilter('toMonth', event.target.value)} />
              </>
            )}
            {dateMode === 'dateRange' && (
              <>
                <input className={inputClass} type="date" value={dateFilters.fromDate} onChange={event => setDateFilter('fromDate', event.target.value)} />
                <input className={inputClass} type="date" value={dateFilters.toDate} onChange={event => setDateFilter('toDate', event.target.value)} />
              </>
            )}
          </div>
        )}

        <div className="mt-3 text-xs text-muted-foreground">
          Showing {filteredRows.length} of {searchedRows.length} searched students. {activeRangeLabel}
        </div>
      </div>

      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="max-h-[68vh] w-full min-w-0 max-w-full overflow-auto">
          <table className="border-collapse text-left text-xs" style={{ minWidth: `${860 + (maxTransactions * 780)}px` }}>
            <thead className="sticky top-0 z-20 bg-slate-100 text-slate-700">
              <tr>
                <th className="sticky left-0 z-30 border-b border-r bg-slate-100 px-3 py-2" rowSpan="2">Student Name</th>
                <th className="border-b border-r px-3 py-2" rowSpan="2">Enrollment Number</th>
                <th className="border-b border-r px-3 py-2" rowSpan="2">Course</th>
                <th className="border-b border-r px-3 py-2 text-right" rowSpan="2">Total Amount</th>
                <th className="border-b border-r px-3 py-2 text-right" rowSpan="2">Amount Paid</th>
                <th className="border-b border-r px-3 py-2 text-right" rowSpan="2">Amount Due</th>
                {Array.from({ length: maxTransactions }).map((_, index) => (
                  <th key={index} className="border-b border-r bg-indigo-50 px-3 py-2 text-center font-bold text-indigo-700" colSpan="7">
                    Transaction {index + 1}
                  </th>
                ))}
              </tr>
              <tr>
                {Array.from({ length: maxTransactions }).flatMap((_, index) => (
                  ['Amount Paid', 'Mode', 'UTR', 'Paid Date', 'Record Added Date', 'Verified Date', 'Paid To'].map(label => (
                    <th key={`${index}-${label}`} className="border-b border-r bg-indigo-50 px-3 py-2 font-semibold text-indigo-700">{label}</th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={6 + (maxTransactions * 7)}>No students found</td>
                </tr>
              ) : filteredRows.map(row => (
                <tr key={row.student?._id} className="hover:bg-slate-50">
                  <td className="sticky left-0 z-10 min-w-56 border-b border-r bg-white px-3 py-2 font-semibold text-slate-800">{row.student?.name || ''}</td>
                  <td className="min-w-40 border-b border-r px-3 py-2 font-mono text-emerald-700">{row.student?.enrollmentNumber || ''}</td>
                  <td className="min-w-48 border-b border-r px-3 py-2 font-medium text-slate-700">{row.student?.courseName || ''}</td>
                  <td className="min-w-32 border-b border-r px-3 py-2 text-right font-semibold">{fmt(row.totalAmount)}</td>
                  <td className="min-w-32 border-b border-r px-3 py-2 text-right font-semibold text-emerald-700">{fmt(row.amountPaid)}</td>
                  <td className="min-w-32 border-b border-r px-3 py-2 text-right font-semibold text-amber-700">{fmt(row.amountDue)}</td>
                  {Array.from({ length: maxTransactions }).flatMap((_, index) => {
                    const tx = row.transactions?.[index];
                    return [
                      <td key={`${index}-amount`} className="min-w-32 border-b border-r px-3 py-2 text-right font-semibold text-emerald-700">{tx ? fmt(tx.amount) : ''}</td>,
                      <td key={`${index}-mode`} className="min-w-32 border-b border-r px-3 py-2">{tx?.mode || ''}</td>,
                      <td key={`${index}-utr`} className="min-w-40 border-b border-r px-3 py-2 font-mono">{tx?.utrRef || ''}</td>,
                      <td key={`${index}-paid`} className="min-w-32 border-b border-r px-3 py-2">{fmtDate(tx?.paidAt)}</td>,
                      <td key={`${index}-added`} className="min-w-32 border-b border-r px-3 py-2">{fmtDate(tx?.recordAddedAt)}</td>,
                      <td key={`${index}-verified`} className="min-w-32 border-b border-r px-3 py-2">{fmtDate(tx?.verifiedAt)}</td>,
                      <td key={`${index}-account`} className="min-w-64 border-b border-r px-3 py-2">{accountText(tx)}</td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
