// "New Inventory": students, and their marksheets / other documents: held in the office, sent to the centre,
// or received by the centre. (It replaced the older Document Inventory; scripts/move-old-inventory.js moved that in.)
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Counselor = require('../models/Counselor');
const InventoryDocument = require('../models/InventoryDocument');
const StudentDoc = require('../models/StudentDocument');
const { audit, notifyCounselors, notifyRole } = require('../utils/helpers');

const SECTIONS = ['Marksheet', 'Other'];
// where a document is: 'office' (held here), 'sent' (couriered to the centre), 'received' (the centre has it)
const CENTRE_STATES = ['office', 'sent', 'received'];
function centreStateFields(state, user, at = new Date()) {
  if (state === 'received') return { centreReceivedAt: at, centreReceivedBy: user._id };
  if (state === 'sent') return { sentToCentreAt: at, sentToCentreBy: user._id };
  return {};
}
const fail = (status, message) => { const e = new Error(message); e.status = status; return e; };
const isId = v => v && mongoose.Types.ObjectId.isValid(String(v));
const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Counselors see the students of the centres they work on (same rule as the Document Inventory)
async function scopeFilter(req) {
  if (!['Counselor', 'ViewerCounselor'].includes(req.user.role)) return {};
  const me = await Counselor.findById(req.user.counselorId).select('centers').lean();
  const centers = me?.centers || [];
  return { $or: [{ counselor: req.user.counselorId }, ...(centers.length ? [{ center: { $in: centers } }] : [])] };
}

async function loadStudent(req) {
  if (!isId(req.params.id)) throw fail(404, 'Student not found');
  const student = await Student.findOne({ _id: req.params.id, ...(await scopeFilter(req)) })
    .select('name enrollmentNumber courseName courseYear applicationStatus center counselor university')
    .populate('center', 'name city').populate('university', 'name shortName').lean();
  if (!student) throw fail(404, 'Student not found');
  return student;
}

const itemsOf = studentId => InventoryDocument.find({ student: studentId })
  .populate('addedBy', 'name role')
  .populate('fromRequest', 'name status requestType')
  .populate('files.uploadedBy', 'name role')
  .populate('sentToCentreBy', 'name role')
  .populate('centreReceivedBy', 'name role')
  .populate('correctionCheckedBy', 'name role')
  .populate('log.by', 'name role')
  .populate('matches.by', 'name role')
  .populate('matches.request', 'name status requestType createdAt')
  .sort('createdAt').lean();

// GET /api/new-inventory/students?search=&centerId=&page=&limit= — enrolled students, with how many
// marksheets / other documents are held for each
exports.students = asyncHandler(async (req, res) => {
  const filter = { applicationStatus: 'Enrolled', enrollmentNumber: { $exists: true, $ne: '' }, ...(await scopeFilter(req)) };
  if (isId(req.query.centerId)) filter.center = req.query.centerId;
  const q = String(req.query.search || '').trim();
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    filter.$and = [{ $or: [{ name: re }, { enrollmentNumber: re }] }];
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 24));
  const [total, students] = await Promise.all([
    Student.countDocuments(filter),
    Student.find(filter).select('name enrollmentNumber courseName courseYear center')
      .populate('center', 'name city').sort('name').skip((page - 1) * limit).limit(limit).lean(),
  ]);
  const counts = await InventoryDocument.aggregate([
    { $match: { student: { $in: students.map(s => s._id) } } },
    { $group: { _id: { student: '$student', section: '$section' }, n: { $sum: 1 } } },
  ]);
  const countOf = new Map(counts.map(c => [`${c._id.student}:${c._id.section}`, c.n]));
  res.json({
    students: students.map(s => ({ ...s, held: { Marksheet: countOf.get(`${s._id}:Marksheet`) || 0, Other: countOf.get(`${s._id}:Other`) || 0 } })),
    total, page, pages: Math.ceil(total / limit) || 1,
  });
});

// GET /api/new-inventory/students/:id — the student and every document held for them
exports.student = asyncHandler(async (req, res) => {
  const student = await loadStudent(req);
  res.json({ student, items: await itemsOf(student._id) });
});

// POST /api/new-inventory/students/:id/items { section, name, note, state } — a document of the student:
// held in the office (state 'office', the default), already sent to the centre, or already received by it
exports.addItem = asyncHandler(async (req, res) => {
  const student = await loadStudent(req);
  const section = req.body.section;
  const name = String(req.body.name || '').trim();
  if (!SECTIONS.includes(section)) throw fail(400, 'Choose Marksheet or Other document');
  if (!name) throw fail(400, 'Document name is required');
  if (name.length > 120) throw fail(400, 'Document name is too long');
  const state = req.body.state || 'office';
  if (!CENTRE_STATES.includes(state)) throw fail(400, 'Choose where the document is now');
  const exists = await InventoryDocument.exists({ student: student._id, section, nameKey: InventoryDocument.nameKeyOf(name) });
  if (exists) throw fail(409, `${name} is already in the inventory for ${student.name}`);
  // a marksheet kept in the office: received from the university, to be checked for corrections by the Inventory team
  const toCheck = section === 'Marksheet' && state === 'office';
  let item;
  try {
    item = await InventoryDocument.create({
      student: student._id, center: student.center?._id || student.center, section, name,
      note: String(req.body.note || '').trim().slice(0, 300), addedBy: req.user._id,
      ...centreStateFields(state, req.user),
      ...(toCheck ? {
        receivedAt: new Date(), correctionCheckPending: true,
        log: [{ action: 'Received from the university', at: new Date(), by: req.user._id, note: 'Added to the New Inventory' }],
      } : {}),
    });
  } catch (e) {
    if (e?.code === 11000) throw fail(409, `${name} is already in the inventory for ${student.name}`);   // added at the same moment
    throw e;
  }
  await audit('new_inventory_added', 'Student', student._id, req.user, { section, name, state, itemId: item._id }, `${student.name}: ${name} added to New Inventory`);
  if (toCheck && req.user.role !== 'Inventory') {
    await notifyRole('Inventory', { message: `Marksheet added to the New Inventory - check it for corrections: "${name}" - ${student.name}`, type: 'doc_forwarded', studentId: student._id, role: 'Inventory' });
  }
  res.status(201).json({ student, items: await itemsOf(student._id) });
});

