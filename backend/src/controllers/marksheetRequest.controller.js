const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const StudentDoc = require('../models/StudentDocument');
const Student = require('../models/Student');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Counselor = require('../models/Counselor');
const InventoryDocument = require('../models/InventoryDocument');
const PaymentQuery = require('../models/PaymentQuery');
const { audit, notifyRole } = require('../utils/helpers');

// A counselor's marksheet request straight to the Inventory team (origin 'Counselor'): no centre, accountant or
// payment. For any student of theirs with an enrollment number, the counselor requests a marksheet that is not in
// the New Inventory; the Inventory team asks the university for it, receives it and checks it for corrections
// on its Marksheet Requests page, and it ends in the New Inventory (In_Inventory).

const isId = v => mongoose.isValidObjectId(v);
const fail = (status, message) => { const e = new Error(message); e.status = status; return e; };
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OPEN_DIRECT = { $nin: ['Closed', 'In_Inventory'] };

// course fee paid so far: fee payments that are verified (or need no verification); pending ones apart
function feeSummary(payment) {
  const netFee = Math.max(0, Number(payment?.totalFee || 0) - Number(payment?.discount || 0));
  const fees = (payment?.transactions || []).filter(tx => (tx.type || 'Fee') === 'Fee' && !tx.documentRef);
  const sum = list => list.reduce((s, tx) => s + (Number(tx.amount) || 0), 0);
  const paidAmount = sum(fees.filter(tx => ['verified', 'not_required'].includes(tx.verificationStatus || 'not_required')));   // as the Payment model counts it
  const pendingAmount = sum(fees.filter(tx => ['pending_counselor', 'pending_accountant'].includes(tx.verificationStatus)));
  return { netFee, paidAmount, pendingAmount, dueAmount: Math.max(0, netFee - paidAmount) };
}
exports.feeSummary = feeSummary;

async function myCentres(user) {
  if (!user.counselorId) return [];
  const c = await Counselor.findById(user.counselorId).select('centers').lean();
  return (c?.centers || []).map(String);
}
exports.myCentres = myCentres;

// the students a counselor works on: their own, and those of their centres (Admin: all)
async function studentScope(user) {
  if (user.role === 'Admin') return {};
  const centres = await myCentres(user);
  return { $or: [{ counselor: user.counselorId }, { center: { $in: centres } }] };
}
exports.studentScope = studentScope;

async function assertStudentInScope(user, student) {
  if (!student) throw fail(404, 'Student not found');
  if (user.role === 'Admin') return;
  if (String(student.counselor || '') === String(user.counselorId || '')) return;
  const centres = await myCentres(user);
  if (!centres.includes(String(student.center?._id || student.center))) throw fail(403, 'This student is not in your centres');
}
exports.assertStudentInScope = assertStudentInScope;

// the Viewer Counselor logins of each centre
async function viewersByCentre(centreIds) {
  const counselors = await Counselor.find({ centers: { $in: centreIds } }).select('centers').lean();
  const users = await User.find({ role: 'ViewerCounselor', isActive: true, counselorId: { $in: counselors.map(c => c._id) } }).select('name counselorId').lean();
  const byCounselor = new Map(counselors.map(c => [String(c._id), (c.centers || []).map(String)]));
  const map = new Map();
  users.forEach(u => (byCounselor.get(String(u.counselorId)) || []).forEach(cid => {
    if (!map.has(cid)) map.set(cid, []);
    map.get(cid).push({ _id: u._id, name: u.name });
  }));
  return map;
}
exports.viewersByCentre = viewersByCentre;

const placeOf = i => (i.correctionSentAt ? 'correction' : i.centreReceivedAt ? 'received' : i.sentToCentreAt ? 'sent' : i.correctionCheckPending ? 'check' : 'office');

