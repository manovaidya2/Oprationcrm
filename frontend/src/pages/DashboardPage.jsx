import { useState, useEffect } from 'react';
import { Loader2, GraduationCap, Building2, UserCog, IndianRupee, TrendingUp, Clock, CheckCircle2, XCircle, AlertCircle, BookOpen, Package, Truck, ChevronRight, Users, ChevronDown, ChevronUp, BarChart3, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { dashApi } from '@/lib/api';
import { toast } from 'sonner';

const fmt   = n => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

const STATUS_LABELS = {
  Draft: 'Draft', Submitted: 'Under Review', Changes_Requested: 'Changes Needed',
  Counselor_Approved: 'Counselor Approved', Rejected: 'Rejected',
  Accountant_Pending: 'Fee Pending', Sent_To_University: 'At University', Enrolled: 'Enrolled',
};
const STATUS_COLORS = {
  Draft: 'bg-gray-100 text-gray-700', Submitted: 'bg-blue-100 text-blue-700',
  Changes_Requested: 'bg-amber-100 text-amber-700', Counselor_Approved: 'bg-indigo-100 text-indigo-700',
  Rejected: 'bg-red-100 text-red-700', Accountant_Pending: 'bg-amber-100 text-amber-700',
  Sent_To_University: 'bg-purple-100 text-purple-700', Enrolled: 'bg-emerald-100 text-emerald-700',
};

function StatCard({ icon: Icon, label, value, color = 'text-foreground', sub }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Monthly Bar Chart ─────────────────────────────────────────
function MonthlyChart({ data }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d.amount), 1);
  const thisMonth = data[data.length - 1];
  const lastMonth = data[data.length - 2];
  const growth = lastMonth?.amount > 0
    ? Math.round(((thisMonth.amount - lastMonth.amount) / lastMonth.amount) * 100)
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-indigo-600"/>Monthly Fee Collections
          </CardTitle>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-right">
              <div className="text-xs text-muted-foreground">This Month</div>
              <div className="font-bold text-emerald-600">{fmt(thisMonth?.amount||0)}</div>
            </div>
            {growth !== null && (
              <div className={`text-xs font-bold px-2 py-1 rounded-full ${growth >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {growth >= 0 ? '↑' : '↓'} {Math.abs(growth)}% vs last month
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1.5 h-28">
          {data.map((d, i) => {
            const h = max > 0 ? Math.max(4, (d.amount / max) * 100) : 4;
            const isLast = i === data.length - 1;
            return (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                  {fmt(d.amount)}
                </div>
                <div
                  className={`w-full rounded-t-sm transition-all ${isLast ? 'bg-indigo-500' : d.amount > 0 ? 'bg-indigo-300' : 'bg-slate-100'}`}
                  style={{ height: `${h}%` }}
                />
                <span className="text-[9px] text-muted-foreground rotate-45 origin-left whitespace-nowrap mt-1">
                  {d.label.split(' ')[0]}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground px-0.5">
          <span>{data[0]?.label}</span>
          <span>{data[data.length-1]?.label}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Center Fees Table ─────────────────────────────────────────
function CenterFeesTable({ centers }) {
  const [sort, setSort]         = useState('due');
  const [dir,  setDir]          = useState('desc');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);

  const toggle = (key) => {
    if (sort === key) setDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSort(key); setDir('desc'); }
  };

  const filtered = centers
    .filter(c => !search || c.centerName.toLowerCase().includes(search.toLowerCase()) || c.city?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const m = dir === 'desc' ? -1 : 1;
      if (sort === 'name') return m * a.centerName.localeCompare(b.centerName);
      if (sort === 'total') return m * ((a.totalFees||0) - (b.totalFees||0));
      if (sort === 'paid')  return m * ((a.totalPaid||0) - (b.totalPaid||0));
      if (sort === 'due')   return m * ((a.totalDue||0)  - (b.totalDue||0));
      return 0;
    });

  const totals = centers.reduce((acc, c) => ({
    fees: acc.fees + (c.totalFees||0),
    paid: acc.paid + (c.totalPaid||0),
    due:  acc.due  + (c.totalDue||0),
  }), { fees: 0, paid: 0, due: 0 });

  const SortIcon = ({ k }) => sort === k
    ? (dir === 'desc' ? <ChevronDown className="h-3 w-3"/> : <ChevronUp className="h-3 w-3"/>)
    : <ChevronDown className="h-3 w-3 opacity-30"/>;

  const pctPaid = c => c.totalFees > 0 ? Math.round((c.totalPaid / c.totalFees) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-emerald-600"/>Center-wise Fee Status
          </CardTitle>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search center…"
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 w-40 focus:outline-none focus:border-indigo-400"
          />
        </div>
        {/* Summary row */}
        <div className="flex gap-3 flex-wrap mt-2">
          {[
            { label:'Total Fees',  value: totals.fees, color:'text-slate-700'   },
            { label:'Collected',   value: totals.paid, color:'text-emerald-600' },
            { label:'Outstanding', value: totals.due,  color:'text-amber-600'  },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className={`font-bold text-sm ${color}`}>{fmt(value)}</div>
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Header row */}
        <div className="grid grid-cols-12 text-xs font-bold text-muted-foreground uppercase tracking-wider px-4 py-2 border-b border-slate-100 bg-slate-50">
          <button className="col-span-4 text-left flex items-center gap-1" onClick={() => toggle('name')}>Center <SortIcon k="name"/></button>
          <button className="col-span-2 text-right flex items-center justify-end gap-1" onClick={() => toggle('total')}>Total <SortIcon k="total"/></button>
          <button className="col-span-2 text-right flex items-center justify-end gap-1" onClick={() => toggle('paid')}>Paid <SortIcon k="paid"/></button>
          <button className="col-span-2 text-right flex items-center justify-end gap-1" onClick={() => toggle('due')}>Due <SortIcon k="due"/></button>
          <div className="col-span-2 text-right">Progress</div>
        </div>

        <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">No centers found</div>
          )}
          {filtered.map(c => {
            const pct = pctPaid(c);
            const isExp = expanded === c._id;
            return (
              <div key={c._id}>
                <div
                  className="grid grid-cols-12 items-center px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors text-sm"
                  onClick={() => setExpanded(isExp ? null : c._id)}>
                  <div className="col-span-4 min-w-0">
                    <div className="font-semibold truncate">{c.centerName}</div>
                    {c.city && <div className="text-xs text-muted-foreground">{c.city}</div>}
                  </div>
                  <div className="col-span-2 text-right font-medium text-slate-700">{fmt(c.totalFees||0)}</div>
                  <div className="col-span-2 text-right font-medium text-emerald-600">{fmt(c.totalPaid||0)}</div>
                  <div className={`col-span-2 text-right font-bold ${(c.totalDue||0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {fmt(c.totalDue||0)}
                  </div>
                  <div className="col-span-2 flex items-center gap-1.5 justify-end">
                    <div className="flex-1 bg-slate-200 rounded-full h-1.5 max-w-12">
                      <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pct}%` }}/>
                    </div>
                    <span className="text-xs text-muted-foreground w-7 text-right">{pct}%</span>
                  </div>
                </div>
                {/* Expanded detail */}
                {isExp && (
                  <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label:'Students',  value: c.total,      color:'text-slate-700'    },
                      { label:'Enrolled',  value: c.enrolled,   color:'text-emerald-600'  },
                      { label:'Pending',   value: c.pending,    color:'text-blue-600'     },
                      { label:'Rejected',  value: c.rejected,   color:'text-red-500'      },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-center">
                        <div className={`font-bold text-lg ${color}`}>{value}</div>
                        <div className="text-xs text-muted-foreground">{label}</div>
                      </div>
                    ))}
                    {/* Mini progress bar */}
                    <div className="col-span-2 sm:col-span-4 mt-1">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Fee Collection Progress</span>
                        <span>{fmt(c.totalPaid||0)} / {fmt(c.totalFees||0)}</span>
                      </div>
                      <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }}/>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Bank / Account Wise Breakdown ────────────────────────────
function BankWiseSection({ data, allPayments }) {
  const [modal,    setModal]    = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  if (!data?.length) return null;

  const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';

  // Match strictly by ObjectId string
  function getTxns(accId) {
    const rows = [];
    (allPayments || []).forEach(p => {
      (p.transactions || []).forEach(tx => {
        if (tx.verificationStatus !== 'verified') return;
        if (!tx.paidToAccount || String(tx.paidToAccount) !== accId) return;
        if (dateFrom && new Date(tx.verifiedAt) < new Date(dateFrom)) return;
        if (dateTo   && new Date(tx.verifiedAt) > new Date(dateTo + 'T23:59:59')) return;
        rows.push({ ...tx, studentName: p.studentName || '' });
      });
    });
    return rows.sort((a,b) => new Date(b.verifiedAt) - new Date(a.verifiedAt));
  }

  function downloadCSV(acc, txns) {
    if (!txns.length) { alert('No transactions found'); return; }
    const total     = txns.reduce((s,t) => s + Number(t.amount||0), 0);
    const dateLabel = dateFrom||dateTo ? `${dateFrom||'start'} to ${dateTo||'today'}` : 'All time';
    const summary = [
      ['Account', acc.label], ['Mode', acc.mode],
      acc.upiId         ? ['UPI ID',        acc.upiId]         : null,
      acc.upiName       ? ['UPI Name',       acc.upiName]       : null,
      acc.bankName      ? ['Bank',           acc.bankName]      : null,
      acc.accountHolder ? ['Account Holder', acc.accountHolder] : null,
      acc.accountNumber ? ['Account No',     acc.accountNumber] : null,
      acc.ifscCode      ? ['IFSC',           acc.ifscCode]      : null,
      acc.branch        ? ['Branch',         acc.branch]        : null,
      ['Period', dateLabel],
      ['Total Transactions', txns.length],
      ['Total Amount', total], [],
      ['Sr.No','Student Name','Amount','Mode','UTR','UPI ID','Bank','Account Holder','Account No','Paid Date','Verified Date','Verified By'],
    ].filter(Boolean);
    const rows = txns.map((t,i) => [
      i+1, t.studentName, t.amount||0, t.mode||'',
      t.utrRef||'', t.upiId||'', t.bankName||'', t.accountHolder||'', t.accountNumber||'',
      fmtD(t.paidAt), fmtD(t.verifiedAt), t.verifiedBy?.name||'',
    ]);
    const esc  = v => `"${String(v).replace(/"/g,'""')}"`;
    const csv  = [...summary,...rows].map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    const ds = dateFrom||dateTo ? `_${dateFrom||''}to${dateTo||''}` : '';
    a.download = `${acc.label.replace(/[^a-z0-9]/gi,'_')}_history${ds}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* Account Cards — same style as Settings page */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-indigo-600"/>Payment Accounts — Collection Summary
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Click on any account to view its transaction history</p>
        </CardHeader>
        <CardContent className="space-y-2 pt-1">
          {data.map(acc => {
            const isUPI  = acc.mode === 'UPI';
            const isBank = acc.mode === 'Bank Transfer';
            return (
              <div key={acc.id}
                className="flex items-center justify-between rounded-lg border px-4 py-3 bg-background hover:bg-slate-50 cursor-pointer transition-colors group"
                onClick={() => setModal(acc)}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isUPI ? 'bg-blue-100' : 'bg-emerald-100'}`}>
                    <IndianRupee className={`h-4 w-4 ${isUPI ? 'text-blue-600' : 'text-emerald-600'}`}/>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{acc.label}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isUPI ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{acc.mode}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {isUPI && acc.upiId && <span>UPI: <span className="font-mono font-medium">{acc.upiId}</span>{acc.upiName ? ` — ${acc.upiName}` : ''}</span>}
                      {isBank && <span>{acc.bankName}{acc.accountHolder ? ` · ${acc.accountHolder}` : ''}{acc.accountNumber ? ` · A/C: ${acc.accountNumber}` : ''}{acc.ifscCode ? ` · ${acc.ifscCode}` : ''}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className={`font-bold text-sm ${acc.total > 0 ? 'text-emerald-700' : 'text-muted-foreground'}`}>{fmt(acc.total)}</div>
                    <div className="text-xs text-muted-foreground">{acc.count} txn{acc.count !== 1 ? 's' : ''}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 transition-colors"/>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Transaction Modal */}
      {modal && (() => {
        const txns = getTxns(modal.id);
        const total = txns.reduce((s,t) => s + Number(t.amount||0), 0);
        const isUPI  = modal.mode === 'UPI';
        const isBank = modal.mode === 'Bank Transfer';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
            <div className="absolute inset-0 bg-black/40"/>
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-100 flex-shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isUPI ? 'bg-blue-100' : 'bg-emerald-100'}`}>
                      <IndianRupee className={`h-4 w-4 ${isUPI ? 'text-blue-600' : 'text-emerald-600'}`}/>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-bold text-slate-800">{modal.label}</h2>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isUPI ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{modal.mode}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {isUPI && modal.upiId && <span>UPI: <b className="font-mono">{modal.upiId}</b>{modal.upiName ? ` — ${modal.upiName}` : ''}</span>}
                        {isBank && <span>{modal.bankName}{modal.accountHolder ? ` · ${modal.accountHolder}` : ''}{modal.accountNumber ? ` · A/C: ${modal.accountNumber}` : ''}{modal.ifscCode ? ` · ${modal.ifscCode}` : ''}</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none mt-0.5">✕</button>
                </div>

                {/* Date filter + CSV */}
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">From</div>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 h-8 focus:outline-none focus:border-indigo-400"/>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">To</div>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 h-8 focus:outline-none focus:border-indigo-400"/>
                  </div>
                  {(dateFrom||dateTo) && (
                    <button onClick={e=>{e.stopPropagation();setDateFrom('');setDateTo('');}}
                      className="text-xs text-red-400 hover:text-red-600 h-8 px-1">✕ Clear</button>
                  )}
                  <button onClick={e=>{e.stopPropagation();downloadCSV(modal,txns);}}
                    className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-3 h-8 transition-colors">
                    ↓ Download CSV
                  </button>
                </div>

                {/* Summary */}
                <div className="mt-3 flex gap-2">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5">
                    <div className="text-xs text-indigo-500">Total Collected</div>
                    <div className="font-bold text-indigo-700">{fmt(total)}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                    <div className="text-xs text-muted-foreground">Transactions</div>
                    <div className="font-bold text-slate-700">{txns.length}</div>
                  </div>
                </div>
              </div>

              {/* Transactions list */}
              <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
                {txns.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12">
                    <IndianRupee className="h-8 w-8 mx-auto mb-2 opacity-20"/>
                    <p className="text-sm">No verified transactions{(dateFrom||dateTo) ? ' in selected date range' : ''}</p>
                  </div>
                ) : txns.map((tx, ti) => (
                  <div key={tx._id||ti} className="border border-slate-200 rounded-xl px-4 py-3 hover:border-slate-300 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-slate-400 font-mono w-5">#{ti+1}</span>
                          <span className="font-semibold text-slate-800 text-sm">{tx.studentName}</span>
                          <span className="font-bold text-emerald-700">{fmt(tx.amount)}</span>
                          {tx.mode && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{tx.mode}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-0.5 pl-7">
                          {tx.utrRef && <span>UTR: <b className="font-mono text-foreground">{tx.utrRef}</b></span>}
                          {tx.upiId  && <span>UPI: {tx.upiId}</span>}
                          {tx.accountHolder && <span>A/C Holder: <b>{tx.accountHolder}</b></span>}
                          <span>Paid: {fmtD(tx.paidAt)}</span>
                          <span className="text-emerald-600">✓ Verified: {fmtD(tx.verifiedAt)}</span>
                          {tx.verifiedBy?.name && <span>by {tx.verifiedBy.name}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashApi.stats()
      .then(setStats)
      .catch(() => toast.error('Could not load stats'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  const role = user?.role;

  // ── Center Dashboard ─────────────────────────────────────
  if (role === 'Center') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Center Dashboard</h1>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={GraduationCap} label="Total Students" value={stats?.totalStudents || 0} />
          <StatCard icon={IndianRupee} label="Total Fees" value={fmt(stats?.totalFees||0)} color="text-blue-600" />
          <StatCard icon={CheckCircle2} label="Paid" value={fmt(stats?.totalPaid||0)} color="text-emerald-600" />
          <StatCard icon={Clock} label="Due" value={fmt(stats?.totalDue||0)} color="text-amber-600" />
        </div>
        {stats?.statusCounts && Object.keys(stats.statusCounts).length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Application Status Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.statusCounts).map(([status, count]) => (
                  <div key={status} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-700'}`}>
                    <span className="font-medium">{STATUS_LABELS[status] || status}</span>
                    <span className="font-bold">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── Accountant Dashboard ──────────────────────────────────
  if (role === 'Accountant') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Accountant Dashboard</h1>
        <div className="grid grid-cols-2 gap-4">
          <StatCard icon={Clock} label="Pending Admissions" value={stats?.pendingAdmissions || 0} color="text-amber-600" sub="Awaiting fee verification" />
          <StatCard icon={IndianRupee} label="Doc Fee Pending" value={stats?.pendingDocFees || 0} color="text-blue-600" sub="Documents awaiting approval" />
        </div>
      </div>
    );
  }

  // ── University Dashboard ──────────────────────────────────
  if (role === 'University') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">University Dashboard</h1>
        <div className="grid grid-cols-2 gap-4">
          <StatCard icon={Clock} label="Pending Enrollment" value={stats?.pendingEnrollment || 0} color="text-purple-600" sub="Awaiting enrollment number" />
          <StatCard icon={CheckCircle2} label="Enrolled Students" value={stats?.enrolled || 0} color="text-emerald-600" sub="Successfully enrolled" />
        </div>
      </div>
    );
  }

  // ── Dispatch Dashboard ────────────────────────────────────
  if (role === 'Dispatch') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dispatch Dashboard</h1>
        <StatCard icon={Package} label="Documents In Pipeline" value={stats?.pendingDocuments || 0} color="text-teal-600" sub="Awaiting processing or dispatch" />
      </div>
    );
  }

  // ── Admin / Counselor Dashboard ───────────────────────────
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{role === 'Admin' ? 'Admin' : 'Counselor'} Dashboard</h1>

      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={GraduationCap} label="Total Students"   value={stats?.studentCount || 0} />
        {role === 'Admin' && <StatCard icon={Building2} label="Centers"    value={stats?.centerCount || 0} />}
        {role === 'Admin' && <StatCard icon={UserCog}   label="Counselors" value={stats?.counselorCount || 0} />}
        <StatCard icon={CheckCircle2} label="Enrolled"          value={stats?.statusBreakdown?.find(s=>s._id==='Enrolled')?.count||0} color="text-emerald-600" />
        <StatCard icon={IndianRupee}  label="Total Fees"        value={fmt(stats?.totalFees||0)}  color="text-blue-600" />
        <StatCard icon={CheckCircle2} label="Total Collected"   value={fmt(stats?.totalPaid||0)}  color="text-emerald-600" />
        <StatCard icon={Clock}        label="Outstanding"       value={fmt(stats?.totalDue||0)}   color="text-amber-600" />
      </div>

      {/* Monthly chart — Admin only */}
      {role === 'Admin' && stats?.monthlyFees?.length > 0 && (
        <MonthlyChart data={stats.monthlyFees}/>
      )}

      {/* Bank/Account wise collections — Admin only */}
      {role === 'Admin' && stats?.bankWiseBreakdown?.length > 0 && (
        <BankWiseSection data={stats.bankWiseBreakdown} allPayments={stats.allPaymentsFlat || []}/>
      )}

      {/* Center fees table — Admin only */}
      {role === 'Admin' && stats?.centersBreakdown?.length > 0 && (
        <CenterFeesTable centers={stats.centersBreakdown}/>
      )}

      {/* Centers Student Breakdown — Admin only */}
      {role === 'Admin' && stats?.centersBreakdown?.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4"/>Center-wise Students
              </CardTitle>
              <button onClick={()=>navigate('/centers')} className="text-xs text-primary underline flex items-center gap-1">
                View all centers <ChevronRight className="h-3 w-3"/>
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {stats.centersBreakdown.map((c) => (
                <div key={c._id} className="border rounded-xl p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={()=>navigate('/students')}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="font-semibold">{c.centerName}</div>
                      {c.city && <div className="text-xs text-muted-foreground">{c.city}</div>}
                    </div>
                    <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-3 py-1.5">
                      <Users className="h-3.5 w-3.5 text-muted-foreground"/>
                      <span className="font-bold text-lg">{c.total}</span>
                      <span className="text-xs text-muted-foreground">students</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-muted">
                      {c.enrolled > 0  && <div className="bg-emerald-500 h-full" style={{width:`${(c.enrolled/c.total)*100}%`}} title={`Enrolled: ${c.enrolled}`}/>}
                      {c.pending > 0   && <div className="bg-blue-500 h-full"    style={{width:`${(c.pending/c.total)*100}%`}}  title={`In Progress: ${c.pending}`}/>}
                      {c.draft > 0     && <div className="bg-gray-400 h-full"    style={{width:`${(c.draft/c.total)*100}%`}}   title={`Draft: ${c.draft}`}/>}
                      {c.rejected > 0  && <div className="bg-red-400 h-full"     style={{width:`${(c.rejected/c.total)*100}%`}} title={`Rejected: ${c.rejected}`}/>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {c.enrolled > 0  && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block"/>{c.enrolled} Enrolled</span>}
                      {c.pending > 0   && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500 inline-block"/>{c.pending} In Progress</span>}
                      {c.draft > 0     && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-400 inline-block"/>{c.draft} Draft</span>}
                      {c.rejected > 0  && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400 inline-block"/>{c.rejected} Rejected</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Application Pipeline */}
      {stats?.statusBreakdown?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Application Pipeline</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.statusBreakdown.map(({ _id, count }) => (
                <div key={_id} className="flex items-center justify-between">
                  <span className={`text-sm px-2 py-0.5 rounded-full ${STATUS_COLORS[_id] || 'bg-gray-100 text-gray-700'}`}>
                    {STATUS_LABELS[_id] || _id}
                  </span>
                  <div className="flex items-center gap-3 flex-1 ml-3">
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div className="h-2 rounded-full bg-primary"
                        style={{ width: `${Math.min(100, (count / (stats.studentCount || 1)) * 100)}%` }}/>
                    </div>
                    <span className="text-sm font-medium w-6 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}