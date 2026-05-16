import { useState, useEffect, useCallback } from 'react';
import {
  Activity, Search, Filter, RefreshCw, Loader2, ChevronLeft,
  ChevronRight, X, User, Clock, Tag, FileText, Download,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { auditApi } from '@/lib/api';
import { toast } from 'sonner';

// ── Config ───────────────────────────────────────────────────
const ROLES = ['Admin', 'Counselor', 'Center', 'Accountant', 'University', 'Dispatch'];

const ACTION_LABELS = {
  student_created:             { label: 'Student Added',            color: 'bg-sky-100 text-sky-700' },
  student_updated:             { label: 'Student Updated',          color: 'bg-blue-100 text-blue-700' },
  application_submitted:       { label: 'Application Submitted',    color: 'bg-indigo-100 text-indigo-700' },
  counselor_approved:          { label: 'Application Approved',     color: 'bg-green-100 text-green-700' },
  changes_requested:           { label: 'Changes Requested',        color: 'bg-amber-100 text-amber-700' },
  rejected:                    { label: 'Application Rejected',     color: 'bg-red-100 text-red-700' },
  accountant_action:           { label: 'Accountant Reviewed',      color: 'bg-orange-100 text-orange-700' },
  enrollment_assigned:         { label: 'Enrollment Assigned',      color: 'bg-emerald-100 text-emerald-700' },
  doc_requested:               { label: 'Document Requested',       color: 'bg-violet-100 text-violet-700' },
  doc_forwarded:               { label: 'Document Forwarded',       color: 'bg-purple-100 text-purple-700' },
  accountant_doc_action:       { label: 'Doc Fee Reviewed',         color: 'bg-orange-100 text-orange-700' },
  university_dispatched:       { label: 'University Dispatched',    color: 'bg-teal-100 text-teal-700' },
  dispatch_received:           { label: 'Dispatch Received',        color: 'bg-cyan-100 text-cyan-700' },
  scan_uploaded:               { label: 'Scan Uploaded',            color: 'bg-teal-100 text-teal-700' },
  counselor_forwarded_to_center:{ label: 'Forwarded to Center',     color: 'bg-indigo-100 text-indigo-700' },
  doc_payment_added:           { label: 'Doc Payment Added',        color: 'bg-emerald-100 text-emerald-700' },
  doc_payment_verified:        { label: 'Doc Payment Verified',     color: 'bg-green-100 text-green-700' },
  counselor_forwarded_payment: { label: 'Payment Forwarded',        color: 'bg-indigo-100 text-indigo-700' },
  doc_dispatched:              { label: 'Document Dispatched',      color: 'bg-teal-100 text-teal-700' },
  fee_updated:                 { label: 'Fee Updated',              color: 'bg-blue-100 text-blue-700' },
  payment_added:               { label: 'Payment Recorded',         color: 'bg-emerald-100 text-emerald-700' },
  fee_payment_forwarded:       { label: 'Fee Payment Forwarded',    color: 'bg-amber-100 text-amber-700' },
  fee_payment_verified:        { label: 'Fee Payment Verified',     color: 'bg-green-100 text-green-700' },
};

const ROLE_COLORS = {
  Admin:      'bg-red-100 text-red-700',
  Counselor:  'bg-indigo-100 text-indigo-700',
  Center:     'bg-sky-100 text-sky-700',
  Accountant: 'bg-amber-100 text-amber-700',
  University: 'bg-purple-100 text-purple-700',
  Dispatch:   'bg-teal-100 text-teal-700',
};

const ENTITY_ICONS = {
  Student:         '👨‍🎓',
  StudentDocument: '📄',
  Payment:         '💳',
};

const fmtDt = d => d ? new Date(d).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: true,
}) : '—';

