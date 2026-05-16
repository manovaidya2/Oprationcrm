import { useState, useEffect } from 'react';
import { Loader2, GraduationCap, Building2, UserCog, IndianRupee, TrendingUp, Clock, CheckCircle2, XCircle, AlertCircle, BookOpen, Package, Truck, ChevronRight, Users, ChevronDown, ChevronUp, BarChart3, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { dashApi } from '@/lib/api';
import { toast } from 'sonner';

const fmt   = n => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const fmtCr = n => { const v = Number(n)||0; if (v>=10000000) return `₹${(v/10000000).toFixed(1)}Cr`; if (v>=100000) return `₹${(v/100000).toFixed(1)}L`; if (v>=1000) return `₹${(v/1000).toFixed(1)}K`; return fmt(v); };

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
              <div className="font-bold text-emerald-600">{fmtCr(thisMonth?.amount)}</div>
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
                  {fmtCr(d.amount)}
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
  const [sort, setSort]         = useState('due');   // due | paid | total | name
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
              <div className={`font-bold text-sm ${color}`}>{fmtCr(value)}</div>
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
                  <div className="col-span-2 text-right font-medium text-slate-700">{fmtCr(c.totalFees||0)}</div>
                  <div className="col-span-2 text-right font-medium text-emerald-600">{fmtCr(c.totalPaid||0)}</div>
                  <div className={`col-span-2 text-right font-bold ${(c.totalDue||0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {fmtCr(c.totalDue||0)}
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

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats]     = useState(null);
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
          <StatCard icon={IndianRupee} label="Total Fees" value={fmt(stats?.totalFees)} color="text-blue-600" />
          <StatCard icon={CheckCircle2} label="Paid" value={fmt(stats?.totalPaid)} color="text-emerald-600" />
          <StatCard icon={Clock} label="Due" value={fmt(stats?.totalDue)} color="text-amber-600" />
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
        <StatCard icon={IndianRupee}  label="Total Fees"        value={fmtCr(stats?.totalFees)}  color="text-blue-600" />
        <StatCard icon={CheckCircle2} label="Total Collected"   value={fmtCr(stats?.totalPaid)}  color="text-emerald-600" />
        <StatCard icon={Clock}        label="Outstanding"       value={fmtCr(stats?.totalDue)}   color="text-amber-600" />
      </div>

      {/* Monthly chart — Admin only */}
      {role === 'Admin' && stats?.monthlyFees?.length > 0 && (
        <MonthlyChart data={stats.monthlyFees}/>
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
            <div className="space-y-3">
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