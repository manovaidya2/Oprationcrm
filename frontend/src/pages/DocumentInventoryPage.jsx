import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, Download, FileText, Loader2, PackageCheck, Plus, Search, Send, Truck, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { documentInventoryApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const RECEIVED_STATUSES = new Set([
  'Dispatch_Received', 'Scanned', 'Accountant_Received', 'Counselor_Received',
  'Center_Notified', 'Payment_Submitted', 'Payment_Verified', 'Dispatched', 'Delivered',
]);

function docState(doc) {
  if (doc.status === 'Delivered') return { label: 'Received by Center', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 };
  if (doc.status === 'Dispatched') return { label: 'Dispatched to Center', tone: 'bg-blue-50 text-blue-700 border-blue-200', icon: Truck };
  if (RECEIVED_STATUSES.has(doc.status)) return { label: 'Received from University', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 };
  if (['Sent_To_University', 'University_Dispatched'].includes(doc.status)) return { label: 'Requested', tone: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock };
  if (doc.catalog) return { label: 'Not Requested', tone: 'bg-slate-50 text-slate-600 border-slate-200', icon: FileText };
  return { label: doc.status?.replace(/_/g, ' ') || 'Pending', tone: 'bg-slate-50 text-slate-600 border-slate-200', icon: FileText };
}

const todayInput = () => new Date().toISOString().slice(0, 10);
const fmtDate = value => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const latestHistory = (doc, status) => [...(doc.statusHistory || [])].reverse().find(h => h.status === status);

function docLabels(doc) {
  const labels = [];
  const requested = latestHistory(doc, 'Sent_To_University');
  const urgent = latestHistory(doc, 'Urgent_Requested');
  const received = latestHistory(doc, 'Dispatch_Received');
  const dispatched = latestHistory(doc, 'Dispatched');
  const delivered = latestHistory(doc, 'Delivered');

  if (requested) labels.push({ key: 'requested', icon: Send, text: `Requested${requested.at ? `: ${fmtDate(requested.at)}` : ''}`, tone: 'bg-amber-50 text-amber-700 border-amber-200' });
  if (urgent) labels.push({ key: 'urgent', icon: AlertTriangle, text: `Urgent Request${urgent.at ? `: ${fmtDate(urgent.at)}` : ''}`, tone: 'bg-red-50 text-red-700 border-red-200' });
  if (received) labels.push({ key: 'received', icon: CheckCircle2, text: `Received from University${received.at ? `: ${fmtDate(received.at)}` : ''}`, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' });
  if (dispatched) labels.push({ key: 'dispatched', icon: Truck, text: `Dispatched to Center${dispatched.at ? `: ${fmtDate(dispatched.at)}` : ''}`, tone: 'bg-blue-50 text-blue-700 border-blue-200' });
  if (delivered) labels.push({ key: 'delivered', icon: CheckCircle2, text: `Received by Center${delivered.at ? `: ${fmtDate(delivered.at)}` : ''}`, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' });

  return labels;
}

function showStateBadge(doc, labels) {
  if (doc.catalog) return true;
  if (['Sent_To_University', 'University_Dispatched'].includes(doc.status) && labels.some(l => l.key === 'requested')) return false;
  if (doc.status === 'Dispatched' && labels.some(l => l.key === 'dispatched')) return false;
  if (doc.status === 'Delivered' && labels.some(l => l.key === 'delivered')) return false;
  if (RECEIVED_STATUSES.has(doc.status) && labels.some(l => l.key === 'received')) return false;
  return true;
}

function isPendingDoc(doc) {
  return doc.catalog || doc.status === 'Not_Requested' || (!RECEIVED_STATUSES.has(doc.status) && doc.status !== 'Dispatched' && doc.status !== 'Delivered');
}

function docActionDate(doc, type) {
  const statusMap = {
    requested: 'Sent_To_University',
    urgent: 'Urgent_Requested',
    received_university: 'Dispatch_Received',
    dispatched: 'Dispatched',
    center_received: 'Delivered',
  };
  return latestHistory(doc, statusMap[type])?.at || '';
}

function matchesDocFilter(doc, type) {
  if (type === 'all') return true;
  if (type === 'requested') return ['Sent_To_University', 'University_Dispatched'].includes(doc.status);
  if (type === 'urgent') return Boolean(latestHistory(doc, 'Urgent_Requested'));
  if (type === 'pending') return isPendingDoc(doc);
  if (type === 'received_university') return Boolean(latestHistory(doc, 'Dispatch_Received')) || RECEIVED_STATUSES.has(doc.status);
  if (type === 'ready_dispatch') return doc.status === 'Payment_Verified';
  if (type === 'dispatched') return doc.status === 'Dispatched' || Boolean(latestHistory(doc, 'Dispatched'));
  if (type === 'center_received') return doc.status === 'Delivered' || Boolean(latestHistory(doc, 'Delivered'));
  return true;
}

export default function DocumentInventoryPage() {
  const { user } = useAuth();
  const canReceive = ['Admin', 'Dispatch'].includes(user?.role);
  const canRequest = ['Admin', 'Accountant', 'Counselor', 'Dispatch'].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addTarget, setAddTarget] = useState(null);
  const [names, setNames] = useState('');
  const [received, setReceived] = useState(false);
  const [addReceivedDate, setAddReceivedDate] = useState(todayInput());
  const [saving, setSaving] = useState(false);
  const [openStudentId, setOpenStudentId] = useState('');
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [actionTarget, setActionTarget] = useState(null);
  const [actionDate, setActionDate] = useState(todayInput());
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvStudentSearch, setCsvStudentSearch] = useState('');
  const [csvFilters, setCsvFilters] = useState({
    scope: 'all',
    studentId: 'all',
    docName: 'all',
    statusType: 'all',
    dateType: 'any',
    from: '',
    to: '',
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setRows(await documentInventoryApi.list());
    } catch (e) {
      toast.error(e.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.toLowerCase().trim();
  const filtered = useMemo(() => rows.filter(({ student, docs, requestedDocs = [] }) => {
    if (!q) return true;
    return [
      student?.name,
      student?.enrollmentNumber,
      student?.courseName,
      student?.center?.name,
      student?.university?.name,
      ...docs.map(d => d.name),
      ...requestedDocs.map(d => d.name),
    ].some(v => String(v || '').toLowerCase().includes(q));
  }), [rows, q]);

  const inventoryDocRows = useMemo(() => filtered.flatMap(({ student, docs, requestedDocs = [] }) => (
    [...docs, ...requestedDocs].map(doc => ({ student, doc }))
  )), [filtered]);

  const selectedInventoryDocs = useMemo(
    () => inventoryDocRows.filter(x => selectedDocIds.includes(String(x.doc._id))),
    [inventoryDocRows, selectedDocIds]
  );

  const csvStudentOptions = useMemo(() => filtered.map(({ student }) => student), [filtered]);
  const csvStudentQuery = csvStudentSearch.toLowerCase().trim();
  const visibleCsvStudentOptions = useMemo(() => {
    if (!csvStudentQuery) return csvStudentOptions;
    return csvStudentOptions.filter(student => [
      student.name,
      student.enrollmentNumber,
      student.center?.name,
      student.courseName,
    ].some(value => String(value || '').toLowerCase().includes(csvStudentQuery)));
  }, [csvStudentOptions, csvStudentQuery]);

  const csvDocNameOptions = useMemo(() => {
    const names = new Set();
    inventoryDocRows.forEach(({ doc }) => { if (doc.name) names.add(doc.name); });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [inventoryDocRows]);

  const csvStatusOptions = [
    { value: 'all', label: 'All document types/status' },
    { value: 'requested', label: 'Requested from University' },
    { value: 'urgent', label: 'Urgent Request' },
    { value: 'pending', label: 'Pending Docs' },
    { value: 'received_university', label: 'Received from University' },
    { value: 'ready_dispatch', label: 'Ready to Dispatch' },
    { value: 'dispatched', label: 'Dispatched to Center' },
    { value: 'center_received', label: 'Received by Center' },
  ];

  const csvDateOptions = [
    { value: 'any', label: 'No date filter' },
    { value: 'requested', label: 'Requested date' },
    { value: 'urgent', label: 'Urgent request date' },
    { value: 'received_university', label: 'Received from university date' },
    { value: 'dispatched', label: 'Dispatched to center date' },
    { value: 'center_received', label: 'Received by center date' },
  ];

  const csvFilteredDocs = useMemo(() => {
    let list = csvFilters.scope === 'selected' ? selectedInventoryDocs : inventoryDocRows;
    if (csvFilters.studentId !== 'all') {
      list = list.filter(({ student }) => String(student._id) === csvFilters.studentId);
    }
    if (csvFilters.docName !== 'all') {
      list = list.filter(({ doc }) => String(doc.name || '').toLowerCase() === csvFilters.docName.toLowerCase());
    }
    if (csvFilters.statusType !== 'all') {
      list = list.filter(({ doc }) => matchesDocFilter(doc, csvFilters.statusType));
    }
    if (csvFilters.dateType !== 'any') {
      const from = csvFilters.from ? new Date(`${csvFilters.from}T00:00:00`) : null;
      const to = csvFilters.to ? new Date(`${csvFilters.to}T23:59:59`) : null;
      list = list.filter(({ doc }) => {
        const dateValue = docActionDate(doc, csvFilters.dateType);
        if (!dateValue) return false;
        const date = new Date(dateValue);
        if (from && date < from) return false;
        if (to && date > to) return false;
        return true;
      });
    }
    return list;
  }, [csvFilters, inventoryDocRows, selectedInventoryDocs]);

  function toggleDocSelection(docId) {
    const id = String(docId);
    setSelectedDocIds(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  }

  function setCsv(field, value) {
    setCsvFilters(prev => ({ ...prev, [field]: value }));
  }

  function resetCsvFilters() {
    setCsvFilters({ scope: 'all', studentId: 'all', docName: 'all', statusType: 'all', dateType: 'any', from: '', to: '' });
    setCsvStudentSearch('');
  }

  function downloadInventoryCsv() {
    const list = csvFilteredDocs;
    if (csvFilters.scope === 'selected' && selectedInventoryDocs.length === 0) {
      return toast.error('Select documents first or change scope to all visible documents');
    }
    if (!list.length) return toast.error('No documents match selected filters');
    const statusLabel = csvStatusOptions.find(o => o.value === csvFilters.statusType)?.label || 'All';
    const grouped = new Map();
    list.forEach(({ student, doc }) => {
      const key = String(student._id);
      if (!grouped.has(key)) grouped.set(key, { student, docs: [], statuses: [], dates: [] });
      const item = grouped.get(key);
      item.docs.push(doc.name);
      item.statuses.push(doc.catalog ? 'Pending' : docState(doc).label);
      const labels = docLabels(doc).map(l => l.text).join(' | ');
      item.dates.push(labels || '');
    });
    const rows = [...grouped.values()].map(({ student, docs, statuses, dates }) => ({
      'Student Name': student.name || '',
      'Enrollment Number': student.enrollmentNumber || '',
      'Center': student.center?.name || '',
      'University': student.university?.name || '',
      'Course': student.courseName || '',
      'Filter': statusLabel,
      'Documents': docs.join(' | '),
      'Document Statuses': statuses.join(' | '),
      'Action Dates': dates.filter(Boolean).join(' || '),
      'Document Count': docs.length,
    }));
    const headers = Object.keys(rows[0]);
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeStatus = statusLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'inventory';
    a.download = `inventory_${safeStatus}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} students`);
    setCsvOpen(false);
  }

  async function addDocs() {
    const list = names.split('\n').map(v => v.trim()).filter(Boolean);
    if (list.length === 0) return toast.error('Document name required');
    setSaving(true);
    try {
      await documentInventoryApi.addDocs(addTarget.student._id, {
        names: list,
        received: canReceive && received,
        receivedDate: canReceive && received ? addReceivedDate : undefined,
      });
      toast.success('Inventory updated');
      setAddTarget(null); setNames(''); setReceived(false); setAddReceivedDate(todayInput()); load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  function openAction(type, doc, studentId) {
    setActionTarget({ type, doc, studentId });
    setActionDate(todayInput());
  }

  async function confirmAction() {
    if (!actionTarget) return;
    const { type, doc, studentId } = actionTarget;
    setSaving(true);
    try {
      if (type === 'receive') {
        if (doc.catalog) {
          await documentInventoryApi.addDocs(studentId, { names: [doc.name], received: true, receivedDate: actionDate });
        } else {
          await documentInventoryApi.markReceived(doc._id, { receivedDate: actionDate });
        }
        toast.success('Marked received');
      } else if (type === 'request') {
        if (doc.catalog) {
          await documentInventoryApi.addDocs(studentId, { names: [doc.name], received: false, requestedDate: actionDate });
        } else {
          await documentInventoryApi.requestDoc(doc._id, { requestedDate: actionDate });
        }
        toast.success('Request sent to university');
      } else if (type === 'urgent') {
        if (doc.catalog) {
          await documentInventoryApi.addDocs(studentId, { names: [doc.name], received: false, urgent: true, requestedDate: actionDate, urgentDate: actionDate });
        } else {
          await documentInventoryApi.urgentDoc(doc._id, { urgentDate: actionDate, requestedDate: actionDate });
        }
        toast.success('Urgent request sent');
      }
      setActionTarget(null);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  function markReceived(doc, studentId) {
    openAction('receive', doc, studentId);
  }

  function requestDoc(doc, studentId) {
    openAction('request', doc, studentId);
  }

  function urgentRequestDoc(doc, studentId) {
    openAction('urgent', doc, studentId);
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <PackageCheck className="h-5 w-5"/>Document Inventory ({filtered.length}/{rows.length})
          </h1>
          <p className="text-sm text-muted-foreground">Enrolled students and university document receipt tracking</p>
        </div>
        {['Admin', 'Dispatch', 'University'].includes(user?.role) && (
          <Button variant="outline" onClick={() => setCsvOpen(true)} disabled={inventoryDocRows.length === 0} className="gap-2">
            <Download className="h-4 w-4"/>CSV {selectedInventoryDocs.length ? `(${selectedInventoryDocs.length} selected)` : ''}
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
        <Input value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-9" placeholder="Search student, enrollment, center, course, document..."/>
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4"/></button>}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-14 border border-dashed rounded-lg text-muted-foreground">No inventory records found</div>
      ) : filtered.map(row => {
        const { student, docs, requestedDocs = [] } = row;
        const receivedCount = docs.filter(d => RECEIVED_STATUSES.has(d.status)).length;
        const requestedCount = requestedDocs.length;
        const isOpen = openStudentId === student._id;
        return (
          <Card key={student._id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3 cursor-pointer" onClick={() => setOpenStudentId(isOpen ? '' : student._id)}>
                <div className="flex min-w-0 flex-1 gap-2">
                  <div className="mt-0.5 text-muted-foreground">
                    {isOpen ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>}
                  </div>
                  <div className="min-w-0">
                  <div className="font-semibold text-base truncate">{student.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {student.center?.name || 'No center'} · {student.courseName || 'No course'}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {student.enrollmentNumber && <span className="text-xs font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-2 py-0.5">{student.enrollmentNumber}</span>}
                    {student.university?.name && <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded px-2 py-0.5">{student.university.name}</span>}
                    <span className="text-xs bg-slate-50 text-slate-600 border rounded px-2 py-0.5">{receivedCount}/{docs.length} received</span>
                    {requestedCount > 0 && <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5">{requestedCount} requested</span>}
                  </div>
                </div>
                </div>
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => setOpenStudentId(isOpen ? '' : student._id)}>
                    {isOpen ? 'Hide Docs' : 'View Docs'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAddTarget(row)} className="gap-1">
                    <Plus className="h-3.5 w-3.5"/>Add Docs
                  </Button>
                </div>
              </div>

              {isOpen && (
                <>
              {docs.length === 0 ? (
                <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">No document names added yet</div>
              ) : (
                <div className="grid gap-2">
                  {docs.map(doc => {
                    const state = docState(doc);
                    const Icon = state.icon;
                    const isReceived = RECEIVED_STATUSES.has(doc.status);
                    const labels = docLabels(doc);
                    const showState = showStateBadge(doc, labels);
                    return (
                      <div key={doc._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                        <div className="min-w-0 flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={selectedDocIds.includes(String(doc._id))}
                            onChange={() => toggleDocSelection(doc._id)}
                            className="mt-1 h-4 w-4 accent-indigo-600"
                            aria-label={`Select ${doc.name} for CSV`}
                          />
                          <div>
                          <div className="font-medium truncate">{doc.name}</div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {showState && (
                              <span className={`inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 ${state.tone}`}>
                                <Icon className="h-3 w-3"/>{state.label}
                              </span>
                            )}
                            {labels.map(label => {
                              const LabelIcon = label.icon;
                              return (
                                <span key={label.key} className={`inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 ${label.tone}`}>
                                  <LabelIcon className="h-3 w-3"/>{label.text}
                                </span>
                              );
                            })}
                          </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {!isReceived && canReceive && (
                            <Button size="sm" onClick={() => markReceived(doc, student._id)} disabled={saving}>Tick Received</Button>
                          )}
                          {!isReceived && canRequest && (
                            <Button size="sm" variant="outline" onClick={() => requestDoc(doc, student._id)} disabled={saving} className="gap-1">
                              <Send className="h-3.5 w-3.5"/>Request
                            </Button>
                          )}
                          {!isReceived && canRequest && (
                            <Button size="sm" variant="outline" onClick={() => urgentRequestDoc(doc, student._id)} disabled={saving} className="gap-1 border-red-200 text-red-700 hover:bg-red-50">
                              <AlertTriangle className="h-3.5 w-3.5"/>Urgent Request
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {requestedDocs.length > 0 && (
                <div className="border-t pt-3 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requested Documents ({requestedDocs.length})</div>
                  {requestedDocs.map(doc => {
                    const state = docState(doc);
                    const Icon = state.icon;
                    const isReceived = RECEIVED_STATUSES.has(doc.status);
                    const labels = docLabels(doc);
                    const showState = showStateBadge(doc, labels);
                    return (
                      <div key={doc._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2">
                        <div className="min-w-0 flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={selectedDocIds.includes(String(doc._id))}
                            onChange={() => toggleDocSelection(doc._id)}
                            className="mt-1 h-4 w-4 accent-indigo-600"
                            aria-label={`Select ${doc.name} for CSV`}
                          />
                          <div>
                          <div className="font-medium truncate">{doc.name}</div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {showState && (
                              <span className={`inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 ${state.tone}`}>
                                <Icon className="h-3 w-3"/>{state.label}
                              </span>
                            )}
                            {labels.map(label => {
                              const LabelIcon = label.icon;
                              return (
                                <span key={label.key} className={`inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 ${label.tone}`}>
                                  <LabelIcon className="h-3 w-3"/>{label.text}
                                </span>
                              );
                            })}
                          </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {!isReceived && canReceive && (
                            <Button size="sm" onClick={() => markReceived(doc, student._id)} disabled={saving}>Tick Received</Button>
                          )}
                          {!isReceived && canRequest && (
                            <Button size="sm" variant="outline" onClick={() => urgentRequestDoc(doc, student._id)} disabled={saving} className="gap-1 border-red-200 text-red-700 hover:bg-red-50">
                              <AlertTriangle className="h-3.5 w-3.5"/>Urgent Request
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Download Inventory CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              {selectedInventoryDocs.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{selectedInventoryDocs.length}</b> documents selected</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedDocIds([])}>Clear selection</Button>
                </div>
              ) : (
                <span>No document selected. Use filters below to download the exact inventory CSV.</span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Download scope</Label>
                <select
                  value={csvFilters.scope}
                  onChange={e => setCsv('scope', e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="all">All visible documents</option>
                  <option value="selected">Only selected documents</option>
                </select>
              </div>

              <div>
                <Label>Student</Label>
                <Input
                  value={csvStudentSearch}
                  onChange={e => setCsvStudentSearch(e.target.value)}
                  placeholder="Search student name, enrollment, center..."
                  className="mt-1"
                />
                <select
                  value={csvFilters.studentId}
                  onChange={e => setCsv('studentId', e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="all">All students</option>
                  {visibleCsvStudentOptions.map(student => (
                    <option key={student._id} value={student._id}>
                      {student.name}{student.enrollmentNumber ? ` - ${student.enrollmentNumber}` : ''}
                    </option>
                  ))}
                  {csvFilters.studentId !== 'all' && !visibleCsvStudentOptions.some(student => String(student._id) === String(csvFilters.studentId)) && (
                    <option value={csvFilters.studentId}>
                      Selected student
                    </option>
                  )}
                </select>
                {csvStudentSearch && visibleCsvStudentOptions.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">No student matching this search.</p>
                )}
              </div>

              <div>
                <Label>Document name/type</Label>
                <select
                  value={csvFilters.docName}
                  onChange={e => setCsv('docName', e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="all">All document names</option>
                  {csvDocNameOptions.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Document status/type</Label>
                <select
                  value={csvFilters.statusType}
                  onChange={e => setCsv('statusType', e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {csvStatusOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Date filter type</Label>
                <select
                  value={csvFilters.dateType}
                  onChange={e => setCsv('dateType', e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {csvDateOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>From date</Label>
                  <Input
                    type="date"
                    value={csvFilters.from}
                    onChange={e => setCsv('from', e.target.value)}
                    disabled={csvFilters.dateType === 'any'}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>To date</Label>
                  <Input
                    type="date"
                    value={csvFilters.to}
                    onChange={e => setCsv('to', e.target.value)}
                    disabled={csvFilters.dateType === 'any'}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-slate-50 px-3 py-2 text-sm">
              <span><b>{csvFilteredDocs.length}</b> documents match these filters</span>
              <Button type="button" variant="ghost" size="sm" onClick={resetCsvFilters}>Reset filters</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvOpen(false)}>Close</Button>
            <Button onClick={downloadInventoryCsv} disabled={csvFilteredDocs.length === 0}>
              <Download className="h-4 w-4 mr-1"/>Download CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!actionTarget} onOpenChange={() => setActionTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionTarget?.type === 'receive'
                ? 'Mark Document Received'
                : actionTarget?.type === 'urgent'
                  ? 'Urgent Document Request'
                  : 'Request Document'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <b>{actionTarget?.doc?.name}</b>
            </div>
            <div>
              <Label>
                {actionTarget?.type === 'receive'
                  ? 'Received date'
                  : actionTarget?.type === 'urgent'
                    ? 'Urgent request date'
                    : 'Requested date'}
              </Label>
              <Input type="date" value={actionDate} onChange={e => setActionDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionTarget(null)}>Cancel</Button>
            <Button onClick={confirmAction} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              {actionTarget?.type === 'receive' ? 'Save Received' : actionTarget?.type === 'urgent' ? 'Send Urgent Request' : 'Send Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!addTarget} onOpenChange={() => { setAddTarget(null); setNames(''); setReceived(false); setAddReceivedDate(todayInput()); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Document Names</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <b>{addTarget?.student?.name}</b>
              {addTarget?.student?.enrollmentNumber && <span className="font-mono text-emerald-700 ml-2">{addTarget.student.enrollmentNumber}</span>}
            </div>
            <div>
              <Label>Document names</Label>
              <Textarea rows={5} value={names} onChange={e => setNames(e.target.value)} placeholder={'Migration Certificate\nOriginal Marksheet\nProvisional Certificate'}/>
              <p className="text-xs text-muted-foreground mt-1">One document name per line.</p>
            </div>
            {canReceive && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={received} onChange={e => setReceived(e.target.checked)}/>
                  Mark these as received from university
                </label>
                {received && (
                  <div>
                    <Label>Received date</Label>
                    <Input type="date" value={addReceivedDate} onChange={e => setAddReceivedDate(e.target.value)} />
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddTarget(null); setNames(''); setReceived(false); setAddReceivedDate(todayInput()); }}>Cancel</Button>
            <Button onClick={addDocs} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