// ── Export CSV ───────────────────────────────────────────────
function exportCSV(logs) {
  const headers = ['Date & Time', 'Action', 'Entity', 'Performed By', 'Role', 'Message'];
  const rows = logs.map(l => [
    fmtDt(l.at),
    ACTION_LABELS[l.action]?.label || l.action,
    l.entity,
    l.performedBy?.name || '—',
    l.performedBy?.role || l.role || '—',
    l.message || '—',
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `activity-log-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast.success('CSV downloaded');
}

// ── Main Page ─────────────────────────────────────────────────
export default function ActivityLogPage() {
  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search,   setSearch]   = useState('');
  const [roleF,    setRoleF]    = useState('all');
  const [entityF,  setEntityF]  = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');
  const [page,     setPage]     = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, limit: 50 };
      if (search)              params.search = search;
      if (roleF !== 'all')     params.role   = roleF;
      if (entityF !== 'all')   params.entity = entityF;
      if (fromDate)            params.from   = fromDate;
      if (toDate)              params.to     = toDate;

      const data = await auditApi.list(params);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch { toast.error('Failed to load logs'); }
    finally { setLoading(false); }
  }, [search, roleF, entityF, fromDate, toDate, page]);

  useEffect(() => { setPage(1); }, [search, roleF, entityF, fromDate, toDate]);
  useEffect(() => { load(); }, [load]);

  function clearFilters() {
    setSearch(''); setRoleF('all'); setEntityF('all');
    setFromDate(''); setToDate(''); setPage(1);
  }

  const hasFilters = search || roleF !== 'all' || entityF !== 'all' || fromDate || toDate;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground"/>
            Activity Log
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete audit trail of all actions across the CRM
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV(logs)} disabled={logs.length === 0}>
            <Download className="h-4 w-4 mr-1"/>Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`}/>Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(p => !p)}>
            <Filter className="h-4 w-4 mr-1"/>
            Filters {hasFilters && <span className="ml-1 h-2 w-2 rounded-full bg-primary inline-block"/>}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
        <Input
          className="pl-9 pr-9"
          placeholder="Search by student name, action, message…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4"/>
          </button>
        )}
      </div>

      {/* Filters panel */}
      {showFilters && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Role</Label>
                <Select value={roleF} onValueChange={setRoleF}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Entity Type</Label>
                <Select value={entityF} onValueChange={setEntityF}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="Student">Student</SelectItem>
                    <SelectItem value="StudentDocument">Document</SelectItem>
                    <SelectItem value="Payment">Payment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">From Date</Label>
                <Input type="date" className="h-8 text-sm" value={fromDate} onChange={e => setFromDate(e.target.value)}/>
              </div>
              <div>
                <Label className="text-xs">To Date</Label>
                <Input type="date" className="h-8 text-sm" value={toDate} onChange={e => setToDate(e.target.value)}/>
              </div>
            </div>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <X className="h-3 w-3"/>Clear all filters
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats bar */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {loading ? 'Loading…' : `${total.toLocaleString()} total records${hasFilters ? ' (filtered)' : ''}`}
        </span>
        {pages > 1 && (
          <span>Page {page} of {pages}</span>
        )}
      </div>

      {/* Log list */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-lg">
          <Activity className="h-10 w-10 mx-auto text-muted-foreground mb-3"/>
          <p className="text-muted-foreground">No activity records found</p>
          {hasFilters && <button onClick={clearFilters} className="text-sm text-primary mt-2 underline">Clear filters</button>}
        </div>
      ) : (
        <div className="space-y-1.5">
          {logs.map((log, i) => {
            const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: 'bg-gray-100 text-gray-700' };
            const roleColor  = ROLE_COLORS[log.performedBy?.role || log.role] || 'bg-gray-100 text-gray-700';
            const entityIcon = ENTITY_ICONS[log.entity] || '📋';

            return (
              <div key={log._id || i}
                className="flex items-start gap-3 border rounded-lg px-4 py-3 bg-card hover:bg-muted/20 transition-colors">

                {/* Entity icon */}
                <div className="flex-shrink-0 text-lg mt-0.5">{entityIcon}</div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Action badge */}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${actionInfo.color}`}>
                      {actionInfo.label}
                    </span>
                    {/* Role badge */}
                    {(log.performedBy?.role || log.role) && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${roleColor}`}>
                        {log.performedBy?.role || log.role}
                      </span>
                    )}
                    {/* Entity type */}
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {log.entity}
                    </span>
                  </div>

                  {/* Message */}
                  <p className="text-sm mt-1 text-foreground">{log.message || '—'}</p>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {/* Performed by */}
                    {log.performedBy?.name && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3"/>{log.performedBy.name}
                      </span>
                    )}
                    {/* Extra details */}
                    {log.details && Object.keys(log.details).length > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Tag className="h-3 w-3"/>
                        {Object.entries(log.details)
                          .filter(([,v]) => v !== undefined && v !== '' && v !== null)
                          .slice(0, 3)
                          .map(([k,v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                          .join(' · ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Timestamp */}
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                    <Clock className="h-3 w-3"/>{fmtDt(log.at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}>
            <ChevronLeft className="h-4 w-4"/>Prev
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, pages) }, (_, i) => {
              let p;
              if (pages <= 5) p = i + 1;
              else if (page <= 3) p = i + 1;
              else if (page >= pages - 2) p = pages - 4 + i;
              else p = page - 2 + i;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`h-8 w-8 rounded text-sm ${p === page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                  {p}
                </button>
              );
            })}
          </div>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages || loading}>
            Next<ChevronRight className="h-4 w-4"/>
          </Button>
        </div>
      )}
    </div>
  );
}