// GET /marksheet-requests/students?search=&centerId= — all the students the counselor works on, with their course
// fee, marksheets in the New Inventory, open direct requests and open payment query. A marksheet can be requested for
// any of them once the enrollment number is in.
exports.students = asyncHandler(async (req, res) => {
  const scope = await studentScope(req.user);
  const and = [scope];
  if (isId(req.query.centerId)) and.push({ center: req.query.centerId });
  const q = String(req.query.search || '').trim().slice(0, 60);
  if (q) and.push({ $or: [{ name: new RegExp(esc(q), 'i') }, { enrollmentNumber: new RegExp(esc(q), 'i') }] });
  const LIMIT = 500;
  const students = await Student.find({ $and: and }).select('name enrollmentNumber applicationStatus courseName courseYear center university')
    .populate('center', 'name').populate('university', 'name shortName').sort('name').limit(LIMIT).lean();
  const ids = students.map(s => s._id);
  const [payments, items, requests, queries, viewers] = await Promise.all([
    Payment.find({ student: { $in: ids } }).select('student totalFee discount transactions.amount transactions.type transactions.documentRef transactions.verificationStatus').lean(),
    InventoryDocument.find({ student: { $in: ids }, section: 'Marksheet' }).select('student name correctionCheckPending sentToCentreAt centreReceivedAt correctionSentAt').lean(),
    StudentDoc.find({ student: { $in: ids }, origin: 'Counselor', status: OPEN_DIRECT }).select('student name status urgent createdAt').lean(),
    PaymentQuery.find({ student: { $in: ids }, status: 'Open' }).select('student createdAt').lean(),
    viewersByCentre([...new Set(students.map(s => String(s.center?._id || s.center)).filter(Boolean))]),
  ]);
  const group = (list, key = 'student') => list.reduce((m, x) => { const k = String(x[key]); (m[k] = m[k] || []).push(x); return m; }, {});
  const payBy = new Map(payments.map(p => [String(p.student), p]));
  const itemsBy = group(items);
  const reqBy = group(requests);
  const queryBy = new Map(queries.map(x => [String(x.student), x]));
  res.json({
    truncated: students.length === LIMIT,
    students: students.map(s => {
      const fee = feeSummary(payBy.get(String(s._id)));
      const cid = String(s.center?._id || s.center || '');
      return {
        _id: s._id, name: s.name, enrollmentNumber: s.enrollmentNumber, applicationStatus: s.applicationStatus, courseName: s.courseName, courseYear: s.courseYear,
        center: s.center, university: s.university,
        fee, canRequest: !!String(s.enrollmentNumber || '').trim() && !!s.university,
        inventory: (itemsBy[String(s._id)] || []).map(i => ({ _id: i._id, name: i.name, place: placeOf(i) })),
        requests: (reqBy[String(s._id)] || []).map(r => ({ _id: r._id, name: r.name, status: r.status, urgent: !!r.urgent, createdAt: r.createdAt })),
        openQuery: queryBy.get(String(s._id)) ? { _id: queryBy.get(String(s._id))._id, createdAt: queryBy.get(String(s._id)).createdAt } : null,
        viewers: viewers.get(cid) || [],
      };
    }),
  });
});

// GET /marksheet-requests — the direct requests: all for Inventory / Admin, the counselor's own and their centres'
exports.list = asyncHandler(async (req, res) => {
  const filter = { origin: 'Counselor' };
  if (['Counselor'].includes(req.user.role)) {
    const centres = await myCentres(req.user);
    filter.$or = [{ uploadedBy: req.user._id }, { center: { $in: centres } }];
  }
  const docs = await StudentDoc.find(filter)
    .populate('student', 'name enrollmentNumber courseName courseYear')
    .populate('center', 'name')
    .populate('university', 'name shortName')
    .populate('uploadedBy', 'name role')
    .populate('statusHistory.changedBy', 'name role')
    .populate('closedBy', 'name role')
    .sort('-createdAt')
    .lean();
  const payments = await Payment.find({ student: { $in: [...new Set(docs.map(d => String(d.student?._id || d.student)))] } })
    .select('student totalFee discount transactions.amount transactions.type transactions.documentRef transactions.verificationStatus').lean();
  const payBy = new Map(payments.map(p => [String(p.student), p]));
  res.json(docs.map(d => ({ ...d, courseFeeSummary: feeSummary(payBy.get(String(d.student?._id || d.student))) })));
});

