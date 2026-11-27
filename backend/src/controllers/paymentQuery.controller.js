const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const PaymentQuery = require('../models/PaymentQuery');
const Student = require('../models/Student');
const Payment = require('../models/Payment');
const { audit, notify } = require('../utils/helpers');
const { feeSummary, myCentres, assertStudentInScope, viewersByCentre } = require('./marksheetRequest.controller');

// Payment queries: a counselor asks the Viewer Counselor(s) of a student's centre to talk to the centre and get the
// course fee that has not come in. Both sides add updates; it closes with a confirmation (and a note).

const isId = v => mongoose.isValidObjectId(v);
const fail = (status, message) => { const e = new Error(message); e.status = status; return e; };
const text = (v, max = 1000) => String(v || '').trim().slice(0, max);

// which queries a login sees: Admin all; a Viewer Counselor its centres'; a counselor its own and its centres'
async function scopeFilter(user) {   // (also used for the sidebar badge)
  if (user.role === 'Admin') return {};
  const centres = await myCentres(user);
  if (user.role === 'ViewerCounselor') return { center: { $in: centres } };
  return { $or: [{ raisedBy: user._id }, { center: { $in: centres } }] };
}

async function loadInScope(req) {
  if (!isId(req.params.id)) throw fail(404, 'Query not found');
  const query = await PaymentQuery.findOne({ _id: req.params.id, ...(await scopeFilter(req.user)) });
  if (!query) throw fail(404, 'Query not found');
  return query;
}

const populated = q => q
  .populate('student', 'name enrollmentNumber courseName courseYear phone')
  .populate('center', 'name city')
  .populate('raisedBy', 'name role')
  .populate('updates.by', 'name role')
  .populate('closedBy', 'name role');

async function withFees(queries) {
  const payments = await Payment.find({ student: { $in: queries.map(q => q.student?._id || q.student) } })
    .select('student totalFee discount transactions.amount transactions.type transactions.documentRef transactions.verificationStatus').lean();
  const payBy = new Map(payments.map(p => [String(p.student), p]));
  const viewers = await viewersByCentre([...new Set(queries.map(q => String(q.center?._id || q.center)))]);
  return queries.map(q => ({
    ...q,
    fee: feeSummary(payBy.get(String(q.student?._id || q.student))),
    viewers: viewers.get(String(q.center?._id || q.center)) || [],
  }));
}

// who else hears about a change: the counselor who raised it, and the centre's Viewer Counselors (not the author)
async function tellOthers(query, user, message) {
  const viewers = (await viewersByCentre([String(query.center)])).get(String(query.center)) || [];
  const ids = [String(query.raisedBy), ...viewers.map(v => String(v._id))].filter(id => id !== String(user._id));
  if (ids.length) await notify([...new Set(ids)], { message, type: 'payment_query', studentId: query.student });
}

exports.scopeFilter = scopeFilter;

// GET /payment-queries?status=Open|Closed
exports.list = asyncHandler(async (req, res) => {
  const status = req.query.status === 'Closed' ? 'Closed' : 'Open';
  const queries = await populated(PaymentQuery.find({ ...(await scopeFilter(req.user)), status }))
    .sort(status === 'Open' ? 'createdAt' : '-closedAt').limit(500).lean();
  const counts = {
    Open: await PaymentQuery.countDocuments({ ...(await scopeFilter(req.user)), status: 'Open' }),
  };
  res.json({ queries: await withFees(queries), counts });
});

// POST /payment-queries { studentId, message } — the counselor raises one (one open query per student)
exports.create = asyncHandler(async (req, res) => {
  if (!isId(req.body.studentId)) throw fail(400, 'Choose the student');
  const student = await Student.findById(req.body.studentId).select('name enrollmentNumber center counselor').populate('center', 'name');
  await assertStudentInScope(req.user, student);
  if (!student.center) throw fail(400, 'The student has no centre');
  const fee = feeSummary(await Payment.findOne({ student: student._id }).lean());
  if (!(fee.dueAmount > 0)) throw fail(400, 'The course fee is fully paid — nothing to ask for');
  if (await PaymentQuery.exists({ student: student._id, status: 'Open' })) throw fail(409, `A payment query for ${student.name} is already open`);
  const viewers = (await viewersByCentre([String(student.center._id)])).get(String(student.center._id)) || [];
  if (!viewers.length) throw fail(400, `No Viewer Counselor is assigned to ${student.center.name} — ask Admin to assign one`);

  const message = text(req.body.message) || 'Course fee has not come in — please talk to the centre and get it paid.';
  const query = await PaymentQuery.create({
    student: student._id, center: student.center._id, raisedBy: req.user._id, message,
    feeAtRaise: { netFee: fee.netFee, paidAmount: fee.paidAmount, dueAmount: fee.dueAmount },
  });
  await notify(viewers.map(v => v._id), {
    message: `Payment query from ${req.user.name || 'a counselor'}: ${student.name} (${student.center.name}) — ₹${fee.dueAmount.toLocaleString('en-IN')} course fee due. ${message}`,
    type: 'payment_query', studentId: student._id,
  });
  await audit('payment_query_raised', 'Student', student._id, req.user, { queryId: query._id, due: fee.dueAmount }, `Payment query raised: ${student.name}`);
  const [out] = await withFees([await populated(PaymentQuery.findById(query._id)).lean()]);
  res.status(201).json(out);
});

// POST /payment-queries/:id/updates { text } — either side writes what happened (talked to the centre, promised date…)
exports.addUpdate = asyncHandler(async (req, res) => {
  const query = await loadInScope(req);
  if (query.status !== 'Open') throw fail(400, 'This query is closed');
  const t = text(req.body.text);
  if (!t) throw fail(400, 'Write the update');
  query.updates.push({ by: req.user._id, at: new Date(), text: t });
  await query.save();
  const student = await Student.findById(query.student).select('name').lean();
  await tellOthers(query, req.user, `Payment query update (${student?.name || ''}) from ${req.user.name || req.user.role}: ${t}`);
  const [out] = await withFees([await populated(PaymentQuery.findById(query._id)).lean()]);
  res.json(out);
});

// POST /payment-queries/:id/close { confirm: true, note } — closed once it is confirmed (e.g. the centre has paid)
exports.close = asyncHandler(async (req, res) => {
  const query = await loadInScope(req);
  if (query.status !== 'Open') throw fail(400, 'This query is already closed');
  if (req.body.confirm !== true && req.body.confirm !== 'true') throw fail(400, 'Confirm to close the query');
  query.status = 'Closed';
  query.closedBy = req.user._id;
  query.closedAt = new Date();
  query.closeNote = text(req.body.note);
  await query.save();
  const student = await Student.findById(query.student).select('name').lean();
  await tellOthers(query, req.user, `Payment query closed (${student?.name || ''}) by ${req.user.name || req.user.role}${query.closeNote ? `: ${query.closeNote}` : ''}`);
  await audit('payment_query_closed', 'Student', query.student, req.user, { queryId: query._id, note: query.closeNote }, `Payment query closed: ${student?.name || ''}`);
  const [out] = await withFees([await populated(PaymentQuery.findById(query._id)).lean()]);
  res.json(out);
});
