import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Archive, Building2, CheckCircle2, ClipboardCheck, Download, FileText, GraduationCap, History, Loader2, Plus, Send, Truck, Undo2 } from 'lucide-react';
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
  { key: 'Marksheet', label: 'Marksheet',       icon: GraduationCap, noun: 'marksheet', tone: 'bg-violet-50 text-violet-600' },
  { key: 'Other',     label: 'Other Documents', icon: FileText,      noun: 'document',  tone: 'bg-sky-50 text-sky-600' },
];
const CAN_ADD = ['Admin', 'Accountant', 'Counselor', 'Dispatch'];
const CAN_MARK = ['Admin', 'Dispatch'];   // who marks where a document is now
const EMPTY_FORM = { pick: '', customName: '', note: '', state: 'office' };
// where a document is: held in the office, sent to the centre, or received by the centre
const PLACES = {
  office:   { label: 'In office',          short: 'In office', icon: Archive,      pill: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  sent:     { label: 'Sent to centre',     short: 'Sent',      icon: Truck,        pill: 'border-sky-200 bg-sky-50 text-sky-700' },
  received: { label: 'Received by centre', short: 'Received',  icon: CheckCircle2, pill: 'border-violet-200 bg-violet-50 text-violet-700' },
};
// back at the university for correction (until the corrected copy is received)
const AT_UNIVERSITY = { label: 'At university for correction', icon: Undo2, pill: 'border-amber-300 bg-amber-50 text-amber-800' };
const placeOf = item => (item.centreReceivedAt ? 'received' : item.sentToCentreAt ? 'sent' : item.correctionSentAt ? 'correction' : 'office');
const placeInfo = key => (key === 'correction' ? AT_UNIVERSITY : PLACES[key]);
const fmtDt = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const statusText = s => String(s || '').replace(/_/g, ' ');

// One student in the New Inventory: the marksheets and other documents held for them, and adding more.
export default function NewInventoryStudentPage() {
  const { studentId } = useParams();
  const role = useAuth().user?.role;
  const canAdd = CAN_ADD.includes(role);
  const canMark = CAN_MARK.includes(role);
  const [marking, setMarking] = useState('');   // id of the item being marked
  const [tab, setTab] = useState('Marksheet');
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
  const counts = { Marksheet: items.filter(i => i.section === 'Marksheet').length, Other: items.filter(i => i.section === 'Other').length };
  const active = TABS.find(t => t.key === tab);
  const shown = items.filter(i => i.section === tab);

  async function add() {
    const name = form.pick === OTHER_NAME ? form.customName.trim() : form.pick;
    if (!name) return toast.error(form.pick === OTHER_NAME ? `Type the ${active.noun} name` : `Choose a ${active.noun}`);
    setSaving(true);
    try {
      const data = await newInventoryApi.addItem(studentId, { section: tab, name, note: form.note.trim(), state: form.state });
      setResult({ key: studentId, data, error: '' });
      setForm(EMPTY_FORM);
      toast.success(`${name} added to the inventory`);
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function markPlace(item, state) {
    setMarking(item._id);
    try {
      const data = await newInventoryApi.setCentreState(item._id, state);
      setResult({ key: studentId, data, error: '' });
      toast.success(`${item.name}: ${PLACES[state].label.toLowerCase()}${data.delivered ? ` — its request marked delivered` : ''}`);
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

  return (
    <div className="space-y-5">
      <Link to="/new-inventory" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600"><ArrowLeft className="h-4 w-4"/>New Inventory</Link>

      {/* Student */}
      <div className="flex flex-wrap items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-lg font-bold text-indigo-700">{student.name?.charAt(0)?.toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800">{student.name}</h1>
            {student.enrollmentNumber && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-700">{student.enrollmentNumber}</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {student.center?.name && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3"/>{student.center.name}</span>}
            {(student.courseName || student.courseYear) && <span>{`${student.courseName || ''} ${student.courseYear || ''}`.trim()}</span>}
            {student.university?.name && <span>{student.university.name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 font-semibold text-violet-700">{counts.Marksheet} marksheet{counts.Marksheet === 1 ? '' : 's'}</span>
          <span className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 font-semibold text-sky-700">{counts.Other} other doc{counts.Other === 1 ? '' : 's'}</span>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Held documents" className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
        {TABS.map(t => {
          const { icon: Icon } = t;
          const on = tab === t.key;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => { setTab(t.key); setForm(EMPTY_FORM); }}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              <Icon className={`h-4 w-4 ${on ? 'text-indigo-600' : ''}`}/>{t.label}
              <span className={`min-w-[1.25rem] rounded-full px-1.5 text-center text-[11px] leading-5 tabular-nums ${on ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>{counts[t.key]}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Held documents */}
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3 text-xs text-sky-800">
            <Send className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
            <span>
              When the accountant approves a {active.noun} request for {student.name} and the {active.noun} is here in the office, the request goes to Dispatch instead of the university.
              {tab === 'Marksheet' && ' A marksheet added here as "In office" is marked received from the university and goes to Dispatch\'s Correction Check; checked, it stays here until a centre requests it.'}
            </span>
          </div>
          {shown.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-14 text-center">
              <Archive className="mx-auto mb-2 h-8 w-8 text-slate-300"/>
              <p className="text-sm font-medium text-slate-500">No {active.noun}s held for {student.name}</p>
              {canAdd && <p className="mt-1 text-xs text-slate-400">Add the {active.noun}s kept in the office with the form.</p>}
            </div>
          ) : shown.map(item => {
            const { icon: Icon } = active;
            return (
              <div key={item._id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active.tone}`}><Icon className="h-4 w-4"/></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800">{item.name}</span>
                      {(() => {
                        const p = placeInfo(placeOf(item));
                        const { icon: PlaceIcon } = p;
                        const when = placeOf(item) === 'received' ? item.centreReceivedAt : placeOf(item) === 'sent' ? item.sentToCentreAt : placeOf(item) === 'correction' ? item.correctionSentAt : null;
                        const by = placeOf(item) === 'received' ? item.centreReceivedBy : placeOf(item) === 'sent' ? item.sentToCentreBy : null;
                        return (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${p.pill}`} title={by?.name ? `Marked by ${byLine(by)}` : undefined}>
                            <PlaceIcon className="h-3 w-3"/>{p.label}{when ? ` · ${fmtDt(when)}` : ''}
                          </span>
                        );
                      })()}
                    </div>
                    {item.fromRequest || item.receivedAt ? (
                      <div className="mt-0.5 text-xs text-slate-500">
                        <span className="font-medium text-emerald-700">Received from the university</span> · {fmtDt(item.receivedAt || item.createdAt)}
                        {' '}· marked by <span className="font-medium text-slate-700">{byLine(item.addedBy) || '—'}</span>
                        {item.fromRequest?.requestType && <span className="text-slate-400"> · {item.fromRequest.requestType} request</span>}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-xs text-slate-500">Added by <span className="font-medium text-slate-700">{byLine(item.addedBy) || '—'}</span> · {fmtDt(item.createdAt)}</div>
                    )}
                    {item.note && !item.fromRequest && <p className="mt-1 text-xs italic text-slate-500">“{item.note}”</p>}
                    {item.files?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.files.map(f => (
                          <a key={f.url} href={`${MEDIA}${f.url}`} target="_blank" rel="noreferrer" download={f.name || true}
                            title={`Scanned ${fmtDt(f.uploadedAt)}${f.uploadedBy?.name ? ` by ${f.uploadedBy.name}` : ''}`}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700">
                            <Download className="h-3.5 w-3.5 shrink-0"/>
                            <span className="truncate">{f.name || 'Scan'}</span>
                            <span className="shrink-0 text-slate-400">{f.sizeKb ? `${f.sizeKb} KB · ` : ''}{fmtDt(f.uploadedAt)}</span>
                          </a>
                        ))}
                      </div>
                    )}
                    {item.correctionCheckPending && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                        <ClipboardCheck className="h-3 w-3"/>Waiting for Dispatch's correction check
                      </div>
                    )}
                    {item.correctionCheckedAt && (
                      <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <ClipboardCheck className="h-3.5 w-3.5"/>Correction checked by {byLine(item.correctionCheckedBy) || 'Dispatch'} · {fmtDt(item.correctionCheckedAt)}
                      </div>
                    )}
                    {item.log?.length > 0 && (
                      <details className="mt-2 group">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600">
                          <History className="h-3.5 w-3.5"/>History ({item.log.length})
                        </summary>
                        <ol className="mt-1.5 space-y-1 border-l-2 border-slate-200 pl-3">
                          {[...item.log].sort((a, b) => new Date(b.at) - new Date(a.at)).map((l, i) => (
                            <li key={i} className="text-xs text-slate-600">
                              <span className="font-medium text-slate-800">{l.action}</span>
                              <span className="text-slate-400"> · {fmtDt(l.at)}{l.by?.name ? ` · ${byLine(l.by)}` : ''}</span>
                              {l.note && <div className="italic text-slate-500">“{l.note}”</div>}
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                    {canMark && placeOf(item) !== 'correction' && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {placeOf(item) === 'office' && (
                          <Button size="sm" variant="outline" className="h-7 border-sky-200 px-2 text-xs text-sky-700 hover:bg-sky-50" disabled={marking === item._id} onClick={() => markPlace(item, 'sent')}>
                            <Truck className="mr-1 h-3.5 w-3.5"/>Sent to centre
                          </Button>
                        )}
                        {placeOf(item) !== 'received' && (
                          <Button size="sm" variant="outline" className="h-7 border-violet-200 px-2 text-xs text-violet-700 hover:bg-violet-50" disabled={marking === item._id} onClick={() => markPlace(item, 'received')}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5"/>Received by centre
                          </Button>
                        )}
                        {placeOf(item) !== 'office' && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-500" disabled={marking === item._id} onClick={() => markPlace(item, 'office')}>
                            <Undo2 className="mr-1 h-3.5 w-3.5"/>Back in office
                          </Button>
                        )}
                      </div>
                    )}
                    {item.matches?.length > 0 && (
                      <div className="mt-2 space-y-1 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Answered {item.matches.length} request{item.matches.length === 1 ? '' : 's'} (sent to Dispatch)</div>
                        {item.matches.map((m, i) => (
                          <div key={i} className="text-xs text-slate-600">
                            {m.request?.name || 'Request'}{m.request?.requestType ? ` · ${m.request.requestType}` : ''} · approved {fmtDt(m.at)}{m.by?.name ? ` by ${m.by.name}` : ''}
                            {m.request?.status && <span className="text-slate-400"> · now {statusText(m.request.status)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add */}
        {canAdd && (
          <div className="h-fit space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Add {active.noun}</h2>
              <p className="text-xs text-slate-500">A {active.noun} of {student.name}: kept in the office, or already with the centre.</p>
            </div>
            <DocNameField section={tab} value={form} onChange={patch => setForm(p => ({ ...p, ...patch }))}/>
            <div>
              <Label className="text-xs font-semibold text-slate-600">Where is it now?</Label>
              <div className="mt-1 grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1" role="radiogroup" aria-label="Where is it now">
                {Object.entries(PLACES).map(([key, p]) => (
                  <button key={key} type="button" role="radio" aria-checked={form.state === key} onClick={() => setForm(f => ({ ...f, state: key }))}
                    className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${form.state === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                    {p.short}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600">Note</Label>
              <Input value={form.note} maxLength={300} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} placeholder="e.g. Shelf 3, file 12" className="mt-1 h-10 border-slate-200"/>
            </div>
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={saving} onClick={add}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/> : <Plus className="mr-1.5 h-4 w-4"/>}Add to inventory
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
