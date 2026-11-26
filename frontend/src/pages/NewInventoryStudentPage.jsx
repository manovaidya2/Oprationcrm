import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Archive, CheckCircle2, ClipboardCheck, Download, FileText, GraduationCap, History, Loader2, Plus, Send, Truck, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DocNameField } from '@/components/DocNameField';
import { OTHER_NAME } from '@/lib/documentOptions';
import { byLine } from '@/lib/docRequests';
import { MEDIA, newInventoryApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const TABS = [
  { key: 'Marksheet', label: 'Marksheets',      icon: GraduationCap, noun: 'marksheet' },
  { key: 'Other',     label: 'Other documents', icon: FileText,      noun: 'document' },
];
const CAN_ADD = ['Admin', 'Accountant', 'Counselor', 'Dispatch'];
const CAN_MARK = ['Admin', 'Dispatch'];   // who marks where a document is now
const EMPTY_FORM = { pick: '', customName: '', note: '', state: 'office' };
// where a document is: held in the office, sent to the centre, received by the centre, or back at the
// university for correction (until the corrected copy is received)
const PLACES = {
  office:     { label: 'In office',          short: 'In office',     icon: Archive,      pill: 'bg-emerald-50 text-emerald-700' },
  sent:       { label: 'Sent to centre',     short: 'Sent',          icon: Truck,        pill: 'bg-blue-50 text-blue-700' },
  received:   { label: 'With centre',        short: 'Received',      icon: CheckCircle2, pill: 'bg-slate-100 text-slate-700' },
  correction: { label: 'At university',      short: 'At university', icon: Undo2,        pill: 'bg-amber-50 text-amber-800' },
};
const ADD_PLACES = ['office', 'sent', 'received'];   // where a document can be when it is added
const placeOf = item => (item.centreReceivedAt ? 'received' : item.sentToCentreAt ? 'sent' : item.correctionSentAt ? 'correction' : 'office');
const fmtDt = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const statusText = s => String(s || '').replace(/_/g, ' ');

// the line under a document's name: when it got where it is
function whenLine(item) {
  switch (placeOf(item)) {
    case 'received':   return `Received by the centre · ${fmtDt(item.centreReceivedAt)}`;
    case 'sent':       return `Sent to the centre · ${fmtDt(item.sentToCentreAt)}`;
    case 'correction': return `Sent back for correction · ${fmtDt(item.correctionSentAt)}`;
    default:           return item.fromRequest || item.receivedAt
      ? `Received from the university · ${fmtDt(item.receivedAt || item.createdAt)}`
      : `Added · ${fmtDt(item.createdAt)}`;
  }
}

// One student in the New Inventory: their marksheets and other documents — where each is, its scans and history.
export default function NewInventoryStudentPage() {
  const { studentId } = useParams();
  const role = useAuth().user?.role;
  const canAdd = CAN_ADD.includes(role);
  const canMark = CAN_MARK.includes(role);
  const [marking, setMarking] = useState('');   // id of the item being marked
  const [tab, setTab] = useState('Marksheet');
  const [place, setPlace] = useState('all');    // filter: all | office | check | sent | received | correction
  const [openId, setOpenId] = useState('');     // the document in the side panel
  const [adding, setAdding] = useState(false);  // the side panel shows the add form
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState({ key: '', data: null, error: '' });

  useEffect(() => {
    let alive = true;
    newInventoryApi.student(studentId)
      .then(data => { if (alive) setResult({ key: studentId, data, error: '' }); })
      .catch(e => { if (alive) setResult({ key: studentId, data: null, error: e.message || 'Could not load the student' }); });
    return () => { alive = false; };
  }, [studentId]);

  const loading = result.key !== studentId;
  const student = result.data?.student;
  const items = result.data?.items || [];
  const active = TABS.find(t => t.key === tab);
  const inTab = items.filter(i => i.section === tab);
  const placeMatch = (i, p) => (p === 'all' ? true : p === 'check' ? !!i.correctionCheckPending : placeOf(i) === p);
  const shown = inTab.filter(i => placeMatch(i, place));
  const open = shown.find(i => i._id === openId) || shown[0] || null;
  const summary = {
    office: items.filter(i => placeOf(i) === 'office').length,
    centre: items.filter(i => ['sent', 'received'].includes(placeOf(i))).length,
    check: items.filter(i => i.correctionCheckPending).length,
    correction: items.filter(i => placeOf(i) === 'correction').length,
  };

  function switchTab(key) { setTab(key); setPlace('all'); setOpenId(''); setForm(EMPTY_FORM); }

  async function add() {
    const name = form.pick === OTHER_NAME ? form.customName.trim() : form.pick;
    if (!name) return toast.error(form.pick === OTHER_NAME ? `Type the ${active.noun} name` : `Choose a ${active.noun}`);
    setSaving(true);
    try {
      const data = await newInventoryApi.addItem(studentId, { section: tab, name, note: form.note.trim(), state: form.state });
      setResult({ key: studentId, data, error: '' });
      setForm(EMPTY_FORM);
      setAdding(false);
      setPlace('all');
      const added = (data.items || []).find(i => i.section === tab && i.name === name);
      if (added) setOpenId(added._id);
      toast.success(`${name} added to the inventory${tab === 'Marksheet' && form.state === 'office' ? ' — Dispatch will check it for corrections' : ''}`);
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function markPlace(item, state) {
    setMarking(item._id);
    try {
      const data = await newInventoryApi.setCentreState(item._id, state);
      setResult({ key: studentId, data, error: '' });
      toast.success(`${item.name}: ${state === 'office' ? 'back in the office' : PLACES[state].label.toLowerCase()}${data.delivered ? ' — its request marked delivered' : ''}`);
    } catch (e) { toast.error(e.message); }
    finally { setMarking(''); }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-300"/></div>;
  if (!student) {
    return (
      <div className="space-y-4">
        <Link to="/new-inventory" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600"><ArrowLeft className="h-4 w-4"/>New Inventory</Link>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{result.error || 'Student not found'}</div>
      </div>
    );
  }

  const filters = [
    ['all', 'All', inTab.length],
    ['office', 'In office', inTab.filter(i => placeOf(i) === 'office').length],
    ['check', 'To check', inTab.filter(i => i.correctionCheckPending).length],
    ['sent', 'Sent', inTab.filter(i => placeOf(i) === 'sent').length],
    ['received', 'With centre', inTab.filter(i => placeOf(i) === 'received').length],
    ['correction', 'At university', inTab.filter(i => placeOf(i) === 'correction').length],
  ].filter(([key, , n]) => key === 'all' || n > 0);

  function renderAdd() {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Add {active.noun}</h2>
            <p className="text-xs text-slate-500">A {active.noun} of {student.name}: kept in the office, or already with the centre.</p>
          </div>
          <Button variant="ghost" size="sm" aria-label="Close" onClick={() => { setAdding(false); setForm(EMPTY_FORM); }}><X className="h-4 w-4"/></Button>
        </div>
        <DocNameField section={tab} value={form} onChange={patch => setForm(p => ({ ...p, ...patch }))}/>
        <div>
          <Label className="text-xs font-semibold text-slate-600">Where is it now?</Label>
          <div className="mt-1 grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1" role="radiogroup" aria-label="Where is it now">
            {ADD_PLACES.map(key => (
              <button key={key} type="button" role="radio" aria-checked={form.state === key} onClick={() => setForm(f => ({ ...f, state: key }))}
                className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${form.state === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {PLACES[key].short}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600">Note</Label>
          <Input value={form.note} maxLength={300} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} placeholder="e.g. Shelf 3, file 12" className="mt-1 h-10 border-slate-200"/>
        </div>
        {tab === 'Marksheet' && form.state === 'office' && (
          <p className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-800">It is marked received from the university and goes to Dispatch's Correction Check. Checked, it stays here until a centre requests it.</p>
        )}
        <Button className="h-11 w-full bg-indigo-600 hover:bg-indigo-700" disabled={saving} onClick={add}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/> : <Plus className="mr-1.5 h-4 w-4"/>}Add to inventory
        </Button>
      </div>
    );
  }

  function renderItem(item) {
    const p = PLACES[placeOf(item)];
    const { icon: PlaceIcon } = p;
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-slate-900">{item.name}</h2>
          <div className="flex flex-wrap gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.pill}`}><PlaceIcon className="h-3.5 w-3.5"/>{p.label}</span>
            {item.correctionCheckPending && <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-700"><ClipboardCheck className="h-3.5 w-3.5"/>Waiting for Dispatch's correction check</span>}
            {item.correctionCheckedAt && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"><ClipboardCheck className="h-3.5 w-3.5"/>Correction checked</span>}
          </div>
          <p className="text-xs text-slate-500">
            {whenLine(item)}
            {item.addedBy?.name && <> · {item.fromRequest ? 'marked by' : 'added by'} <span className="font-medium text-slate-700">{byLine(item.addedBy)}</span></>}
            {item.fromRequest?.requestType && <> · {item.fromRequest.requestType} request</>}
          </p>
          {item.correctionCheckedAt && <p className="text-xs text-emerald-700">Checked by {byLine(item.correctionCheckedBy) || 'Dispatch'} · {fmtDt(item.correctionCheckedAt)}</p>}
          {item.note && !item.fromRequest && <p className="text-xs italic text-slate-500">“{item.note}”</p>}
        </div>

        {canMark && placeOf(item) !== 'correction' && (
          <div className="flex flex-wrap gap-2">
            {placeOf(item) === 'office' && (
              <Button variant="outline" className="h-10 border-blue-200 text-blue-700 hover:bg-blue-50" disabled={marking === item._id} onClick={() => markPlace(item, 'sent')}><Truck className="mr-1.5 h-4 w-4"/>Sent to centre</Button>
            )}
            {placeOf(item) !== 'received' && (
              <Button variant="outline" className="h-10" disabled={marking === item._id} onClick={() => markPlace(item, 'received')}><CheckCircle2 className="mr-1.5 h-4 w-4"/>Received by centre</Button>
            )}
            {placeOf(item) !== 'office' && (
              <Button variant="ghost" className="h-10 text-slate-500" disabled={marking === item._id} onClick={() => markPlace(item, 'office')}><Undo2 className="mr-1.5 h-4 w-4"/>Back in office</Button>
            )}
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Scans</h3>
          {item.files?.length > 0 ? item.files.map(f => (
            <a key={f.url} href={`${MEDIA}${f.url}`} target="_blank" rel="noreferrer" download={f.name || true}
              className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm hover:border-indigo-300 hover:bg-indigo-50/50">
              <Download className="h-4 w-4 shrink-0 text-indigo-600"/>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-800">{f.name || 'Scan'}</span>
                <span className="block text-xs text-slate-500">{f.sizeKb ? `${f.sizeKb} KB · ` : ''}{fmtDt(f.uploadedAt)}{f.uploadedBy?.name ? ` · ${f.uploadedBy.name}` : ''}</span>
              </span>
            </a>
          )) : <p className="text-xs text-slate-400">No scan yet</p>}
        </div>

        {item.matches?.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Requests it answered ({item.matches.length})</h3>
            {item.matches.map((m, i) => (
              <div key={i} className="rounded-lg bg-indigo-50/60 px-3 py-2 text-xs text-slate-700">
                <span className="font-semibold">{m.request?.name || 'Request'}</span>{m.request?.requestType ? ` · ${m.request.requestType}` : ''} · approved {fmtDt(m.at)}{m.by?.name ? ` by ${m.by.name}` : ''}
                {m.request?.status && <span className="text-slate-500"> · now {statusText(m.request.status)}</span>}
              </div>
            ))}
          </div>
        )}

        {item.log?.length > 0 && (
          <div className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><History className="h-3.5 w-3.5"/>History</h3>
            <ol className="space-y-3 border-l-2 border-slate-200 pl-3.5">
              {[...item.log].sort((a, b) => new Date(b.at) - new Date(a.at)).map((l, i) => (
                <li key={i} className="text-sm">
                  <div className="font-semibold text-slate-800">{l.action}</div>
                  <div className="text-xs text-slate-500">{fmtDt(l.at)}{l.by?.name ? ` · ${byLine(l.by)}` : ''}</div>
                  {l.note && <div className="text-xs italic text-slate-500">“{l.note}”</div>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/new-inventory" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-indigo-600"><ArrowLeft className="h-4 w-4"/>New Inventory</Link>

      {/* Student */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-lg font-bold text-indigo-700">{student.name?.charAt(0)?.toUpperCase()}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{student.name}</h1>
              {student.enrollmentNumber && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-700">{student.enrollmentNumber}</span>}
            </div>
            <div className="mt-0.5 text-sm text-slate-500">
              {[`${student.courseName || ''} ${student.courseYear || ''}`.trim(), student.center?.name, student.university?.name].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span className="rounded-lg bg-slate-50 px-3 py-1.5 text-slate-700">{summary.office} in office</span>
          <span className="rounded-lg bg-slate-50 px-3 py-1.5 text-slate-700">{summary.centre} with centre</span>
          {summary.check > 0 && <span className="rounded-lg bg-orange-50 px-3 py-1.5 text-orange-700">{summary.check} to check</span>}
          {summary.correction > 0 && <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-amber-800">{summary.correction} at university</span>}
          {canAdd && (
            <Button className="h-9 bg-indigo-600 hover:bg-indigo-700" onClick={() => { setAdding(true); setForm(EMPTY_FORM); }}>
              <Plus className="mr-1.5 h-4 w-4"/>Add {active.noun}
            </Button>
          )}
        </div>
      </header>

      {/* Tabs and filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Section" className="inline-flex rounded-xl bg-slate-100 p-1">
          {TABS.map(t => {
            const { icon: Icon } = t;
            const on = tab === t.key;
            const n = items.filter(i => i.section === t.key).length;
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => switchTab(t.key)}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                <Icon className={`h-4 w-4 ${on ? 'text-indigo-600' : ''}`}/>{t.label}
                <span className={`rounded-full px-1.5 text-[11px] leading-5 tabular-nums ${on ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>{n}</span>
              </button>
            );
          })}
        </div>
        {inTab.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Where it is">
            {filters.map(([key, label, n]) => (
              <button key={key} type="button" aria-pressed={place === key} onClick={() => { setPlace(key); setOpenId(''); }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${place === key ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                {label} <span className="tabular-nums opacity-75">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        {/* Documents */}
        <section aria-label={active.label} className="min-w-0 flex-[999_1_520px]">
          <p className="mb-3 flex items-start gap-2 text-xs text-slate-500">
            <Send className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
            When the accountant approves a {active.noun} request for {student.name} and the {active.noun} is here in the office, the request goes to Dispatch instead of the university.
          </p>
          {shown.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-14 text-center">
              <Archive className="mx-auto mb-2 h-8 w-8 text-slate-300"/>
              <p className="text-sm font-medium text-slate-500">{inTab.length ? 'Nothing here with this filter' : `No ${active.noun}s for ${student.name} yet`}</p>
              {canAdd && !inTab.length && <Button variant="outline" size="sm" className="mt-3" onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4"/>Add {active.noun}</Button>}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {shown.map(item => {
                const p = PLACES[placeOf(item)];
                const on = !adding && open?._id === item._id;
                return (
                  <button key={item._id} type="button" onClick={() => { setOpenId(item._id); setAdding(false); }} aria-pressed={on}
                    className={`flex flex-col gap-2.5 rounded-2xl border bg-white p-4 text-left shadow-sm transition-colors ${on ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-slate-300'}`}>
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-[15px] font-semibold text-slate-900">{item.name}</span>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${item.correctionCheckPending ? 'bg-orange-50 text-orange-700' : p.pill}`}>{item.correctionCheckPending ? 'To check' : p.label}</span>
                    </span>
                    <span className="text-xs text-slate-500">{whenLine(item)}</span>
                    <span className="flex flex-wrap gap-1.5">
                      {item.correctionCheckedAt && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Correction checked</span>}
                      {item.files?.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{item.files.length} scan{item.files.length === 1 ? '' : 's'}</span>}
                      {item.matches?.length > 0 && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">Answered {item.matches.length} request{item.matches.length === 1 ? '' : 's'}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Side panel: the open document, or the add form */}
        {(adding || open) && (
          <aside aria-label={adding ? `Add ${active.noun}` : open?.name} className="min-w-0 max-w-full flex-[1_1_340px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-4 lg:max-w-[420px]">
            {adding && canAdd ? renderAdd() : open ? renderItem(open) : null}
          </aside>
        )}
      </div>
    </div>
  );
}
