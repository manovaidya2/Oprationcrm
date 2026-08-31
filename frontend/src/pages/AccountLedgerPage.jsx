import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, ChevronRight, Download, FileSpreadsheet, Loader2, Search, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accountLedgerApi } from '@/lib/api';
import { toast } from 'sonner';

const fmt = value => `Rs ${(Number(value) || 0).toLocaleString('en-IN')}`;
const fmtDate = value => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;

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

function CenterList() {
  const navigate = useNavigate();
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    accountLedgerApi.centers()
      .then(setCenters)
      .catch(() => toast.error('Failed to load account ledger centers'))
      .finally(() => setLoading(false));
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = centers.filter(center =>
    !q ||
    center.name?.toLowerCase().includes(q) ||
    center.organisationName?.toLowerCase().includes(q) ||
    center.city?.toLowerCase().includes(q)
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
          Account Ledger
        </h1>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9 pr-9"
          placeholder="Search center..."
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        {search && (
          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch('')}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          No centers found
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(center => (
            <Card key={center._id} className="cursor-pointer transition-colors hover:border-indigo-300" onClick={() => navigate(`/account-ledger/${center._id}`)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                      <h2 className="truncate font-semibold text-slate-800">{center.name || center.organisationName}</h2>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {[center.organisationName && center.organisationName !== center.name ? center.organisationName : '', center.city, center.state].filter(Boolean).join(' / ')}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-400">Students</div>
                    <div className="font-bold text-slate-800">{center.studentCount || 0}</div>
                  </div>
                  <div className="rounded-lg bg-amber-50 px-3 py-2">
                    <div className="text-xs text-amber-600">Due</div>
                    <div className="font-bold text-amber-700">{fmt(center.dueAmount)}</div>
                  </div>
                  <div className="rounded-lg bg-indigo-50 px-3 py-2">
                    <div className="text-xs text-indigo-600">Total</div>
                    <div className="font-bold text-indigo-700">{fmt(center.totalAmount)}</div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 px-3 py-2">
                    <div className="text-xs text-emerald-600">Paid</div>
                    <div className="font-bold text-emerald-700">{fmt(center.paidAmount)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CenterAccountLedger() {
  const navigate = useNavigate();
  const { centerId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setData(await accountLedgerApi.centerStudents(centerId));
    } catch (error) {
      toast.error(error.message || 'Failed to load account ledger');
    } finally {
      setLoading(false);
    }
  }, [centerId]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.rows || [];
  const maxTransactions = Math.max(1, Number(data?.maxTransactions || 0), ...rows.map(row => row.transactions?.length || 0));
  const q = search.trim().toLowerCase();
  const filteredRows = rows.filter(row => {
    const student = row.student || {};
    return !q ||
      student.name?.toLowerCase().includes(q) ||
      student.enrollmentNumber?.toLowerCase().includes(q) ||
      student.courseName?.toLowerCase().includes(q) ||
      student.phone?.toLowerCase().includes(q);
  });

  const totals = useMemo(() => filteredRows.reduce((acc, row) => ({
    totalAmount: acc.totalAmount + Number(row.totalAmount || 0),
    amountPaid: acc.amountPaid + Number(row.amountPaid || 0),
    amountDue: acc.amountDue + Number(row.amountDue || 0),
  }), { totalAmount: 0, amountPaid: 0, amountDue: 0 }), [filteredRows]);

  function downloadCsv() {
    const txHeaders = [];
    for (let index = 0; index < maxTransactions; index += 1) {
      const no = index + 1;
      txHeaders.push(`Transaction ${no} Amount Paid`, `Transaction ${no} Mode`, `Transaction ${no} UTR`, `Transaction ${no} Paid Date`, `Transaction ${no} Verified Date`, `Transaction ${no} Paid To`);
    }

    const headers = ['Student Name', 'Enrollment Number', 'Total Amount', 'Amount Paid', 'Amount Due', ...txHeaders];
    const csvRows = filteredRows.map(row => {
      const txValues = [];
      for (let index = 0; index < maxTransactions; index += 1) {
        const tx = row.transactions?.[index];
        txValues.push(tx?.amount || '', tx?.mode || '', tx?.utrRef || '', fmtDate(tx?.paidAt), fmtDate(tx?.verifiedAt), accountText(tx));
      }
      return [
        row.student?.name || '',
        row.student?.enrollmentNumber || '',
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
    link.download = `account-ledger-${data?.center?.name || 'center'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/account-ledger')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{data?.center?.name || 'Center Account Ledger'}</h1>
            <div className="text-xs text-muted-foreground">
              {[data?.center?.organisationName && data.center.organisationName !== data.center.name ? data.center.organisationName : '', data?.center?.city, data?.center?.state].filter(Boolean).join(' / ')}
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={downloadCsv} disabled={filteredRows.length === 0}>
          <Download className="mr-1 h-4 w-4" />
          CSV
        </Button>
      </div>

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

      <div className="relative w-full max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9 pr-9" placeholder="Search student, enrollment, course..." value={search} onChange={event => setSearch(event.target.value)} />
        {search && (
          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch('')}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="max-h-[68vh] w-full min-w-0 max-w-full overflow-auto">
          <table className="border-collapse text-left text-xs" style={{ minWidth: `${680 + (maxTransactions * 660)}px` }}>
            <thead className="sticky top-0 z-20 bg-slate-100 text-slate-700">
              <tr>
                <th className="sticky left-0 z-30 border-b border-r bg-slate-100 px-3 py-2" rowSpan="2">Student Name</th>
                <th className="border-b border-r px-3 py-2" rowSpan="2">Enrollment Number</th>
                <th className="border-b border-r px-3 py-2 text-right" rowSpan="2">Total Amount</th>
                <th className="border-b border-r px-3 py-2 text-right" rowSpan="2">Amount Paid</th>
                <th className="border-b border-r px-3 py-2 text-right" rowSpan="2">Amount Due</th>
                {Array.from({ length: maxTransactions }).map((_, index) => (
                  <th key={index} className="border-b border-r bg-indigo-50 px-3 py-2 text-center font-bold text-indigo-700" colSpan="6">
                    Transaction {index + 1}
                  </th>
                ))}
              </tr>
              <tr>
                {Array.from({ length: maxTransactions }).flatMap((_, index) => (
                  ['Amount Paid', 'Mode', 'UTR', 'Paid Date', 'Verified Date', 'Paid To'].map(label => (
                    <th key={`${index}-${label}`} className="border-b border-r bg-indigo-50 px-3 py-2 font-semibold text-indigo-700">{label}</th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={5 + (maxTransactions * 6)}>No students found</td>
                </tr>
              ) : filteredRows.map(row => (
                <tr key={row.student?._id} className="hover:bg-slate-50">
                  <td className="sticky left-0 z-10 min-w-56 border-b border-r bg-white px-3 py-2 font-semibold text-slate-800">{row.student?.name || ''}</td>
                  <td className="min-w-40 border-b border-r px-3 py-2 font-mono text-emerald-700">{row.student?.enrollmentNumber || ''}</td>
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

export default function AccountLedgerPage() {
  const { centerId } = useParams();
  return centerId ? <CenterAccountLedger /> : <CenterList />;
}