// PATCH /api/new-inventory/items/:itemId/centre { state } — the Inventory team marks where the document is now.
// 'received': the centre has it; a request for it that was couriered (Dispatched) is marked Delivered too.
// 'office': back to held here (a mistake undone; requests are not changed).
exports.setCentreState = asyncHandler(async (req, res) => {
  const state = req.body.state;
  if (!CENTRE_STATES.includes(state)) throw fail(400, 'Choose where the document is now');
  if (!isId(req.params.itemId)) throw fail(404, 'Document not found');
  const item = await InventoryDocument.findById(req.params.itemId);
  if (!item) throw fail(404, 'Document not found');
  const student = await loadStudent({ ...req, params: { id: String(item.student) } });

  const unset = {};
  if (state === 'office') Object.assign(unset, { sentToCentreAt: 1, sentToCentreBy: 1, centreReceivedAt: 1, centreReceivedBy: 1 });
  if (state === 'sent') Object.assign(unset, { centreReceivedAt: 1, centreReceivedBy: 1 });
  const set = centreStateFields(state, req.user);
  if (state === 'sent' && item.sentToCentreAt) delete set.sentToCentreAt;   // keep the date it was first sent
  const LOG_TEXT = { office: 'Back in the office', sent: 'Sent to the centre', received: 'Received by the centre' };
  await InventoryDocument.updateOne({ _id: item._id }, {
    ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}),
    $push: { log: { action: LOG_TEXT[state], at: new Date(), by: req.user._id, note: `Marked by ${req.user.role}` } },
  });

  let delivered = 0;
  if (state === 'received') {
    const requests = await StudentDoc.find({ $or: [{ receivedIntoInventory: item._id }, { inventoryItem: item._id }], status: 'Dispatched' });
    for (const doc of requests) {
      doc.statusHistory.push({ status: 'Delivered', changedBy: req.user._id, at: new Date(), note: `Received by centre - marked by ${req.user.role} in the New Inventory` });
      doc.status = 'Delivered';
      await doc.save();
      delivered += 1;
      await notifyCounselors({ counselorId: doc.counselor, centerId: doc.center }, {
        message: `"${doc.name}" for ${student.name} marked received by the centre (by ${req.user.name || req.user.role})`,
        type: 'doc_delivered', documentId: doc._id,
      });
      await audit('doc_delivered', 'StudentDocument', doc._id, req.user, { via: 'new_inventory' }, `Delivered: ${doc.name}`);
    }
  }
  await audit('new_inventory_centre_state', 'Student', student._id, req.user, { itemId: item._id, name: item.name, state, delivered }, `${student.name}: ${item.name} - ${state}`);
  res.json({ student, items: await itemsOf(student._id), delivered });
});

// GET /api/new-inventory/check-pending — marksheets added straight to the New Inventory, waiting for the Inventory
// team's correction check (shown in its Correction Check tab)
exports.checkPending = asyncHandler(async (req, res) => {
  const items = await InventoryDocument.find({ correctionCheckPending: true })
    .populate('student', 'name enrollmentNumber courseName').populate('center', 'name').populate('addedBy', 'name role')
    .sort('createdAt').lean();
  res.json({ items });
});

// POST /api/new-inventory/correction-checked { ids } — the Inventory team checked them: they stay in the inventory, marked
// correction checked, until a centre requests them
exports.correctionChecked = asyncHandler(async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : []).map(String))].filter(isId);
  if (!ids.length) throw fail(400, 'Select the marksheets checked');
  if (ids.length > 200) throw fail(400, 'At most 200 at a time');
  const checked = [];
  const failed = [];
  for (const id of ids) {
    const item = await InventoryDocument.findById(id).populate('student', 'name').lean();
    if (!item) { failed.push({ id, error: 'Not found' }); continue; }
    if (!item.correctionCheckPending) { failed.push({ id, name: item.name, error: 'Already checked' }); continue; }
    const now = new Date();
    await InventoryDocument.updateOne({ _id: id }, {
      $set: { correctionCheckedAt: now, correctionCheckedBy: req.user._id },
      $unset: { correctionCheckPending: 1 },
      $push: { log: { action: 'Correction checked by Inventory', at: now, by: req.user._id } },
    });
    await audit('new_inventory_correction_checked', 'Student', item.student?._id, req.user, { itemId: id, name: item.name }, `${item.student?.name || ''}: ${item.name} correction checked`);
    checked.push(id);
  }
  res.json({ checked, failed });
});

// ── Used by the accountant's approval (document.controller) ──
// A held document of the same name and tab (Marksheet / Other) as the request, for the same student — still in
// the office (one sent to or received by the centre, or back at the university for correction, is not here to give)
exports.findDocumentInStock = (studentId, section, docName) =>
  InventoryDocument.findOne({ student: studentId, section, nameKey: InventoryDocument.nameKeyOf(docName), sentToCentreAt: null, centreReceivedAt: null, correctionSentAt: null });
