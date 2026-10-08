import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, ChevronRight, Download, FileSpreadsheet, History, IndianRupee, Loader2, Pencil, RotateCcw, Search, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { accountLedgerApi, paymentsApi } from '@/lib/api';
import { useInstantResource } from '@/lib/useInstantResource';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';

const fmt = value => `Rs ${(Number(value) || 0).toLocaleString('en-IN')}`;
const fmtDate = value => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
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

function CenterList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const cacheScope = `${user?.role || 'role'}-${user?.counselorId || user?.id || user?._id || 'user'}`;
  const [search, setSearch] = useState('');
  const fetchCenters = useCallback(() => accountLedgerApi.centers(), []);
  const { data: centers = [], loading, refreshing } = useInstantResource(
    `centre-billing-centers-${cacheScope}`,
    fetchCenters,
    { initialData: [], onError: () => toast.error('Failed to load account ledger centers') }
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
          <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
          Centre Billing
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-xl border bg-slate-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          No centers found
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(center => (
            <Card key={center._id} className="cursor-pointer transition-colors hover:border-indigo-300" onClick={() => navigate(`/centre-billing/${center._id}`)}>
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
                    <div className="text-xs text-amber-600">Due (Fee + Docs)</div>
                    <div className="font-bold text-amber-700">{fmt(center.grandDueAmount ?? center.dueAmount)}</div>
                  </div>
                  <div className="rounded-lg bg-indigo-50 px-3 py-2">
                    <div className="text-xs text-indigo-600">Total (Fee + Docs)</div>
                    <div className="font-bold text-indigo-700">{fmt(center.grandTotalAmount ?? center.totalAmount)}</div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 px-3 py-2">
                    <div className="text-xs text-emerald-600">Paid (Fee + Docs)</div>
                    <div className="font-bold text-emerald-700">{fmt(center.grandPaidAmount ?? center.paidAmount)}</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                  <span>Fee: <b className="text-slate-600">{fmt(center.totalAmount)}</b> ({fmt(center.dueAmount)} due)</span>
                  <span>Docs: <b className="text-violet-600">{fmt(center.docTotalAmount)}</b> ({fmt(center.docDueAmount)} due)</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CenterBilling() {
  const navigate = useNavigate();
  const { centerId } = useParams();
  const { user } = useAuth();
  const cacheScope = `${user?.role || 'role'}-${user?.counselorId || user?.id || user?._id || 'user'}`;
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
  const fetchFast = useCallback(() => accountLedgerApi.centerStudents(centerId, { page: 1, limit: 50 }), [centerId]);
  const fetchFull = useCallback(() => accountLedgerApi.centerStudents(centerId), [centerId]);

  const { data, loading, refreshing, reload } = useInstantResource(
    `centre-billing-center-${cacheScope}-${centerId}`,
    fetchFast,
    {
      fetchFull,
      deps: [centerId],
        onError: error => toast.error(error.message || 'Failed to load centre billing'),
    }
  );
  const canSettle = ['Admin', 'Accountant'].includes(user?.role);
  const [feeStudent, setFeeStudent] = useState(null);
  const [feeForm, setFeeForm] = useState({ totalFee: '', discount: '' });
  const [feeSaving, setFeeSaving] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settlements, setSettlements] = useState([]);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settleAllocations, setSettleAllocations] = useState({});
  const [editSettlement, setEditSettlement] = useState(null);
  const [reverseSettlement, setReverseSettlement] = useState(null);
  const [reverseReason, setReverseReason] = useState('');
  const [settlementActionSaving, setSettlementActionSaving] = useState(false);
  const [settleForm, setSettleForm] = useState({
    mode: 'UPI', utrRef: '', upiId: '', bankName: '', accountHolder: '', accountNumber: '', ifscCode: '',
    paidAt: new Date().toISOString().slice(0, 10), note: '',
  });

  const loadSettlements = useCallback(() => {
    if (!canSettle) return Promise.resolve();
    return accountLedgerApi.centerSettlements(centerId).then(setSettlements).catch(() => {});
  }, [canSettle, centerId]);

  useEffect(() => { loadSettlements(); }, [loadSettlements]);

  const rows = data?.rows || [];
  const maxTransactions = Math.max(1, Number(data?.maxTransactions || 0), ...rows.map(row => row.transactions?.length || 0));
  const maxDocTransactions = Math.max(0, Number(data?.maxDocTransactions || 0), ...rows.map(row => row.docTransactions?.length || 0));
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
    docTotalAmount: acc.docTotalAmount + Number(row.docTotalAmount || 0),
    docAmountPaid: acc.docAmountPaid + Number(row.docAmountPaid || 0),
    docAmountDue: acc.docAmountDue + Number(row.docAmountDue || 0),
  }), { totalAmount: 0, amountPaid: 0, amountDue: 0, docTotalAmount: 0, docAmountPaid: 0, docAmountDue: 0 }), [filteredRows]);
  const grand = {
    total: totals.totalAmount + totals.docTotalAmount,
    paid: totals.amountPaid + totals.docAmountPaid,
    due: totals.amountDue + totals.docAmountDue,
  };
  const selectedMonth = dateMode === 'month' ? dateFilters.month : '';
  const monthlyRows = selectedMonth ? rows.filter(row => matchesDateFilter(row, dateBasis, dateMode, dateFilters)) : [];
  const settlementRows = selectedMonth
    ? monthlyRows.filter(row => Number(row.totalAmount || 0) > 0 && Number(row.amountDue || 0) > 0)
    : [];
  const missingFeeRows = selectedMonth
    ? monthlyRows.filter(row => Number(row.totalAmount || 0) <= 0)
    : [];
  const settlementTotal = settlementRows.reduce((sum, row) => sum + Number(row.amountDue || 0), 0);
  const allocatedTotal = Object.values(settleAllocations).reduce((sum, amount) => sum + Number(amount || 0), 0);

  function applySettlementAmount(rawAmount) {
    const target = Math.max(0, Math.min(Number(rawAmount || 0), settlementTotal));
    let remaining = target;
    const next = {};
    settlementRows.forEach(row => {
      const amount = Math.min(Number(row.amountDue || 0), remaining);
      next[row.student._id] = amount ? String(amount) : '';
      remaining = Math.max(0, remaining - amount);
    });
    setSettlementAmount(String(target || ''));
    setSettleAllocations(next);
  }

  function openSettlementDialog() {
    applySettlementAmount(settlementTotal);
    setSettleOpen(true);
  }

  function updateAllocation(row, value) {
    const amount = Math.max(0, Math.min(Number(value || 0), Number(row.amountDue || 0)));
    const next = { ...settleAllocations, [row.student._id]: value === '' ? '' : String(amount) };
    setSettleAllocations(next);
    setSettlementAmount(String(Object.values(next).reduce((sum, item) => sum + Number(item || 0), 0)));
  }

  function openFeeEdit(row) {
    setFeeStudent(row);
    setFeeForm({ totalFee: String(row.grossTotalFee || ''), discount: String(row.discount || 0) });
  }

  async function saveCourseFee() {
    if (!feeStudent || Number(feeForm.totalFee) <= 0) return toast.error('Enter a valid course fee');
    setFeeSaving(true);
    try {
      await paymentsApi.upsertFee(feeStudent.student._id, {
        totalFee: Number(feeForm.totalFee),
        discount: Number(feeForm.discount || 0),
        notes: `Course fee updated from Centre Billing by ${user?.name || user?.role}`,
      });
      toast.success(`Course fee updated for ${feeStudent.student.name}`);
      setFeeStudent(null);
      await reload({ forceFast: true });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setFeeSaving(false);
    }
  }

  async function settleMonth() {
    if (!selectedMonth) return toast.error('Select a single month first');
    if (missingFeeRows.length) return toast.error(`Set course fee for ${missingFeeRows.length} student(s) first`);
    const allocations = settlementRows
      .map(row => ({ studentId: row.student._id, amount: Number(settleAllocations[row.student._id] || 0) }))
      .filter(row => row.amount > 0);
    if (!allocations.length) return toast.error('Enter an amount to settle');
    setSettling(true);
    try {
      await accountLedgerApi.createCenterSettlement(centerId, {
        billingMonth: selectedMonth,
        dateBasis,
        allocations,
        ...settleForm,
      });
      toast.success(`${fmt(allocatedTotal)} course fee settled for ${allocations.length} students`);
      setSettleOpen(false);
      setSettleForm(prev => ({ ...prev, utrRef: '', note: '' }));
      await Promise.all([reload({ forceFast: true }), loadSettlements()]);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSettling(false);
    }
  }

  function openSettlementEdit(settlement) {
    setEditSettlement({
      ...settlement,
      paidAt: settlement.paidAt ? new Date(settlement.paidAt).toISOString().slice(0, 10) : '',
      editReason: '',
    });
  }

  async function saveSettlementEdit() {
    if (!editSettlement?.editReason?.trim()) return toast.error('Edit reason is required');
    setSettlementActionSaving(true);
    try {
      await accountLedgerApi.updateCenterSettlement(centerId, editSettlement._id, editSettlement);
      toast.success('Settlement details updated');
      setEditSettlement(null);
      await Promise.all([reload({ forceFast: true }), loadSettlements()]);
    } catch (error) { toast.error(error.message); }
    finally { setSettlementActionSaving(false); }
  }

  async function reverseSelectedSettlement() {
    if (!reverseReason.trim()) return toast.error('Reversal reason is required');
    setSettlementActionSaving(true);
    try {
      await accountLedgerApi.reverseCenterSettlement(centerId, reverseSettlement._id, reverseReason);
      toast.success('Settlement reversed and student balances restored');
      setReverseSettlement(null);
      setReverseReason('');
      await Promise.all([reload({ forceFast: true }), loadSettlements()]);
    } catch (error) { toast.error(error.message); }
    finally { setSettlementActionSaving(false); }
  }

  function setDateFilter(key, value) {
    setDateFilters(prev => ({ ...prev, [key]: value }));
  }

  function resetDateFilters() {
    setDateMode('all');
    setDateFilters({ month: '', fromMonth: '', toMonth: '', fromDate: '', toDate: '' });
  }

  async function downloadExcel() {
    const { default: ExcelJS } = await import('exceljs');
    const txHeaders = [];
    for (let index = 0; index < maxTransactions; index += 1) {
      const no = index + 1;
      txHeaders.push(`Fee Payment ${no} Amount`, `Fee Payment ${no} Mode`, `Fee Payment ${no} UTR`, `Fee Payment ${no} Paid Date`, `Fee Payment ${no} Record Added Date`, `Fee Payment ${no} Verified Date`, `Fee Payment ${no} Paid To`, `Fee Payment ${no} Recorded By`, `Fee Payment ${no} Source`);
    }
    const docHeaders = [];
    for (let index = 0; index < maxDocTransactions; index += 1) {
      const no = index + 1;
      docHeaders.push(`Doc Payment ${no} Document`, `Doc Payment ${no} Amount`, `Doc Payment ${no} Mode`, `Doc Payment ${no} UTR`, `Doc Payment ${no} Paid Date`, `Doc Payment ${no} Verified Date`, `Doc Payment ${no} Status`, `Doc Payment ${no} Paid To`);
    }

    const dateHeader = dateBasis === 'submittedAt' ? 'Submitted Date' : 'Added Date';
    const headers = [
      'Student Name', 'Enrollment Number', 'Course', dateHeader,
      'Course Fee Total', 'Course Fee Paid', 'Course Fee Due',
      'Document Charge Total', 'Document Charge Paid', 'Document Charge Due',
      'Grand Total', 'Grand Paid', 'Grand Due',
      ...txHeaders, ...docHeaders,
    ];
    const exportRows = filteredRows.map(row => {
      const txValues = [];
      for (let index = 0; index < maxTransactions; index += 1) {
        const tx = row.transactions?.[index];
        txValues.push(tx?.amount || '', tx?.mode || '', tx?.utrRef || '', fmtDate(tx?.paidAt), fmtDate(tx?.recordAddedAt), fmtDate(tx?.verifiedAt), accountText(tx), tx?.recordedBy?.name || '', tx?.source === 'Center Monthly Settlement' ? `Monthly Settlement (${tx.settlementMonth})` : 'Manual');
      }
      const docValues = [];
      for (let index = 0; index < maxDocTransactions; index += 1) {
        const tx = row.docTransactions?.[index];
        docValues.push(tx?.documentName || '', tx?.amount || '', tx?.mode || '', tx?.utrRef || '', fmtDate(tx?.paidAt), fmtDate(tx?.verifiedAt), tx?.status || '', accountText(tx));
      }
      return [
        row.student?.name || '',
        row.student?.enrollmentNumber || '',
        row.student?.courseName || '',
        fmtDate(dateValue(row, dateBasis)),
        row.totalAmount || 0,
        row.amountPaid || 0,
        row.amountDue || 0,
        row.docTotalAmount || 0,
        row.docAmountPaid || 0,
        row.docAmountDue || 0,
        (Number(row.totalAmount || 0) + Number(row.docTotalAmount || 0)),
        (Number(row.amountPaid || 0) + Number(row.docAmountPaid || 0)),
        (Number(row.amountDue || 0) + Number(row.docAmountDue || 0)),
        ...txValues,
        ...docValues,
      ];
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Operation CRM';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Centre Billing', {
      views: [{ state: 'frozen', ySplit: 4 }],
      properties: { defaultRowHeight: 18 },
    });

    sheet.mergeCells(1, 1, 1, headers.length);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = `${data?.center?.name || 'Center'} - Centre Billing`;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 28;

    sheet.mergeCells(2, 1, 2, headers.length);
    const filterCell = sheet.getCell(2, 1);
    filterCell.value = `${activeRangeLabel}${search.trim() ? ` | Search: ${search.trim()}` : ''}`;
    filterCell.font = { italic: true, color: { argb: 'FF475569' } };
    filterCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };

    const headerRow = sheet.getRow(4);
    headerRow.values = headers;
    headerRow.height = 34;
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF1D4ED8' } },
        left: { style: 'thin', color: { argb: 'FF1D4ED8' } },
        bottom: { style: 'thin', color: { argb: 'FF1D4ED8' } },
        right: { style: 'thin', color: { argb: 'FF1D4ED8' } },
      };
    });

    exportRows.forEach((values, rowIndex) => {
      const excelRow = sheet.addRow(values);
      excelRow.alignment = { vertical: 'top', wrapText: true };
      excelRow.eachCell(cell => {
        cell.border = {
          top: { style: 'hair', color: { argb: 'FFCBD5E1' } },
          left: { style: 'hair', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'hair', color: { argb: 'FFCBD5E1' } },
          right: { style: 'hair', color: { argb: 'FFCBD5E1' } },
        };
        if (rowIndex % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      });
    });

    const amountColumns = new Set();
    headers.forEach((header, index) => {
      if (/Amount|Total|Paid|Due/.test(header) && !/Paid Date|Paid To/.test(header)) amountColumns.add(index + 1);
    });
    amountColumns.forEach(columnNumber => {
      sheet.getColumn(columnNumber).numFmt = '₹#,##0.00';
    });

    sheet.columns.forEach((column, index) => {
      const headerLength = String(headers[index] || '').length;
      let maxLength = Math.min(headerLength, 24);
      column.eachCell({ includeEmpty: false }, cell => {
        maxLength = Math.max(maxLength, Math.min(String(cell.value ?? '').length, 35));
      });
      column.width = Math.max(12, Math.min(maxLength + 2, 35));
    });
    sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `centre-billing-${data?.center?.name || 'center'}.xlsx`;
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
          <Button variant="outline" size="sm" onClick={() => navigate('/centre-billing')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{data?.center?.name || 'Center Billing'}</h1>
            <div className="text-xs text-muted-foreground">
              {[data?.center?.organisationName && data.center.organisationName !== data.center.name ? data.center.organisationName : '', data?.center?.city, data?.center?.state].filter(Boolean).join(' / ')}
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={downloadExcel} disabled={filteredRows.length === 0}>
          <Download className="mr-1 h-4 w-4" />
          Excel
        </Button>
      </div>
      {refreshing && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
          Loading complete sheet in background...
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Course Fee</div>
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
        <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-violet-500">Document Charges</div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <div className="min-w-0 rounded-lg border bg-violet-50 px-4 py-3">
            <div className="text-xs font-medium text-violet-600">Doc Total</div>
            <div className="truncate text-lg font-bold text-violet-700">{fmt(totals.docTotalAmount)}</div>
          </div>
          <div className="min-w-0 rounded-lg border bg-emerald-50 px-4 py-3">
            <div className="text-xs font-medium text-emerald-600">Doc Paid</div>
            <div className="truncate text-lg font-bold text-emerald-700">{fmt(totals.docAmountPaid)}</div>
          </div>
          <div className="min-w-0 rounded-lg border bg-amber-50 px-4 py-3">
            <div className="text-xs font-medium text-amber-600">Doc Due</div>
            <div className="truncate text-lg font-bold text-amber-700">{fmt(totals.docAmountDue)}</div>
          </div>
        </div>
        <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Grand Total (Fee + Documents)</div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <div className="min-w-0 rounded-lg border bg-slate-100 px-4 py-3">
            <div className="text-xs font-medium text-slate-600">Total</div>
            <div className="truncate text-lg font-bold text-slate-800">{fmt(grand.total)}</div>
          </div>
          <div className="min-w-0 rounded-lg border bg-emerald-100 px-4 py-3">
            <div className="text-xs font-medium text-emerald-700">Paid</div>
            <div className="truncate text-lg font-bold text-emerald-800">{fmt(grand.paid)}</div>
          </div>
          <div className="min-w-0 rounded-lg border bg-amber-100 px-4 py-3">
            <div className="text-xs font-medium text-amber-700">Due</div>
            <div className="truncate text-lg font-bold text-amber-800">{fmt(grand.due)}</div>
          </div>
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

      {canSettle && selectedMonth && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
          <div>
            <div className="font-semibold text-indigo-900">{selectedMonth} course-fee settlement</div>
            <div className="mt-0.5 text-xs text-indigo-700">
              {settlementRows.length} pending students · {fmt(settlementTotal)} due
              {missingFeeRows.length > 0 && <span className="ml-2 font-semibold text-amber-700">· {missingFeeRows.length} students need course fee</span>}
            </div>
          </div>
          <Button onClick={openSettlementDialog} disabled={!settlementRows.length || missingFeeRows.length > 0}>
            <IndianRupee className="mr-1 h-4 w-4" />
            Settle Month
          </Button>
        </div>
      )}

      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="max-h-[68vh] w-full min-w-0 max-w-full overflow-auto">
          <table className="border-collapse text-left text-xs" style={{ minWidth: `${1180 + (canSettle ? 90 : 0) + (maxTransactions * 980) + (maxDocTransactions * 900)}px` }}>
            <thead className="sticky top-0 z-20 bg-slate-100 text-slate-700">
              <tr>
                <th className="sticky left-0 z-30 border-b border-r bg-slate-100 px-3 py-2" rowSpan="2">Student Name</th>
                <th className="border-b border-r px-3 py-2" rowSpan="2">Enrollment Number</th>
                <th className="border-b border-r px-3 py-2" rowSpan="2">Course</th>
                <th className="border-b border-r bg-indigo-50 px-3 py-2 text-right text-indigo-700" rowSpan="2">Fee Total</th>
                <th className="border-b border-r bg-indigo-50 px-3 py-2 text-right text-indigo-700" rowSpan="2">Fee Paid</th>
                <th className="border-b border-r bg-indigo-50 px-3 py-2 text-right text-indigo-700" rowSpan="2">Fee Due</th>
                <th className="border-b border-r bg-violet-50 px-3 py-2 text-right text-violet-700" rowSpan="2">Doc Total</th>
                <th className="border-b border-r bg-violet-50 px-3 py-2 text-right text-violet-700" rowSpan="2">Doc Paid</th>
                <th className="border-b border-r bg-violet-50 px-3 py-2 text-right text-violet-700" rowSpan="2">Doc Due</th>
                <th className="border-b border-r bg-slate-200 px-3 py-2 text-right text-slate-800" rowSpan="2">Grand Due</th>
                {canSettle && <th className="border-b border-r px-3 py-2 text-center" rowSpan="2">Fee Action</th>}
                {Array.from({ length: maxTransactions }).map((_, index) => (
                  <th key={`fee-${index}`} className="border-b border-r bg-indigo-50 px-3 py-2 text-center font-bold text-indigo-700" colSpan="9">
                    Fee Payment {index + 1}
                  </th>
                ))}
                {Array.from({ length: maxDocTransactions }).map((_, index) => (
                  <th key={`doc-${index}`} className="border-b border-r bg-violet-50 px-3 py-2 text-center font-bold text-violet-700" colSpan="8">
                    Doc Payment {index + 1}
                  </th>
                ))}
              </tr>
              <tr>
                {Array.from({ length: maxTransactions }).flatMap((_, index) => (
                  ['Amount', 'Mode', 'UTR', 'Paid Date', 'Record Added Date', 'Verified Date', 'Paid To', 'Recorded By', 'Source'].map(label => (
                    <th key={`fee-${index}-${label}`} className="border-b border-r bg-indigo-50 px-3 py-2 font-semibold text-indigo-700">{label}</th>
                  ))
                ))}
                {Array.from({ length: maxDocTransactions }).flatMap((_, index) => (
                  ['Document', 'Amount', 'Mode', 'UTR', 'Paid Date', 'Verified Date', 'Status', 'Paid To'].map(label => (
                    <th key={`doc-${index}-${label}`} className="border-b border-r bg-violet-50 px-3 py-2 font-semibold text-violet-700">{label}</th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={10 + (canSettle ? 1 : 0) + (maxTransactions * 9) + (maxDocTransactions * 8)}>No students found</td>
                </tr>
              ) : filteredRows.map(row => (
                <tr key={row.student?._id} className="hover:bg-slate-50">
                  <td className="sticky left-0 z-10 min-w-56 border-b border-r bg-white px-3 py-2 font-semibold text-slate-800">{row.student?.name || ''}</td>
                  <td className="min-w-40 border-b border-r px-3 py-2 font-mono text-emerald-700">{row.student?.enrollmentNumber || ''}</td>
                  <td className="min-w-48 border-b border-r px-3 py-2 font-medium text-slate-700">{row.student?.courseName || ''}</td>
                  <td className="min-w-28 border-b border-r px-3 py-2 text-right font-semibold">{fmt(row.totalAmount)}</td>
                  <td className="min-w-28 border-b border-r px-3 py-2 text-right font-semibold text-emerald-700">{fmt(row.amountPaid)}</td>
                  <td className="min-w-28 border-b border-r px-3 py-2 text-right font-semibold text-amber-700">{fmt(row.amountDue)}</td>
                  <td className="min-w-28 border-b border-r px-3 py-2 text-right font-semibold text-violet-700">{fmt(row.docTotalAmount)}</td>
                  <td className="min-w-28 border-b border-r px-3 py-2 text-right font-semibold text-emerald-700">{fmt(row.docAmountPaid)}</td>
                  <td className="min-w-28 border-b border-r px-3 py-2 text-right font-semibold text-amber-700">{fmt(row.docAmountDue)}</td>
                  <td className="min-w-28 border-b border-r bg-slate-50 px-3 py-2 text-right font-bold text-slate-800">{fmt(Number(row.amountDue || 0) + Number(row.docAmountDue || 0))}</td>
                  {canSettle && (
                    <td className="min-w-24 border-b border-r px-2 py-2 text-center">
                      <button type="button" onClick={() => openFeeEdit(row)} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800" title="Edit course fee">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    </td>
                  )}
                  {Array.from({ length: maxTransactions }).flatMap((_, index) => {
                    const tx = row.transactions?.[index];
                    return [
                      <td key={`fee-${index}-amount`} className="min-w-28 border-b border-r px-3 py-2 text-right font-semibold text-emerald-700">{tx ? fmt(tx.amount) : ''}</td>,
                      <td key={`fee-${index}-mode`} className="min-w-28 border-b border-r px-3 py-2">{tx?.mode || ''}</td>,
                      <td key={`fee-${index}-utr`} className="min-w-40 border-b border-r px-3 py-2 font-mono">{tx?.utrRef || ''}</td>,
                      <td key={`fee-${index}-paid`} className="min-w-28 border-b border-r px-3 py-2">{fmtDate(tx?.paidAt)}</td>,
                      <td key={`fee-${index}-added`} className="min-w-28 border-b border-r px-3 py-2">{fmtDate(tx?.recordAddedAt)}</td>,
                      <td key={`fee-${index}-verified`} className="min-w-28 border-b border-r px-3 py-2">{fmtDate(tx?.verifiedAt)}</td>,
                      <td key={`fee-${index}-account`} className="min-w-56 border-b border-r px-3 py-2">{accountText(tx)}</td>,
                      <td key={`fee-${index}-recorded`} className="min-w-36 border-b border-r px-3 py-2">{tx?.recordedBy?.name || ''}{tx?.recordedBy?.role ? <span className="block text-[10px] text-slate-400">{tx.recordedBy.role}</span> : null}</td>,
                      <td key={`fee-${index}-source`} className="min-w-44 border-b border-r px-3 py-2">{tx ? (tx.source === 'Center Monthly Settlement' ? <span className="font-semibold text-indigo-700">Monthly Settlement {tx.settlementMonth}</span> : 'Manual') : ''}</td>,
                    ];
                  })}
                  {Array.from({ length: maxDocTransactions }).flatMap((_, index) => {
                    const tx = row.docTransactions?.[index];
                    return [
                      <td key={`doc-${index}-name`} className="min-w-44 border-b border-r px-3 py-2 font-medium text-violet-800">{tx?.documentName || ''}{tx?.requestType ? <span className="ml-1 text-[10px] text-slate-400">({tx.requestType})</span> : null}</td>,
                      <td key={`doc-${index}-amount`} className="min-w-28 border-b border-r px-3 py-2 text-right font-semibold text-emerald-700">{tx ? fmt(tx.amount) : ''}</td>,
                      <td key={`doc-${index}-mode`} className="min-w-28 border-b border-r px-3 py-2">{tx?.mode || ''}</td>,
                      <td key={`doc-${index}-utr`} className="min-w-40 border-b border-r px-3 py-2 font-mono">{tx?.utrRef || ''}</td>,
                      <td key={`doc-${index}-paid`} className="min-w-28 border-b border-r px-3 py-2">{fmtDate(tx?.paidAt)}</td>,
                      <td key={`doc-${index}-verified`} className="min-w-28 border-b border-r px-3 py-2">{fmtDate(tx?.verifiedAt)}</td>,
                      <td key={`doc-${index}-status`} className="min-w-24 border-b border-r px-3 py-2">{tx ? (tx.verified ? <span className="font-semibold text-emerald-600">Verified</span> : <span className="font-semibold text-amber-600">Pending</span>) : ''}</td>,
                      <td key={`doc-${index}-account`} className="min-w-56 border-b border-r px-3 py-2">{accountText(tx)}</td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canSettle && settlements.length > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" />Monthly Course-Fee Settlement History</h2>
          <div className="space-y-2">
            {settlements.map(settlement => (
              <div key={settlement._id} className={`grid gap-2 rounded-md border px-3 py-2 text-sm md:grid-cols-[100px_1fr_1fr_1fr_auto] ${settlement.status === 'Reversed' ? 'bg-red-50/60' : ''}`}>
                <div className="font-semibold text-indigo-700">{settlement.billingMonth}<div className={`mt-1 text-[10px] font-bold uppercase ${settlement.status === 'Reversed' ? 'text-red-600' : 'text-emerald-600'}`}>{settlement.status || 'Completed'}</div></div>
                <div><span className="text-xs text-muted-foreground">Amount</span><div className={`font-semibold ${settlement.status === 'Reversed' ? 'text-red-700 line-through' : 'text-emerald-700'}`}>{fmt(settlement.amount)}</div></div>
                <div><span className="text-xs text-muted-foreground">Payment</span><div>{settlement.mode}{settlement.utrRef ? ` · ${settlement.utrRef}` : ''}</div><div className="text-xs text-muted-foreground">{fmtDate(settlement.paidAt)} · {settlement.studentCount} students</div></div>
                <div><span className="text-xs text-muted-foreground">Recorded / Settled By</span><div className="font-medium">{settlement.recordedBy?.name || 'Unknown'} <span className="text-xs text-muted-foreground">({settlement.recordedBy?.role || ''})</span></div><div className="text-xs text-muted-foreground">{fmtDate(settlement.createdAt)}</div>{settlement.lastEditedBy && <div className="mt-1 text-xs text-amber-700">Edited by {settlement.lastEditedBy.name}: {settlement.editReason}</div>}{settlement.reversedBy && <div className="mt-1 text-xs font-medium text-red-700">Reversed by {settlement.reversedBy.name}: {settlement.reversalReason}</div>}</div>
                <div className="flex items-center gap-1">{settlement.status !== 'Reversed' && <><Button size="sm" variant="outline" onClick={() => openSettlementEdit(settlement)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button><Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => { setReverseSettlement(settlement); setReverseReason(''); }}><RotateCcw className="mr-1 h-3.5 w-3.5" />Reverse</Button></>}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={Boolean(feeStudent)} onOpenChange={open => !open && setFeeStudent(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Course Fee</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">{feeStudent?.student?.name}</div>
            <div><Label>Total Course Fee</Label><Input className="mt-1" type="number" min="0" value={feeForm.totalFee} onChange={event => setFeeForm(prev => ({ ...prev, totalFee: event.target.value }))} /></div>
            <div><Label>Discount</Label><Input className="mt-1" type="number" min="0" value={feeForm.discount} onChange={event => setFeeForm(prev => ({ ...prev, discount: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setFeeStudent(null)}>Cancel</Button><Button onClick={saveCourseFee} disabled={feeSaving}>{feeSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save Fee</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Settle {selectedMonth} Course Fee</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-md border bg-indigo-50 p-3 text-sm"><div><div className="text-xs text-indigo-600">Pending Students</div><div className="font-bold">{settlementRows.length}</div></div><div><div className="text-xs text-indigo-600">Month Total Due</div><div className="font-bold text-indigo-800">{fmt(settlementTotal)}</div></div></div>
            <div><Label>Payment Amount</Label><Input className="mt-1" type="number" min="0" max={settlementTotal} value={settlementAmount} onChange={event => applySettlementAmount(event.target.value)} /><div className="mt-1 text-xs text-muted-foreground">Allocated: {fmt(allocatedTotal)} · Remaining month due: {fmt(Math.max(0, settlementTotal - allocatedTotal))}</div></div>
            <div className="max-h-52 overflow-y-auto rounded-md border">
              {settlementRows.map(row => <div key={row.student._id} className="grid grid-cols-[1fr_110px] items-center gap-3 border-b px-3 py-2 last:border-0"><div className="min-w-0"><div className="truncate text-sm font-medium">{row.student.name}</div><div className="text-xs text-muted-foreground">Due: {fmt(row.amountDue)}</div></div><Input type="number" min="0" max={row.amountDue} value={settleAllocations[row.student._id] ?? ''} onChange={event => updateAllocation(row, event.target.value)} /></div>)}
            </div>
            <div><Label>Payment Mode</Label><select className={`${inputClass} mt-1 w-full`} value={settleForm.mode} onChange={event => setSettleForm(prev => ({ ...prev, mode: event.target.value }))}><option>UPI</option><option>Bank Transfer</option></select></div>
            <div><Label>UTR / Reference</Label><Input className="mt-1" value={settleForm.utrRef} onChange={event => setSettleForm(prev => ({ ...prev, utrRef: event.target.value }))} /></div>
            {settleForm.mode === 'UPI' ? <div><Label>UPI ID</Label><Input className="mt-1" value={settleForm.upiId} onChange={event => setSettleForm(prev => ({ ...prev, upiId: event.target.value }))} /></div> : <div className="grid gap-3 sm:grid-cols-2"><div><Label>Bank</Label><Input className="mt-1" value={settleForm.bankName} onChange={event => setSettleForm(prev => ({ ...prev, bankName: event.target.value }))} /></div><div><Label>Account Holder</Label><Input className="mt-1" value={settleForm.accountHolder} onChange={event => setSettleForm(prev => ({ ...prev, accountHolder: event.target.value }))} /></div><div><Label>Account Number</Label><Input className="mt-1" value={settleForm.accountNumber} onChange={event => setSettleForm(prev => ({ ...prev, accountNumber: event.target.value }))} /></div><div><Label>IFSC</Label><Input className="mt-1" value={settleForm.ifscCode} onChange={event => setSettleForm(prev => ({ ...prev, ifscCode: event.target.value }))} /></div></div>}
            <div><Label>Payment Date</Label><Input className="mt-1" type="date" value={settleForm.paidAt} onChange={event => setSettleForm(prev => ({ ...prev, paidAt: event.target.value }))} /></div>
            <div><Label>Note</Label><Input className="mt-1" value={settleForm.note} onChange={event => setSettleForm(prev => ({ ...prev, note: event.target.value }))} placeholder="Optional settlement note" /></div>
            <p className="text-xs text-muted-foreground">Only allocations above zero create verified course-fee payments. Document charges are not included.</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSettleOpen(false)}>Cancel</Button><Button onClick={settleMonth} disabled={settling}>{settling && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Confirm Settlement</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editSettlement)} onOpenChange={open => !open && setEditSettlement(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Settlement Details</DialogTitle></DialogHeader>
          {editSettlement && <div className="space-y-4">
            <div className="rounded-md border bg-slate-50 p-3 text-sm"><b>{editSettlement.billingMonth}</b> · {fmt(editSettlement.amount)} · {editSettlement.studentCount} students</div>
            <div><Label>Payment Mode</Label><select className={`${inputClass} mt-1 w-full`} value={editSettlement.mode} onChange={event => setEditSettlement(prev => ({ ...prev, mode: event.target.value }))}><option>UPI</option><option>Bank Transfer</option></select></div>
            <div><Label>UTR / Reference</Label><Input className="mt-1" value={editSettlement.utrRef || ''} onChange={event => setEditSettlement(prev => ({ ...prev, utrRef: event.target.value }))} /></div>
            {editSettlement.mode === 'UPI' ? <div><Label>UPI ID</Label><Input className="mt-1" value={editSettlement.upiId || ''} onChange={event => setEditSettlement(prev => ({ ...prev, upiId: event.target.value }))} /></div> : <div className="grid gap-3 sm:grid-cols-2"><div><Label>Bank</Label><Input className="mt-1" value={editSettlement.bankName || ''} onChange={event => setEditSettlement(prev => ({ ...prev, bankName: event.target.value }))} /></div><div><Label>Account Holder</Label><Input className="mt-1" value={editSettlement.accountHolder || ''} onChange={event => setEditSettlement(prev => ({ ...prev, accountHolder: event.target.value }))} /></div><div><Label>Account Number</Label><Input className="mt-1" value={editSettlement.accountNumber || ''} onChange={event => setEditSettlement(prev => ({ ...prev, accountNumber: event.target.value }))} /></div><div><Label>IFSC</Label><Input className="mt-1" value={editSettlement.ifscCode || ''} onChange={event => setEditSettlement(prev => ({ ...prev, ifscCode: event.target.value }))} /></div></div>}
            <div><Label>Payment Date</Label><Input className="mt-1" type="date" value={editSettlement.paidAt || ''} onChange={event => setEditSettlement(prev => ({ ...prev, paidAt: event.target.value }))} /></div>
            <div><Label>Note</Label><Input className="mt-1" value={editSettlement.note || ''} onChange={event => setEditSettlement(prev => ({ ...prev, note: event.target.value }))} /></div>
            <div><Label>Edit Reason *</Label><Input className="mt-1" value={editSettlement.editReason || ''} onChange={event => setEditSettlement(prev => ({ ...prev, editReason: event.target.value }))} placeholder="Why are these details being changed?" /></div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setEditSettlement(null)}>Cancel</Button><Button onClick={saveSettlementEdit} disabled={settlementActionSaving}>{settlementActionSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save Changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reverseSettlement)} onOpenChange={open => !open && setReverseSettlement(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reverse Monthly Settlement</DialogTitle></DialogHeader>
          <div className="space-y-4"><div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">This will remove {fmt(reverseSettlement?.amount)} allocated payments from {reverseSettlement?.studentCount} students and restore their course-fee due balances.</div><div><Label>Reversal Reason *</Label><Input className="mt-1" value={reverseReason} onChange={event => setReverseReason(event.target.value)} placeholder="Reason for reversing this settlement" /></div></div>
          <DialogFooter><Button variant="outline" onClick={() => setReverseSettlement(null)}>Cancel</Button><Button className="bg-red-600 hover:bg-red-700" onClick={reverseSelectedSettlement} disabled={settlementActionSaving}>{settlementActionSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Confirm Reversal</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CentreBillingPage() {
  const { centerId } = useParams();
  return centerId ? <CenterBilling /> : <CenterList />;
}
