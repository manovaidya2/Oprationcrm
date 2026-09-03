import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, ChevronRight, FileText, Loader2, Printer, Search, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accountLedgerApi } from '@/lib/api';
import { useInstantResource } from '@/lib/useInstantResource';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';

const fmt = value => `Rs ${(Number(value) || 0).toLocaleString('en-IN')}`;
const today = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const mongoIdPattern = /^[a-f\d]{24}$/i;
const inputClass = 'h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring';

function text(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function displayStudentName(row) {
  const name = String(row?.student?.name || '').trim();
  if (name && !mongoIdPattern.test(name)) return name;
  return String(row?.student?.enrollmentNumber || 'Student').trim();
}

function fmtDate(value) {
  return value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
}

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

function centerAddress(center) {
  return [center?.organisationName && center.organisationName !== center.name ? center.organisationName : '', center?.city, center?.state]
    .filter(Boolean)
    .join(' / ');
}

function totalsFor(rows) {
  return rows.reduce((acc, row) => {
    const feeTotal = Number(row.totalAmount || 0);
    const feePaid = Number(row.amountPaid || 0);
    const feeDue = Number(row.amountDue || 0);
    const docTotal = Number(row.docTotalAmount || 0);
    const docPaid = Number(row.docAmountPaid || 0);
    const docDue = Number(row.docAmountDue || 0);
    return {
      totalAmount: acc.totalAmount + feeTotal,
      amountPaid: acc.amountPaid + feePaid,
      amountDue: acc.amountDue + feeDue,
      docTotalAmount: acc.docTotalAmount + docTotal,
      docAmountPaid: acc.docAmountPaid + docPaid,
      docAmountDue: acc.docAmountDue + docDue,
      grandTotalAmount: acc.grandTotalAmount + feeTotal + docTotal,
      grandAmountPaid: acc.grandAmountPaid + feePaid + docPaid,
      grandAmountDue: acc.grandAmountDue + feeDue + docDue,
    };
  }, {
    totalAmount: 0, amountPaid: 0, amountDue: 0,
    docTotalAmount: 0, docAmountPaid: 0, docAmountDue: 0,
    grandTotalAmount: 0, grandAmountPaid: 0, grandAmountDue: 0,
  });
}

function openInvoice(center, rows, rangeLabel = '') {
  if (!rows.length) {
    toast.error('Select at least one student');
    return;
  }

  const totals = totalsFor(rows);
  const invoiceSubject = rows.length === 1 ? displayStudentName(rows[0]) : 'Students';
  const invoiceNo = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const hasDocCharges = Number(totals.docTotalAmount || 0) > 0 || rows.some(r => (r.documents || []).length > 0);

  const rowsHtml = rows.map((row, index) => {
    const feeTotal = Number(row.totalAmount || 0);
    const feePaid = Number(row.amountPaid || 0);
    const feeDue = Number(row.amountDue || 0);
    const docTotal = Number(row.docTotalAmount || 0);
    const docPaid = Number(row.docAmountPaid || 0);
    const docDue = Number(row.docAmountDue || 0);
    const grandTotal = feeTotal + docTotal;
    const grandPaid = feePaid + docPaid;
    const grandDue = feeDue + docDue;
    const sub = [row.student?.enrollmentNumber, row.student?.courseName].filter(Boolean).join(' · ');
    return `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${text(displayStudentName(row))}</strong>${sub ? `<span>${text(sub)}</span>` : ''}</td>
        <td class="num">${fmt(feeTotal)}</td>
        <td class="num">${fmt(docTotal)}</td>
        <td class="num total">${fmt(grandTotal)}</td>
        <td class="num paid">${fmt(grandPaid)}</td>
        <td class="num due">${fmt(grandDue)}</td>
      </tr>
    `;
  }).join('');

  const docDetailRows = rows.flatMap(row => (row.documents || []).map(doc => `
      <tr>
        <td>${text(displayStudentName(row))}</td>
        <td>${text(doc.name || '-')}<span>${text(doc.requestType || 'Soft Copy')}</span></td>
        <td class="num">${fmt(doc.chargeFee)}</td>
        <td class="num paid">${fmt(doc.paidAmount)}</td>
        <td class="num due">${fmt(doc.dueAmount)}</td>
      </tr>
    `)).join('');

  const docDetailHtml = hasDocCharges && docDetailRows ? `
          <h3 class="section-title">Document Charges — Detail</h3>
          <table class="doc-detail">
            <thead>
              <tr>
                <th style="width:30%">Student</th>
                <th>Document</th>
                <th class="num" style="width:16%">Charge</th>
                <th class="num" style="width:16%">Paid</th>
                <th class="num" style="width:16%">Due</th>
              </tr>
            </thead>
            <tbody>${docDetailRows}</tbody>
          </table>
  ` : '';

  const win = window.open('', '_blank');
  if (!win) {
    toast.error('Popup blocked. Please allow popups to generate invoice.');
    return;
  }

  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Invoice</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; background: #f4f7fb; color: #0f172a; font-family: Arial, sans-serif; }
          .page { width: 210mm; min-height: 297mm; margin: 20px auto; background: #fff; padding: 28px; box-shadow: 0 16px 45px rgba(15,23,42,.12); }
          .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid #2563eb; padding-bottom: 18px; }
          h1 { margin: 0; font-size: 34px; letter-spacing: 0; color: #1d4ed8; }
          .muted { color: #64748b; font-size: 13px; line-height: 1.5; }
          .subject { margin-top: 6px; font-size: 15px; color: #475569; }
          .subject strong { color: #0f172a; }
          .meta { text-align: right; font-size: 13px; line-height: 1.7; color: #0f172a; }
          .meta strong { color: #0f172a; }
          .billto { margin: 22px 0 18px; display: grid; grid-template-columns: 1fr auto; gap: 18px; align-items: stretch; }
          .box { border: 1px solid #dbe3ef; border-radius: 8px; padding: 16px; background: #f8fafc; min-height: 104px; }
          .box h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: #475569; }
          .box strong { display: block; font-size: 15px; color: #0f172a; margin-bottom: 4px; }
          .invoice-chip { min-width: 220px; background: #fff; }
          .invoice-chip div { display: flex; justify-content: space-between; gap: 20px; padding: 4px 0; font-size: 12px; color: #475569; }
          .invoice-chip b { color: #0f172a; }
          .breakdown { width: 100%; border-collapse: collapse; margin: 18px 0 24px; font-size: 12px; table-layout: auto; }
          .breakdown th { background: #eff6ff; color: #1e3a8a; padding: 9px 10px; border: 1px solid #cbd5e1; text-align: right; }
          .breakdown th:first-child { text-align: left; }
          .breakdown td { padding: 9px 10px; border: 1px solid #dbe3ef; text-align: right; font-weight: 700; }
          .breakdown td:first-child { text-align: left; font-weight: 600; color: #475569; }
          .breakdown tr.grand td { background: #eff6ff; color: #1d4ed8; font-size: 13px; }
          .section-title { margin: 26px 0 0; font-size: 14px; color: #1e3a8a; }
          .total { color: #1d4ed8; }
          .paid { color: #047857; }
          .due { color: #b45309; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; table-layout: fixed; }
          th { background: #eff6ff; color: #1e3a8a; text-align: left; padding: 7px 8px; border: 1px solid #cbd5e1; word-break: break-word; }
          td { padding: 7px 8px; border: 1px solid #dbe3ef; vertical-align: top; word-break: break-word; }
          td span { display: block; margin-top: 2px; color: #64748b; font-size: 10px; font-weight: 400; }
          .num { text-align: right; white-space: nowrap; font-weight: 700; }
          th.num { text-align: right; }
          .foot { display: flex; justify-content: flex-end; margin-top: 42px; color: #0f172a; font-size: 12px; }
          .signature { width: 220px; border-top: 1px solid #94a3b8; padding-top: 10px; text-align: center; font-weight: 700; }
          .actions { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; background: rgba(244,247,251,.92); backdrop-filter: blur(8px); }
          button { border: 0; border-radius: 8px; padding: 10px 14px; cursor: pointer; font-weight: 700; }
          .primary { background: #2563eb; color: white; }
          .ghost { background: #e2e8f0; color: #0f172a; }
          @page { size: A4; margin: 0; }
          @media print {
            body { background: #fff; }
            .page { width: auto; min-height: auto; margin: 0; padding: 18px; box-shadow: none; }
            .actions { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="actions">
          <button class="ghost" onclick="window.close()">Close</button>
          <button class="primary" onclick="window.print()">Print / Save PDF</button>
        </div>
        <main class="page">
          <section class="top">
            <div>
              <h1>Invoice</h1>
              <div class="subject">Fee &amp; document charge summary for <strong>${text(invoiceSubject)}</strong></div>
            </div>
            <div class="meta">
              <div><strong>Invoice No:</strong> ${text(invoiceNo)}</div>
              <div><strong>Date:</strong> ${today()}</div>
              <div><strong>Students:</strong> ${rows.length}</div>
              ${rangeLabel ? `<div><strong>Period:</strong> ${text(rangeLabel)}</div>` : ''}
            </div>
          </section>

          <section class="billto">
            <div class="box">
              <h2>Bill To</h2>
              <strong>${text(center?.name || 'Center')}</strong>
              <div class="muted">${text(centerAddress(center) || '-')}</div>
            </div>
            <div class="box invoice-chip">
              <h2>Invoice Details</h2>
              <div><span>Total Students</span><b>${rows.length}</b></div>
              <div><span>Status</span><b>${Number(totals.grandAmountDue || 0) > 0 ? 'Due' : 'Paid'}</b></div>
            </div>
          </section>

          <table class="breakdown">
            <thead>
              <tr><th>Summary</th><th>Total</th><th>Paid</th><th>Due</th></tr>
            </thead>
            <tbody>
              <tr><td>Course Fee</td><td>${fmt(totals.totalAmount)}</td><td>${fmt(totals.amountPaid)}</td><td>${fmt(totals.amountDue)}</td></tr>
              <tr><td>Document Charges</td><td>${fmt(totals.docTotalAmount)}</td><td>${fmt(totals.docAmountPaid)}</td><td>${fmt(totals.docAmountDue)}</td></tr>
              <tr class="grand"><td>Grand Total</td><td>${fmt(totals.grandTotalAmount)}</td><td>${fmt(totals.grandAmountPaid)}</td><td>${fmt(totals.grandAmountDue)}</td></tr>
            </tbody>
          </table>

          <h3 class="section-title">Student Summary</h3>
          <table class="student-summary">
            <thead>
              <tr>
                <th style="width:26px">#</th>
                <th>Student</th>
                <th class="num" style="width:15%">Course Fee</th>
                <th class="num" style="width:16%">Doc Charges</th>
                <th class="num" style="width:15%">Grand Total</th>
                <th class="num" style="width:14%">Paid</th>
                <th class="num" style="width:15%">Balance Due</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          ${docDetailHtml}

          <section class="foot">
            <div class="signature">Authorized Signatory</div>
          </section>
        </main>
      </body>
    </html>
  `);
  win.document.close();
}

function CenterList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const cacheScope = `${user?.role || 'role'}-${user?.counselorId || user?.id || user?._id || 'user'}`;
  const [search, setSearch] = useState('');
  const fetchCenters = useCallback(() => accountLedgerApi.centers(), []);
  const { data: centers = [], loading, refreshing } = useInstantResource(
    `invoice-centers-${cacheScope}`,
    fetchCenters,
    { initialData: [], onError: () => toast.error('Failed to load invoice centers') }
  );

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
          <FileText className="h-5 w-5 text-blue-600" />
          Invoice
        </h1>
        {refreshing && <div className="text-xs text-muted-foreground">Updating...</div>}
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
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl border bg-slate-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          No centers found
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(center => (
            <Card key={center._id} className="cursor-pointer transition-colors hover:border-blue-300" onClick={() => navigate(`/invoice/${center._id}`)}>
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                    <h2 className="truncate font-semibold text-slate-800">{center.name || center.organisationName}</h2>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{centerAddress(center)}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 md:ml-auto md:w-[520px]">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-400">Students</div>
                    <div className="font-bold">{center.studentCount || 0}</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 px-3 py-2">
                    <div className="text-xs text-blue-600">Total (Fee + Docs)</div>
                    <div className="truncate font-bold text-blue-700">{fmt(center.grandTotalAmount ?? center.totalAmount)}</div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 px-3 py-2">
                    <div className="text-xs text-emerald-600">Paid (Fee + Docs)</div>
                    <div className="truncate font-bold text-emerald-700">{fmt(center.grandPaidAmount ?? center.paidAmount)}</div>
                  </div>
                  <div className="rounded-lg bg-amber-50 px-3 py-2">
                    <div className="text-xs text-amber-600">Due (Fee + Docs)</div>
                    <div className="truncate font-bold text-amber-700">{fmt(center.grandDueAmount ?? center.dueAmount)}</div>
                  </div>
                </div>
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-300 md:block" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CenterInvoice() {
  const navigate = useNavigate();
  const { centerId } = useParams();
  const { user } = useAuth();
  const cacheScope = `${user?.role || 'role'}-${user?.counselorId || user?.id || user?._id || 'user'}`;
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [dateBasis, setDateBasis] = useState('createdAt');
  const [dateMode, setDateMode] = useState('all');
  const [dateFilters, setDateFilters] = useState({
    month: '',
    fromMonth: '',
    toMonth: '',
    fromDate: '',
    toDate: '',
  });

  const fetchFast = useCallback(() => accountLedgerApi.centerStudents(centerId, { page: 1, limit: 50 }), [centerId]);
  const fetchFull = useCallback(() => accountLedgerApi.centerStudents(centerId), [centerId]);
  const { data, loading, refreshing } = useInstantResource(
    `invoice-center-${cacheScope}-${centerId}`,
    fetchFast,
    {
      fetchFull,
      deps: [centerId],
      onError: error => toast.error(error.message || 'Failed to load invoice students'),
    }
  );

  const rows = data?.rows || [];
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

  const selectedRows = useMemo(() => filteredRows.filter(row => selected.has(row.student?._id)), [filteredRows, selected]);
  const activeRows = selectedRows.length > 0 ? selectedRows : filteredRows;
  const footerTotals = useMemo(() => totalsFor(activeRows), [activeRows]);
  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every(row => selected.has(row.student?._id));

  function toggleStudent(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    setSelected(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) filteredRows.forEach(row => next.delete(row.student?._id));
      else filteredRows.forEach(row => next.add(row.student?._id));
      return next;
    });
  }

  function setDateFilter(key, value) {
    setDateFilters(prev => ({ ...prev, [key]: value }));
  }

  function resetDateFilters() {
    setDateMode('all');
    setDateFilters({ month: '', fromMonth: '', toMonth: '', fromDate: '', toDate: '' });
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
          <Button variant="outline" size="sm" onClick={() => navigate('/invoice')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{data?.center?.name || 'Center Invoice'}</h1>
            <div className="text-xs text-muted-foreground">{centerAddress(data?.center)}</div>
          </div>
        </div>
        <Button size="sm" onClick={() => openInvoice(data?.center, activeRows, activeRangeLabel)} disabled={filteredRows.length === 0}>
          <Printer className="mr-1 h-4 w-4" />
          {selectedRows.length ? 'Generate Selected' : 'Generate All'}
        </Button>
      </div>
      {refreshing && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Loading complete student list in background...
        </div>
      )}

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
        <div className="max-h-[62vh] w-full min-w-0 max-w-full overflow-auto">
          <table className="w-full min-w-[1720px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-20 bg-slate-100 text-slate-700">
              <tr>
                <th className="w-12 border-b border-r px-3 py-3" rowSpan="2">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} />
                </th>
                <th className="border-b border-r px-3 py-3" rowSpan="2">Student Name</th>
                <th className="border-b border-r px-3 py-3" rowSpan="2">Enrollment Number</th>
                <th className="border-b border-r px-3 py-3" rowSpan="2">Course</th>
                <th className="border-b border-r bg-indigo-50 px-3 py-2 text-center text-indigo-700" colSpan="3">Course Fee</th>
                <th className="border-b border-r bg-violet-50 px-3 py-2 text-center text-violet-700" colSpan="3">Document Charges</th>
                <th className="border-b border-r bg-slate-200 px-3 py-2 text-center text-slate-800" colSpan="3">Grand Total</th>
                <th className="border-b border-r px-3 py-3" rowSpan="2">{dateBasis === 'submittedAt' ? 'Submitted Date' : 'Added Date'}</th>
                <th className="border-b px-3 py-3 text-center" rowSpan="2">Invoice</th>
              </tr>
              <tr>
                <th className="border-b border-r bg-indigo-50 px-3 py-2 text-right text-indigo-700">Total</th>
                <th className="border-b border-r bg-indigo-50 px-3 py-2 text-right text-emerald-700">Paid</th>
                <th className="border-b border-r bg-indigo-50 px-3 py-2 text-right text-amber-700">Due</th>
                <th className="border-b border-r bg-violet-50 px-3 py-2 text-right text-violet-700">Total</th>
                <th className="border-b border-r bg-violet-50 px-3 py-2 text-right text-emerald-700">Paid</th>
                <th className="border-b border-r bg-violet-50 px-3 py-2 text-right text-amber-700">Due</th>
                <th className="border-b border-r bg-slate-100 px-3 py-2 text-right text-slate-800">Total</th>
                <th className="border-b border-r bg-slate-100 px-3 py-2 text-right text-emerald-700">Paid</th>
                <th className="border-b border-r bg-slate-100 px-3 py-2 text-right text-amber-700">Due</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={15}>No students found</td>
                </tr>
              ) : filteredRows.map(row => {
                const feeTotal = Number(row.totalAmount || 0);
                const feePaid = Number(row.amountPaid || 0);
                const feeDue = Number(row.amountDue || 0);
                const docTotal = Number(row.docTotalAmount || 0);
                const docPaid = Number(row.docAmountPaid || 0);
                const docDue = Number(row.docAmountDue || 0);
                return (
                <tr key={row.student?._id} className="hover:bg-slate-50">
                  <td className="border-b border-r px-3 py-3">
                    <input type="checkbox" checked={selected.has(row.student?._id)} onChange={() => toggleStudent(row.student?._id)} />
                  </td>
                  <td className="min-w-56 border-b border-r px-3 py-3">
                    <div className="font-semibold text-slate-800">{row.student?.name || ''}</div>
                  </td>
                  <td className="min-w-40 border-b border-r px-3 py-3 font-mono text-emerald-700">{row.student?.enrollmentNumber || ''}</td>
                  <td className="min-w-48 border-b border-r px-3 py-3 font-medium text-slate-700">{row.student?.courseName || ''}</td>
                  <td className="min-w-28 border-b border-r px-3 py-3 text-right font-semibold text-slate-800">{fmt(feeTotal)}</td>
                  <td className="min-w-28 border-b border-r px-3 py-3 text-right font-semibold text-emerald-700">{fmt(feePaid)}</td>
                  <td className="min-w-28 border-b border-r px-3 py-3 text-right font-semibold text-amber-700">{fmt(feeDue)}</td>
                  <td className="min-w-28 border-b border-r px-3 py-3 text-right font-semibold text-slate-800">{fmt(docTotal)}</td>
                  <td className="min-w-28 border-b border-r px-3 py-3 text-right font-semibold text-emerald-700">{fmt(docPaid)}</td>
                  <td className="min-w-28 border-b border-r px-3 py-3 text-right font-semibold text-amber-700">{fmt(docDue)}</td>
                  <td className="min-w-28 border-b border-r bg-slate-50 px-3 py-3 text-right font-bold text-slate-900">{fmt(feeTotal + docTotal)}</td>
                  <td className="min-w-28 border-b border-r bg-slate-50 px-3 py-3 text-right font-bold text-emerald-800">{fmt(feePaid + docPaid)}</td>
                  <td className="min-w-28 border-b border-r bg-slate-50 px-3 py-3 text-right font-bold text-amber-800">{fmt(feeDue + docDue)}</td>
                  <td className="min-w-32 border-b border-r px-3 py-3 text-slate-600">{fmtDate(dateValue(row, dateBasis)) || '-'}</td>
                  <td className="min-w-36 border-b px-3 py-3 text-center">
                    <Button size="sm" variant="outline" onClick={() => openInvoice(data?.center, [row], activeRangeLabel)}>
                      <Printer className="mr-1 h-4 w-4" />
                      Generate
                    </Button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{selectedRows.length ? 'Selected Students Total' : 'All Listed Students Total'}</div>
            <div className="text-xs text-muted-foreground">{activeRows.length} student{activeRows.length === 1 ? '' : 's'} included</div>
          </div>
          <Button onClick={() => openInvoice(data?.center, activeRows, activeRangeLabel)} disabled={activeRows.length === 0}>
            <Printer className="mr-1 h-4 w-4" />
            {selectedRows.length ? 'Generate Selected Invoice' : 'Generate All Invoice'}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Summary</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">Paid</th>
                <th className="px-3 py-2 text-right font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="px-3 py-2 font-medium text-indigo-600">Course Fee</td>
                <td className="px-3 py-2 text-right font-semibold">{fmt(footerTotals.totalAmount)}</td>
                <td className="px-3 py-2 text-right font-semibold text-emerald-700">{fmt(footerTotals.amountPaid)}</td>
                <td className="px-3 py-2 text-right font-semibold text-amber-700">{fmt(footerTotals.amountDue)}</td>
              </tr>
              <tr className="border-t">
                <td className="px-3 py-2 font-medium text-violet-600">Document Charges</td>
                <td className="px-3 py-2 text-right font-semibold">{fmt(footerTotals.docTotalAmount)}</td>
                <td className="px-3 py-2 text-right font-semibold text-emerald-700">{fmt(footerTotals.docAmountPaid)}</td>
                <td className="px-3 py-2 text-right font-semibold text-amber-700">{fmt(footerTotals.docAmountDue)}</td>
              </tr>
              <tr className="border-t bg-slate-50">
                <td className="px-3 py-2 font-bold text-slate-800">Grand Total</td>
                <td className="px-3 py-2 text-right font-bold text-slate-900">{fmt(footerTotals.grandTotalAmount)}</td>
                <td className="px-3 py-2 text-right font-bold text-emerald-800">{fmt(footerTotals.grandAmountPaid)}</td>
                <td className="px-3 py-2 text-right font-bold text-amber-800">{fmt(footerTotals.grandAmountDue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function InvoicePage() {
  const { centerId } = useParams();
  return centerId ? <CenterInvoice /> : <CenterList />;
}