// POST /marksheet-requests { studentId, names: [...] } — the counselor requests marksheets from the Inventory team
exports.create = asyncHandler(async (req, res) => {
  if (!isId(req.body.studentId)) throw fail(400, 'Choose the student');
  const student = await Student.findById(req.body.studentId).select('name enrollmentNumber applicationStatus center counselor university');
  await assertStudentInScope(req.user, student);
  // the only condition: the enrollment number is in
  if (!String(student.enrollmentNumber || '').trim()) throw fail(400, 'No enrollment number yet — a marksheet is requested once the enrollment number is in');
  if (!student.university) throw fail(400, 'The student has no university');

  const names = [...new Set((Array.isArray(req.body.names) ? req.body.names : [req.body.name])
    .map(n => String(n || '').trim().replace(/\s+/g, ' ').slice(0, 120)).filter(Boolean))];
  if (!names.length) throw fail(400, 'Choose the marksheet');
  if (names.length > 12) throw fail(400, 'At most 12 marksheets at a time');
  const urgent = req.body.urgent === true || req.body.urgent === 'true';

  const [held, open] = await Promise.all([
    InventoryDocument.find({ student: student._id, section: 'Marksheet' }).select('nameKey correctionSentAt').lean(),
    StudentDoc.find({ student: student._id, origin: 'Counselor', status: OPEN_DIRECT }).select('name').lean(),
  ]);
  const heldKeys = new Map(held.map(i => [i.nameKey, i]));
  const openKeys = new Set(open.map(d => InventoryDocument.nameKeyOf(d.name)));
  const created = [];
  const failed = [];
  const now = new Date();
  for (const name of names) {
    const key = InventoryDocument.nameKeyOf(name);
    if (openKeys.has(key)) { failed.push({ name, error: 'Already requested' }); continue; }
    const item = heldKeys.get(key);
    if (item) { failed.push({ name, error: item.correctionSentAt ? 'At the university for correction' : 'Already in the New Inventory' }); continue; }
    const doc = await StudentDoc.create({
      student: student._id, center: student.center, counselor: student.counselor, university: student.university,
      name, section: 'Marksheet', origin: 'Counselor', requestType: 'Soft Copy', chargeFee: 0,
      uploadedBy: req.user._id, status: 'With_Inventory',
      ...(urgent ? { urgent: true, urgentMarkedBy: req.user._id, urgentMarkedAt: now } : {}),
      statusHistory: [
        { status: 'Requested', changedBy: req.user._id, at: now, note: 'Requested by the counselor from the Inventory' },
        ...(urgent ? [{ status: 'Marked_Urgent', changedBy: req.user._id, at: now, note: 'Requested as urgent' }] : []),
        { status: 'With_Inventory', changedBy: req.user._id, at: now, note: 'Inventory to request it from the university' },
      ],
    });
    openKeys.add(key);
    created.push(doc);
    await audit('marksheet_direct_requested', 'StudentDocument', doc._id, req.user, { name }, `Marksheet requested from the Inventory: ${name} (${student.name})`);
  }
  if (created.length) {
    await notifyRole('Inventory', {
      message: `${urgent ? 'URGENT — ' : ''}Marksheet request from ${req.user.name || 'a counselor'}: ${created.map(d => `"${d.name}"`).join(', ')} — ${student.name} (${student.enrollmentNumber})`,
      type: 'doc_forwarded', studentId: student._id, ...(created.length === 1 ? { documentId: created[0]._id } : {}), role: 'Inventory',
    });
  }
  res.status(created.length ? 201 : 400).json({ created, failed, ...(created.length ? {} : { error: failed.map(f => `${f.name}: ${f.error}`).join('; ') }) });
});
