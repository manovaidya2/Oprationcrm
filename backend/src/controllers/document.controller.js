const asyncHandler  = require('express-async-handler');
const StudentDoc    = require('../models/StudentDocument');
const Student       = require('../models/Student');
const Payment       = require('../models/Payment');
const User          = require('../models/User');
const Counselor     = require('../models/Counselor');
const PaymentAccount = require('../models/PaymentAccount');
const InventoryDocument = require('../models/InventoryDocument');
const { findDocumentInStock } = require('./newInventory.controller');
const mongoose      = require('mongoose');
const fs            = require('fs');
const { audit, notify, notifyRole, notifyCounselors } = require('../utils/helpers');
const { findDuplicateUtrMatches } = require('../utils/utrDuplicate');

// Centre Documents tab a request is raised from
const DOC_SECTIONS = ['Marksheet', 'Other'];
// The tab a request belongs to; older requests without one go by their name (same rule as the frontend)
const sectionOf = (section, name) => (DOC_SECTIONS.includes(section) ? section : (/marksheet|transcript/i.test(name || '') ? 'Marksheet' : 'Other'));

// A payment the centre made after the scan stays "Payment_Submitted" after the counselor forwards it; the
// forward is the latest Payment_Submitted history entry (same rule as the frontend's paymentForwarded).
const COUNSELOR_PAYMENT_FORWARD_NOTE = 'Counselor reviewed - forwarded to accountant for verification';
const paymentForwardedToAccountant = doc => {
  const last = [...(doc?.statusHistory || [])].reverse().find(h => h.status === 'Payment_Submitted');
  return /^Counselor reviewed/i.test(last?.note || '');
};

async function loadDoc(id) {
  const doc = await StudentDoc.findById(id)
    .populate('student', 'name center counselor phone email courseName courseYear fatherName enrollmentNumber')
    .populate('center', 'name city state')
    .populate('university', 'name shortName')
    .populate('payments.recordedBy', 'name role')
    .populate('payments.lastUpdatedBy', 'name role')
    .populate('uploadedBy', 'name role')
    .populate('lastUpdatedBy', 'name role')
    .populate('statusHistory.changedBy', 'name role')
    .populate('urgentMarkedBy', 'name role');
  if (!doc) { const e = new Error('Document not found'); e.status = 404; throw e; }
  return doc;
}

function asActionDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function pushHistory(doc, status, user, note = '', at = new Date()) {
  doc.statusHistory.push({ status, changedBy: user._id, at, note });
  doc.status = status;
}

function addHistoryOnly(doc, status, user, note = '', at = new Date()) {
  doc.statusHistory.push({ status, changedBy: user._id, at, note });
}

function isHardCopyRequest(doc) {
  return String(doc.requestType || 'Soft Copy') === 'Hard Copy';
}

function wantsCenterFlow(req) {
  return req.body.actingAsCenter === true || req.body.actingAsCenter === 'true';
}

async function canUseCenterFlow(req, centerId) {
  if (req.user.role === 'Center') return String(centerId) === String(req.user.centerId);
  if (['PaymentCoordinator', 'AdmissionMarker'].includes(req.user.role) && wantsCenterFlow(req)) return true;
  if (!['Counselor', 'ViewerCounselor'].includes(req.user.role) || !wantsCenterFlow(req)) return false;
  const counselor = await Counselor.findById(req.user.counselorId).select('centers').lean();
  return (counselor?.centers || []).some(id => String(id) === String(centerId));
}

function markDocPaymentsVerified(doc, user) {
  let changed = 0;
  doc.payments.forEach(payment => {
    if (!payment.verified) {
      payment.verified = true;
      payment.verifiedBy = user._id;
      payment.verifiedAt = new Date();
      changed += 1;
    }
  });
  return changed;
}

const ADMIN_DOCUMENT_STATUSES = [
  'Requested',
  'Changes_Requested',
  'Forwarded',
  'Fee_Pending',
  'Fee_Rejected',
  'Fee_Approved',
  'Sent_To_University',
  'University_Dispatched',
  'Dispatch_Received',
  'Scanned',
  'Accountant_Received',
  'Counselor_Received',
  'Center_Notified',
  'Payment_Submitted',
  'Payment_Verified',
  'Dispatched',
  'Delivered',
];

const INVENTORY_DOC_NAMES = [
  'Marksheet Year One',
  'Marksheet Year Two',
  'Marksheet Year Three',
  'Marksheet Year Four',
  'Marksheet Year Five',
  'Consolidated Marksheet',
  'Final Marksheet',
  'Degree Certificate',
  'Provisional Certificate',
  'Migration Certificate',
  'Simple Transcript',
  'WES Transcript',
  'Bonafide Certificate',
  'Course Completion Certificate',
  'Medium of Instruction Certificate',
  'Enrollment Certificate',
  'Registration Certificate',
  'Transfer Certificate',
  'Character Certificate',
  'Duplicate Marksheet',
  'Duplicate Degree',
  'Other Certificate - Custom',
  'Entrance Exam Result',
  'Admission Offer Letter',
  'Admission Confirmation Letter',
  'Guide Allotment Letter',
  'Course Work Completion Certificate',
  'Coursework Marksheet',
  'RDC/DRC Letter',
  'Synopsis Approval Letter',
  'Progress Report Acknowledgement',
  'Pre-Thesis Letter',
  'Thesis Approval Letter',
  'Plagiarism Certificate',
  'Viva Examination Notification',
  'Viva Voce Letter',
  'Provisional & Migration Certificate',
  'PhD Notification',
];

const INVENTORY_RECEIVED_OR_DONE_STATUSES = [
  'Dispatch_Received', 'Scanned', 'Accountant_Received', 'Counselor_Received',
  'Center_Notified', 'Payment_Submitted', 'Payment_Verified', 'Dispatched', 'Delivered',
];

const normalizeInventoryDocName = value => String(value || '').trim().toLowerCase();
const isValidObjectId = value => value && value !== 'null' && value !== 'undefined' && mongoose.Types.ObjectId.isValid(String(value));
const docStudentId = doc => {
  const id = doc?.student?._id || doc?.student;
  return isValidObjectId(id) ? String(id) : '';
};

function latestHistoryEntry(doc, status) {
  return [...(doc?.statusHistory || [])].reverse().find(h => h.status === status);
}

function bestDispatchSource(current, next) {
  if (!current) return next;
  const rank = doc => {
    if (doc.status === 'Delivered' || latestHistoryEntry(doc, 'Delivered')) return 4;
    if (doc.status === 'Dispatched' || latestHistoryEntry(doc, 'Dispatched')) return 3;
    if (doc.centerCourierInfo?.trackingNo || doc.centerCourierInfo?.company) return 2;
    return 1;
  };
  const currentRank = rank(current);
  const nextRank = rank(next);
  if (nextRank !== currentRank) return nextRank > currentRank ? next : current;
  return new Date(next.updatedAt || next.createdAt || 0) > new Date(current.updatedAt || current.createdAt || 0) ? next : current;
}

function mergeInventoryDispatchStatus(inventoryDoc, requestDoc) {
  if (!requestDoc) return inventoryDoc;

  const dispatched = latestHistoryEntry(requestDoc, 'Dispatched');
  const delivered = latestHistoryEntry(requestDoc, 'Delivered');
  const requestStatus = delivered || requestDoc.status === 'Delivered'
    ? 'Delivered'
    : dispatched || requestDoc.status === 'Dispatched' || requestDoc.centerCourierInfo
      ? 'Dispatched'
      : null;

  if (!requestStatus) return inventoryDoc;

  const merged = {
    ...inventoryDoc,
    centerCourierInfo: requestDoc.centerCourierInfo || inventoryDoc.centerCourierInfo,
    linkedRequestDocumentId: requestDoc._id,
    linkedRequestDocumentStatus: requestDoc.status,
  };

  if (merged.status !== 'Delivered') {
    merged.status = requestStatus === 'Delivered' ? 'Delivered' : 'Dispatched';
  }

  const existingHistory = Array.isArray(merged.statusHistory) ? merged.statusHistory : [];
  const hasStatus = status => existingHistory.some(h => h.status === status);
  const syncedHistory = [...existingHistory];
  if (dispatched && !hasStatus('Dispatched')) syncedHistory.push(dispatched);
  if (delivered && !hasStatus('Delivered')) syncedHistory.push(delivered);
  merged.statusHistory = syncedHistory.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));

  return merged;
}

// GET /api/documents
exports.list = asyncHandler(async (req, res) => {
  // documents added from the student page (origin 'Added') have their own tabs and are not part of the request / dispatch flow
  // a counselor's direct marksheet requests (origin 'Counselor') have their own pages; the university sees them as requests
  const filter = req.user.role === 'University' ? { origin: { $ne: 'Added' } } : { origin: { $nin: ['Inventory', 'Added', 'Counselor'] } };
  // requests made from the old Document Inventory page (now removed) that still wait for the university:
  // the Inventory team marks them received (into the New Inventory) or closes them — Admin sees them on the
  // Inventory Desk too (and the sidebar badge counts them)
  if (['Dispatch', 'Inventory', 'Admin'].includes(req.user.role)) {
    delete filter.origin;
    filter.$or = [
      { origin: { $nin: ['Inventory', 'Added', 'Counselor'] } },
      { origin: 'Inventory', status: { $in: ['Sent_To_University', 'University_Dispatched', 'Closed'] } },
    ];
  }
  if (isValidObjectId(req.query.studentId)) filter.student = req.query.studentId;

  const { role, centerId, counselorId, universityId } = req.user;
  if (role === 'Center') {
    filter.center = centerId;
  }
  if (['Counselor', 'ViewerCounselor'].includes(role))  {
    const counselorDoc = await Counselor.findById(counselorId).select('centers').lean();
    const linkedCenterIds = counselorDoc?.centers || [];
    if (linkedCenterIds.length > 0) {
      filter.$or = [{ counselor: counselorId }, { center: { $in: linkedCenterIds } }];
    } else {
      filter.counselor = counselorId;
    }
    if (!req.query.studentId && !req.query.all) {
      filter.status = { $in: ['Requested','Changes_Requested','Forwarded','Fee_Pending','Fee_Rejected','Counselor_Received','Center_Notified','Payment_Submitted','Payment_Verified','Dispatched','Delivered'] };
    }
  }
  // HARD ISOLATION: University user only sees documents for their own university
  // Skip filter if universityId is null (legacy users — show all, admin can fix)
  if (role === 'University' && universityId) {
    filter.university = universityId;
  }
  // a request answered from the New Inventory never went to the university, nor one the Inventory team has not asked for yet
  if (role === 'University') { filter.inventoryItem = null; filter.status = { $ne: 'With_Inventory' }; }

  const bypassStatus = req.query.all && ['Admin','Counselor','ViewerCounselor','Accountant','Dispatch','Inventory','University'].includes(role);

  if (!bypassStatus) {
    if (role === 'Accountant') filter.status = { $in: ['Forwarded','Fee_Pending','Payment_Submitted','Accountant_Reviewed','Accountant_Received'] };
    if (role === 'University') filter.status = { $in: [
      'Fee_Approved', 'Sent_To_University',
      'University_Dispatched', 'Dispatch_Received', 'Scanned',
      'Accountant_Received', 'Counselor_Received', 'Center_Notified',
      'Payment_Submitted', 'Payment_Verified', 'Dispatched', 'Delivered'
    ] };
    if (role === 'Dispatch')   filter.status = { $in: ['Payment_Verified','Dispatched','Delivered'] };
    if (role === 'Inventory')  filter.status = { $in: ['Sent_To_University','University_Dispatched','Dispatch_Received','Scanned','Counselor_Received','Center_Notified','Payment_Submitted','Payment_Verified','Dispatched','Delivered','Closed'] };
  }

  const docs = await StudentDoc.find(filter)
    .populate('student', 'name enrollmentNumber courseName')
    .populate('center', 'name')
    .populate('university', 'name shortName')
    .populate('payments.recordedBy', 'name role')
    .populate('payments.lastUpdatedBy', 'name role')
    .populate('uploadedBy', 'name role')
    .populate('lastUpdatedBy', 'name role')
    .populate('statusHistory.changedBy', 'name role')
    .populate('urgentMarkedBy', 'name role')
    .populate('closedBy', 'name role')
    .sort('-createdAt')
    .lean();

  const studentIds = [...new Set(docs.map(docStudentId).filter(Boolean))];
  const payments = await Payment.find({ student: { $in: studentIds } })
    .select('student totalFee discount netFee paidAmount dueAmount')
    .lean();
  const paymentMap = payments.reduce((acc, payment) => {
    acc[String(payment.student)] = {
      totalFee: payment.totalFee || 0,
      discount: payment.discount || 0,
      netFee: payment.netFee || 0,
      paidAmount: payment.paidAmount || 0,
      dueAmount: payment.dueAmount || 0,
    };
    return acc;
  }, {});

  // answered from a New Inventory document that is not correction checked yet: it waits for the check
  const heldIds = docs.filter(d => d.status === 'Dispatch_Received' && d.inventoryItem && !d.correctionCheckedAt && !d.inventoryCheckPending).map(d => d.inventoryItem);
  if (heldIds.length) {
    const unchecked = new Set((await InventoryDocument.find({ _id: { $in: heldIds }, correctionCheckedAt: null }).select('_id').lean()).map(i => String(i._id)));
    docs.forEach(d => { if (d.status === 'Dispatch_Received' && d.inventoryItem && !d.correctionCheckedAt && unchecked.has(String(d.inventoryItem))) d.inventoryCheckPending = true; });
  }

  // the university gets only the document asked for — not whether the centre wants a soft or hard copy
  res.json(docs.map(({ requestType, ...doc }) => ({
    ...doc,
    ...(role === 'University' ? {} : { requestType }),
    courseFeeSummary: paymentMap[docStudentId(doc)] || null,
  })));
});

exports.get = asyncHandler(async (req, res) => {
  res.json(await loadDoc(req.params.id));
});

// A centre's "Other Documents" request must carry its full payment (the whole charge): amount, mode, UTR, UPI / bank details,
// the account it was paid into (when accounts are set up) and the screenshot. Returns the account label.
async function assertOtherDocPayment(body, screenshot) {
  const bad = msg => { const e = new Error(msg); e.status = 400; throw e; };
  const charge = Number(body.chargeFee) || 0;
  const amount = Number(body.paymentAmount) || 0;
  const utr = String(body.paymentUtrRef || '').trim();
  if (!(charge > 0)) bad('Enter the document charge');
  if (!(amount > 0)) bad('Other documents can be requested only with their payment — enter the amount paid');
  if (amount > charge + 0.01) bad('Amount paid is more than the document charge');
  if (amount < charge - 0.01) bad(`Pay the full charge of ₹${charge} — other documents are requested only when fully paid`);
  if (!['UPI', 'Bank Transfer'].includes(body.paymentMode)) bad('Choose the payment mode');
  if (!utr) bad('UTR / reference number is required');
  if (body.paymentMode === 'UPI' && !String(body.paymentUpiId || '').trim()) bad('UPI ID is required');
  if (body.paymentMode === 'Bank Transfer' && (!String(body.paymentBankName || '').trim() || !String(body.paymentAccountHolder || '').trim())) {
    bad('Bank name and account holder are required');
  }
  let accountLabel = '';
  if (isValidObjectId(body.paymentPaidToAccount)) {
    const acc = await PaymentAccount.findById(body.paymentPaidToAccount).select('label').lean();
    if (!acc) bad('The account the payment was made to was not found');
    accountLabel = acc.label;
  } else if (await PaymentAccount.exists({ isActive: { $ne: false } })) {
    bad('Choose the account the payment was made to');
  }
  if (!screenshot) bad('Payment screenshot is required');
  if ((await findDuplicateUtrMatches(utr)).length) { const e = new Error('This UTR is already recorded on another payment'); e.status = 409; throw e; }
  return accountLabel;
}

// POST /api/documents - Center creates doc request; a centre's Other Documents request needs its payment
exports.create = asyncHandler(async (req, res) => {
  const docFile = req.files?.file?.[0];
  const screenshot = req.files?.paymentScreenshot?.[0];
  try {
    await createDocRequest(req, res, docFile, screenshot);
  } catch (e) {
    // the request was refused: drop the files multer already saved
    for (const f of [docFile, screenshot]) if (f) fs.unlink(f.path, () => {});
    throw e;
  }
});

async function createDocRequest(req, res, docFile, screenshot) {
  const {
    studentId, type, note, chargeFee, requestType, section,
    paymentAmount, paymentMode, paymentUtrRef, paymentDate, paymentNote,
    paymentUpiId, paymentBankName, paymentAccountHolder, paymentAccountNumber, paymentIfscCode,
    paymentPaidToAccount, paymentPaidToAccountLabel,
  } = req.body;
  const name = String(req.body.name || '').trim();
  if (!name) { const e = new Error('Document name is required'); e.status = 400; throw e; }
  const student = await Student.findById(studentId);
  if (!student) { const e = new Error('Student not found'); e.status = 404; throw e; }
  const centerOriginated = await canUseCenterFlow(req, student.center);
  if (req.user.role === 'ViewerCounselor' && !centerOriginated) {
    const e = new Error('Viewer counselors can request documents only from center view'); e.status = 403; throw e;
  }

  if ((req.user.role === 'Center' || wantsCenterFlow(req)) && !centerOriginated) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  if (req.user.role === 'AdmissionMarker' && sectionOf(section, name) !== 'Other') {
    const e = new Error('Admission Marker can request other documents only'); e.status = 403; throw e;
  }
  // marksheets: only the counselor, from the centre panel
  if (sectionOf(section, name) === 'Marksheet' && !(req.user.role === 'Counselor' && centerOriginated) && req.user.role !== 'Admin') {
    const e = new Error('Marksheets are requested by the counselor only, from the centre panel'); e.status = 403; throw e;
  }
  // other documents are requested from the centre panel only (with their payment) — not from the student page
  if (sectionOf(section, name) === 'Other' && !centerOriginated && req.user.role !== 'Admin') {
    const e = new Error('Other documents are requested from the centre panel, together with their full payment'); e.status = 403; throw e;
  }
  if (centerOriginated && student.applicationStatus === 'Cancelled') {
    const e = new Error('This application has been cancelled. No document requests are allowed.'); e.status = 403; throw e;
  }
  if (centerOriginated && student.applicationStatus !== 'Enrolled') {
    const e = new Error('Document requests only after enrollment'); e.status = 400; throw e;
  }
  const paymentRequired = centerOriginated && sectionOf(section, name) === 'Other';
  const accountLabel = paymentRequired ? await assertOtherDocPayment(req.body, screenshot) : '';

  const doc = new StudentDoc({
    student: studentId, center: student.center, counselor: student.counselor,
    university: student.university,
    name, type: type||'', note: note||'',
    requestType: requestType === 'Hard Copy' ? 'Hard Copy' : 'Soft Copy',
    section: DOC_SECTIONS.includes(section) ? section : undefined,
    origin: 'Request',
    chargeFee: sectionOf(section, name) === 'Marksheet' ? 0 : (Number(chargeFee) || 0),   // a marksheet has no charge
    uploadedBy: req.user._id, status: 'Requested',
    statusHistory: [{ status: 'Requested', changedBy: req.user._id, at: new Date() }],
  });

  if (docFile) { doc.fileUrl = `/uploads/${docFile.filename}`; doc.sizeKb = Math.round(docFile.size/1024); }

  const paidAmount = Number(paymentAmount) || 0;
  if (paidAmount > 0) {
    const validMode = ['UPI','Bank Transfer'].includes(paymentMode) ? paymentMode : 'UPI';
    doc.payments.push({
      amount: paidAmount, mode: validMode,
      upiId: String(paymentUpiId||'').trim(), utrRef: String(paymentUtrRef||'').trim(),
      bankName: paymentBankName||'', accountHolder: paymentAccountHolder||'',
      accountNumber: paymentAccountNumber||'', ifscCode: paymentIfscCode||'',
      note: paymentNote||'',
      paidAt: paymentDate ? new Date(paymentDate) : new Date(),
      recordedBy: req.user._id,
      lastUpdatedBy: req.user.role === 'ViewerCounselor' ? req.user._id : undefined,
      lastUpdatedAt: req.user.role === 'ViewerCounselor' ? new Date() : undefined,
      paidToAccount: isValidObjectId(paymentPaidToAccount) ? paymentPaidToAccount : undefined,
      paidToAccountLabel: accountLabel || paymentPaidToAccountLabel || '',
      paymentScreenshot: screenshot ? `/uploads/${screenshot.filename}` : '',
    });
    doc.statusHistory.push({ status: 'Requested', changedBy: req.user._id, at: new Date(), note: `Payment of ₹${paidAmount} attached at request time` });
  }

  // Request + payment submitted together (soft OR hard copy) travel as one document.
  // The doc stays in "Requested" and shows, with its payment, on one card in the counselor's
  // Marksheet / Other Doc Requests tab; approving it forwards both (see the `payments.0 exists`
  // clauses in the accountant docpayments queue, and markDocPaymentsVerified inside accountantAction).

  await doc.save();

  await notifyCounselors({ counselorId: student.counselor, centerId: student.center }, {
    message: paidAmount > 0
      ? `Doc request with payment: "${name}" for ${student.name} — ₹${paidAmount} paid`
      : `Document request: "${name}" for ${student.name}`,
    type: paidAmount > 0 ? 'doc_payment_received' : 'doc_requested',
    studentId, documentId: doc._id,
  });
  await audit('doc_requested', 'StudentDocument', doc._id, req.user, { name }, `Doc request: ${name}`);
  res.status(201).json(doc);
}

// PATCH /api/documents/:id/urgent { urgent } — the counselor marks an Other Documents request urgent, or back to normal
exports.setUrgent = asyncHandler(async (req, res) => {
  const urgent = req.body.urgent === true || req.body.urgent === 'true';
  const doc = await StudentDoc.findById(req.params.id);
  // a centre's request, or a counselor's direct marksheet request to the Inventory team
  if (!doc || !['Request', 'Counselor'].includes(doc.origin)) { const e = new Error('Document request not found'); e.status = 404; throw e; }
  const direct = doc.origin === 'Counselor';
  if (req.user.role === 'Counselor' && String(doc.counselor) !== String(req.user.counselorId) && !(direct && String(doc.uploadedBy) === String(req.user._id))) {
    // any counselor working on the document's centre
    const me = await Counselor.findById(req.user.counselorId).select('centers').lean();
    if (!(me?.centers || []).some(id => String(id) === String(doc.center))) { const e = new Error('Forbidden'); e.status = 403; throw e; }
  }
  if (!direct && sectionOf(doc.section, doc.name) !== 'Other') { const e = new Error('Only other document requests can be marked urgent'); e.status = 400; throw e; }
  if (doc.status === 'Delivered') { const e = new Error('This document is already delivered'); e.status = 400; throw e; }
  if (direct && ['In_Inventory', 'Closed'].includes(doc.status)) { const e = new Error(doc.status === 'Closed' ? 'This request is closed' : 'This marksheet is already in the New Inventory'); e.status = 400; throw e; }
  if (!!doc.urgent === urgent) return res.json(await loadDoc(doc._id));

  doc.urgent = urgent;
  doc.urgentMarkedBy = req.user._id;
  doc.urgentMarkedAt = new Date();
  addHistoryOnly(doc, urgent ? 'Marked_Urgent' : 'Marked_Normal', req.user, urgent ? 'Marked as an urgent request' : 'Urgent mark removed');
  await doc.save();
  await audit(urgent ? 'doc_marked_urgent' : 'doc_marked_normal', 'StudentDocument', doc._id, req.user, { urgent }, `${doc.name}: ${urgent ? 'marked urgent' : 'urgent mark removed'}`);
  const fresh = await loadDoc(doc._id);
  // a counselor's direct marksheet request: the Inventory team hears it is urgent
  if (urgent && direct) {
    await notifyRole('Inventory', {
      message: `Urgent marksheet request: "${doc.name}" - ${fresh.student?.name || ''} (marked by ${req.user.name || 'the counselor'})`,
      type: 'doc_forwarded', documentId: doc._id, studentId: fresh.student?._id, role: 'Inventory',
    });
  }
  // already waiting at the university: tell them it moved to their Urgent Requests
  if (urgent && doc.status === 'Sent_To_University' && !doc.inventoryItem && doc.university) {
    const uniUsers = await User.find({ role: 'University', universityId: doc.university, isActive: true }).select('_id').lean();
    if (uniUsers.length) await notify(uniUsers.map(u => u._id), {
      message: `Urgent document request: "${doc.name}" - Student: ${fresh.student?.name || ''}`,
      type: 'doc_forwarded', documentId: doc._id, studentId: fresh.student?._id, role: 'University',
    });
  }
  res.json(fresh);
});

exports.update = asyncHandler(async (req, res) => {
  const doc = await StudentDoc.findById(req.params.id);
  if (!doc) { const e = new Error('Not found'); e.status = 404; throw e; }
  const centerOriginated = await canUseCenterFlow(req, doc.center);
  if (req.user.role === 'ViewerCounselor' && !centerOriginated) {
    const e = new Error('Viewer counselors can edit documents only from center view'); e.status = 403; throw e;
  }
  if ((req.user.role === 'Center' || wantsCenterFlow(req)) && !centerOriginated) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  if (['Counselor', 'ViewerCounselor'].includes(req.user.role) && !centerOriginated && String(doc.counselor) !== String(req.user.counselorId)) {
    // Any counselor working on the document's centre may edit it, not only the student's main counselor
    const me = await Counselor.findById(req.user.counselorId).select('centers').lean();
    if (!(me?.centers || []).some(id => String(id) === String(doc.center))) {
      const e = new Error('Forbidden'); e.status = 403; throw e;
    }
  }
  if (centerOriginated) {
    const editableBeforeScan = ['Requested', 'Changes_Requested', 'Forwarded', 'Fee_Pending', 'Fee_Approved', 'Sent_To_University', 'University_Dispatched', 'Dispatch_Received'];
    if (!editableBeforeScan.includes(doc.status) || doc.scannedUrl) {
      const e = new Error('Document request cannot be edited after scan is uploaded'); e.status = 400; throw e;
    }
  }
  if (req.body.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) { const e = new Error('Document name is required'); e.status = 400; throw e; }
    doc.name = name;
  }
  if (DOC_SECTIONS.includes(req.body.section)) doc.section = req.body.section;
  if (req.body.type !== undefined)      doc.type      = req.body.type;
  if (req.body.note !== undefined)      doc.note      = req.body.note;
  if (req.body.requestType !== undefined) doc.requestType = req.body.requestType === 'Hard Copy' ? 'Hard Copy' : 'Soft Copy';
  // a marksheet has no charge (only Admin can still change an older one's)
  if (req.body.chargeFee !== undefined && (sectionOf(doc.section, doc.name) !== 'Marksheet' || req.user.role === 'Admin')) doc.chargeFee = Number(req.body.chargeFee);
  if (req.file) { doc.fileUrl = `/uploads/${req.file.filename}`; doc.sizeKb = Math.round(req.file.size/1024); }
  if (req.user.role === 'Admin') {
    if (req.body.verifyPayments === true || req.body.verifyPayments === 'true') {
      const verifiedPayments = markDocPaymentsVerified(doc, req.user);
      if (verifiedPayments > 0) addHistoryOnly(doc, 'Payment_Verified', req.user, `${verifiedPayments} document payment${verifiedPayments > 1 ? 's' : ''} verified by Admin`);
    }
    if (req.body.status && ADMIN_DOCUMENT_STATUSES.includes(req.body.status) && req.body.status !== doc.status) {
      pushHistory(doc, req.body.status, req.user, req.body.statusNote || 'Document status updated by Admin');
      if (req.body.status === 'Payment_Verified') markDocPaymentsVerified(doc, req.user);
    }
    doc.lastUpdatedBy = req.user._id;
    doc.lastUpdatedAt = new Date();
  }
  if (req.user.role === 'ViewerCounselor' && centerOriginated) {
    doc.lastUpdatedBy = req.user._id;
    doc.lastUpdatedAt = new Date();
  }
  if (centerOriginated && doc.status === 'Changes_Requested') {
    pushHistory(doc, 'Requested', req.user, 'Center updated document request after changes were requested');
  }
  await doc.save();
  res.json(await loadDoc(doc._id));
});

exports.requestChanges = asyncHandler(async (req, res) => {
  const { note } = req.body;
  if (!String(note || '').trim()) { const e = new Error('Note is required'); e.status = 400; throw e; }
  const doc = await loadDoc(req.params.id);
  const allowedStatuses = req.user.role === 'Accountant'
    ? ['Forwarded', 'Fee_Pending']
    : ['Requested', 'Forwarded', 'Fee_Pending'];
  if (!allowedStatuses.includes(doc.status)) {
    const e = new Error('Document request cannot be sent back at this stage'); e.status = 400; throw e;
  }

  pushHistory(doc, 'Changes_Requested', req.user, note.trim());
  await doc.save();

  const centerUser = await User.findOne({ centerId: doc.center?._id || doc.center, role: 'Center', isActive: true });
  if (centerUser) await notify(centerUser._id, {
    message: `Changes requested for document "${doc.name}" - ${doc.student?.name}: ${note.trim()}`,
    type: 'doc_changes_requested',
    documentId: doc._id,
    studentId: doc.student?._id,
    role: 'Center',
  });
  await audit('doc_changes_requested', 'StudentDocument', doc._id, req.user, { note }, `Document request sent back to center`);
  res.json(await loadDoc(doc._id));
});

// Counselor forwards to accountant
exports.forward = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  // BUG FIX: Only 'Requested' status can be forwarded.
  // Payment_Submitted is no longer set at create time.
  if (doc.status !== 'Requested') {
    const e = new Error('Document must be in Requested status to forward'); e.status = 400; throw e;
  }
  // an other document goes ahead only with its whole charge paid
  const paidSoFar = (doc.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  if (sectionOf(doc.section, doc.name) === 'Other' && Number(doc.chargeFee) > 0 && paidSoFar < Number(doc.chargeFee) - 0.01) {
    const e = new Error(`Not fully paid (₹${paidSoFar} of ₹${doc.chargeFee}). Other documents go ahead only when the full charge is paid — send it back to the centre to pay the rest.`);
    e.status = 400; throw e;
  }
  pushHistory(doc, 'Forwarded', req.user, 'Forwarded to accountant for fee check');
  await doc.save();
  const hasPrepayment = doc.payments.length > 0;
  const msg = hasPrepayment
    ? `Doc fee check (payment attached): "${doc.name}" for ${doc.student?.name}`
    : `Doc fee check: "${doc.name}" for ${doc.student?.name}`;
  await notifyRole('Accountant', { message: msg, type: 'doc_forwarded', documentId: doc._id, studentId: doc.student?._id, role: 'Accountant' });
  await audit('doc_forwarded', 'StudentDocument', doc._id, req.user, {}, `Forwarded to accountant`);
  res.json(doc);
});
exports.accountantAction = asyncHandler(async (req, res) => {
  const { action, note } = req.body;
  const doc = await loadDoc(req.params.id);
  if (!['Forwarded','Fee_Pending'].includes(doc.status)) {
    const e = new Error('Not in accountant queue'); e.status = 400; throw e;
  }

  let inStock = null;   // the New Inventory document (marksheet or other) that answers an approved request
  if (action === 'approve') {
    pushHistory(doc, 'Fee_Approved', req.user, note||'');
    const verifiedPayments = markDocPaymentsVerified(doc, req.user);
    const paidTotal = doc.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    doc.totalPaid = paidTotal;
    const fullyPaid = doc.chargeFee <= 0 || paidTotal >= doc.chargeFee;
    // Soft and hard copy go the same way up to the correction check. Held in the New Inventory for this student:
    // not asked of the university — one still waiting for its correction check goes to Inventory's Correction Check,
    // a checked one straight on (soft copy: Upload Scan; hard copy: Ready to dispatch). Not held: asked of the
    // university, and it comes to Inventory's request tabs.
    inStock = await findDocumentInStock(docStudentId(doc), sectionOf(doc.section, doc.name), doc.name);
    if (inStock) {
      doc.inventoryItem = inStock._id;
      doc.inventoryMatchedAt = new Date();
      // it goes on only once that document is correction checked; otherwise to the correction check first
      doc.inventoryCheckPending = !!inStock.correctionCheckPending || !inStock.correctionCheckedAt;
      addHistoryOnly(doc, 'Inventory_Matched', req.user, 'Found in the New Inventory - not requested from the university');
    }
    if (inStock && doc.inventoryCheckPending) {
      doc.status = 'Dispatch_Received';
      doc.statusHistory.push({ status: 'Dispatch_Received', changedBy: req.user._id, at: new Date(), note: 'Document is in the New Inventory - Inventory to check it for corrections' });
    } else if (inStock && isHardCopyRequest(doc) && fullyPaid) {
      doc.status = 'Payment_Verified';
      doc.statusHistory.push({ status: 'Payment_Verified', changedBy: req.user._id, at: new Date(), note: `Hard copy in the New Inventory (correction checked)${verifiedPayments > 0 ? ', payment verified' : ''} - ready for dispatch` });
    } else if (inStock && isHardCopyRequest(doc)) {   // older requests not paid in full: the centre pays first
      doc.status = 'Center_Notified';
      doc.statusHistory.push({ status: 'Center_Notified', changedBy: req.user._id, at: new Date(), note: 'Hard copy in the New Inventory - payment required before dispatch' });
    } else if (inStock) {
      doc.status = 'Dispatch_Received';
      doc.statusHistory.push({ status: 'Dispatch_Received', changedBy: req.user._id, at: new Date(), note: 'Document is in the New Inventory - Inventory to scan and upload' });
    } else if (sectionOf(doc.section, doc.name) === 'Marksheet') {
      doc.status = 'With_Inventory';
      doc.statusHistory.push({ status: 'With_Inventory', changedBy: req.user._id, at: new Date(), note: 'Marksheet not in the New Inventory - Inventory to request it from the university' });
    } else {
      doc.status = 'Sent_To_University';
      doc.statusHistory.push({ status: 'Sent_To_University', changedBy: req.user._id, at: new Date(), note: `Requested from the university (${isHardCopyRequest(doc) ? 'hard' : 'soft'} copy) - Inventory to receive it` });
    }
    // Ready to dispatch: Dispatch hears. Coming from the university, or in the New Inventory to check / scan: the
    // Inventory team hears (it confirms receipt). Waiting for the centre's payment: nobody yet.
    if (doc.status === 'Payment_Verified') await notifyRole('Dispatch', {
      message: `Ready to dispatch to the centre: "${doc.name}" — Student: ${doc.student?.name}`,
      type: 'payment_verified', documentId: doc._id, studentId: doc.student?._id, role: 'Dispatch',
    });
    else if (doc.status !== 'Center_Notified') await notifyRole('Inventory', {
      message: inStock
        ? `In the New Inventory: "${doc.name}" — Student: ${doc.student?.name}. ${doc.inventoryCheckPending ? 'Please check it for corrections.' : 'Please scan and upload it.'}`
        : doc.status === 'With_Inventory'
          ? `Marksheet to request from the university: "${doc.name}" — Student: ${doc.student?.name} (not in the New Inventory)`
          : `Courier expected from University for "${doc.name}" — Student: ${doc.student?.name}. Please confirm receipt when it arrives.`,
      type: 'doc_forwarded', documentId: doc._id, studentId: doc.student?._id, role: 'Inventory',
    });
    if (doc.status === 'Center_Notified') {   // (after a correction check, the check asks the centre)
      const centerUser = await User.findOne({ centerId: doc.center, role: 'Center', isActive: true });
      if (centerUser) await notify(centerUser._id, {
        message: `Payment required for hard copy document "${doc.name}" - ${doc.student?.name}`,
        type: 'doc_payment_required', documentId: doc._id, studentId: doc.student?._id, role: 'Center',
      });
    }
  } else if (action === 'reject') {
    pushHistory(doc, 'Fee_Rejected', req.user, note||'Fee rejected by accountant');
    // Notify COUNSELOR — they decide whether to send back to center or re-forward
    await notifyCounselors({ counselorId: doc.counselor, centerId: doc.center }, {
      message: `Accountant rejected doc fee: "${doc.name}" for ${doc.student?.name}. Reason: ${note||'Fee issue'}. Please review and decide next action.`,
      type: 'doc_fee_rejected', documentId: doc._id,
    });
  } else {
    // pending - keep in queue
    pushHistory(doc, 'Fee_Pending', req.user, note||'Fees not cleared');
  }
  await doc.save();
  if (inStock) {
    // the inventory document remembers the request it answered (once, even if the request is approved again)
    await InventoryDocument.updateOne({ _id: inStock._id, 'matches.request': { $ne: doc._id } }, { $push: { matches: { request: doc._id, at: doc.inventoryMatchedAt, by: req.user._id } } });
  }
  await audit('accountant_doc_action', 'StudentDocument', doc._id, req.user, { action, note, inventoryItem: inStock?._id }, `Accountant ${action}${inStock ? ' (found in the New Inventory)' : ''}`);
  res.json(doc);
});

// University confirms dispatch (sends the courier to the Inventory team)
exports.universityDispatch = asyncHandler(async (req, res) => {
  const { company, trackingNo, dispatchDate, documentsDesc } = req.body;
  
  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Sent_To_University') { const e = new Error('Must be Sent_To_University status'); e.status = 400; throw e; }

  // Store university courier info in courierInfo temporarily
  doc.courierInfo = { company: company||'', trackingNo: trackingNo || '', dispatchDate: dispatchDate ? new Date(dispatchDate) : new Date(), documentsDesc: documentsDesc||'', sentBy: req.user._id, sentAt: new Date() };
  pushHistory(doc, 'University_Dispatched', req.user, `University sent via ${company||''} - ${trackingNo}`);
  await doc.save();
  await notifyRole('Inventory', { message: `Courier incoming from University: "${doc.name}" - ${trackingNo}`, type: 'doc_forwarded', documentId: doc._id, role: 'Inventory' });
  await audit('university_dispatched', 'StudentDocument', doc._id, req.user, { trackingNo }, `University dispatched ${doc.name}`);
  res.json(doc);
});

// ── Inventory: received from the university ──────────────────
// The Inventory team marks one or many requests received (the date it arrived, the courier if known). The request moves
// on to Upload Scan, the university portal lists it as Sent with that date, and the document goes into the
// student's New Inventory (held in the office).
const RECEIVABLE_STATUSES = ['Sent_To_University', 'University_Dispatched'];

function receivedDateOf(value) {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) { const e = new Error('Invalid received date'); e.status = 400; throw e; }
  // a date picked "today" in India can be a little ahead of the server's clock: that is today, now
  if (date.getTime() > Date.now() + 36 * 3600 * 1000) { const e = new Error('The received date cannot be in the future'); e.status = 400; throw e; }
  return date.getTime() > Date.now() ? new Date() : date;
}

function receiptOptions(body = {}) {
  const text = (v, max) => String(v || '').trim().slice(0, max);
  return { receivedAt: receivedDateOf(body.receivedAt), company: text(body.company, 80), trackingNo: text(body.trackingNo, 80), note: text(body.note, 300) };
}

async function receiveFromUniversity(doc, user, { receivedAt, company, trackingNo, note }) {
  if (doc.status === 'Sent_To_University') {
    pushHistory(doc, 'University_Dispatched', user, 'Sent by the university', receivedAt);
  }
  if (company || trackingNo) {   // the courier it came by (kept with any details the university gave)
    const ci = doc.courierInfo ? doc.courierInfo.toObject() : {};
    doc.courierInfo = {
      ...ci,
      company: company || ci.company || '',
      trackingNo: trackingNo || ci.trackingNo || '',
      documentsDesc: ci.documentsDesc || note || '',
      sentBy: ci.sentBy || user._id,
      sentAt: ci.sentAt || new Date(),
    };
  }
  doc.receivedFromUniversityAt = receivedAt;
  doc.receivedFromUniversityBy = user._id;
  doc.correctionCheckedAt = undefined;   // every copy that arrives is checked (a corrected one again)
  doc.correctionCheckedBy = undefined;
  const what = doc.correctionOpen ? 'Corrected copy received from the university' : 'Received from the university';
  const courier = [company, trackingNo].filter(Boolean).join(' - ');
  pushHistory(doc, 'Dispatch_Received', user, [what, courier && `Courier: ${courier}`, note].filter(Boolean).join(' · '), receivedAt);

  const itemId = await inventoryEntryFor(doc, user, receivedAt);
  await doc.save();
  if (itemId) await logInventory(itemId, what, user, courier ? `Courier: ${courier}` : '',
    { $set: { correctionCheckPending: true }, $unset: { correctionSentAt: 1, correctionCheckedAt: 1, correctionCheckedBy: 1 } }, receivedAt);
}

// a line in the New Inventory entry's log (plus any other change to the entry)
async function logInventory(itemId, action, user, note = '', extra = {}, at = new Date()) {
  try {
    await InventoryDocument.updateOne({ _id: itemId }, { ...extra, $push: { log: { action, at, by: user?._id, note: note || undefined } } });
  } catch (e) {
    console.error('New Inventory log failed', itemId, e.message);
  }
}

// The New Inventory entry holding this request's document: the one it was answered from, the one it went into
// when received, or (received before receipts went into the inventory) a new one now. Once per document name
// in a student's tab: an entry already there is used. Sets doc.receivedIntoInventory; the caller saves doc.
async function inventoryEntryFor(doc, user, receivedAt = new Date()) {
  const linked = doc.inventoryItem || doc.receivedIntoInventory;
  if (linked && await InventoryDocument.exists({ _id: linked._id || linked })) return linked._id || linked;
  const studentId = docStudentId(doc);
  if (!studentId) return null;
  const section = sectionOf(doc.section, doc.name);
  const key = { student: studentId, section, nameKey: InventoryDocument.nameKeyOf(doc.name) };
  let item = await InventoryDocument.findOne(key).select('_id').lean();
  if (!item) {
    try {
      item = await InventoryDocument.create({
        student: studentId, center: doc.center?._id || doc.center, section, name: doc.name,
        note: 'Received from the university', addedBy: user._id, fromRequest: doc._id, receivedAt,
      });
    } catch (e) {
      if (e.code !== 11000) throw e;
      item = await InventoryDocument.findOne(key).select('_id').lean();
    }
  }
  doc.receivedIntoInventory = item?._id;
  return item?._id || null;
}

// when the document reached the office from the university (older receipts: the history)
const receivedAtOf = doc => doc.receivedFromUniversityAt
  || [...(doc.statusHistory || [])].reverse().find(h => h.status === 'Dispatch_Received')?.at || new Date();

// The request was couriered to the centre ('sent') / the centre has it ('received'): its New Inventory entry
// shows that (the entry is made if the document never went in). Never blocks the step itself. Caller saves doc.
async function noteCentreStep(doc, user, step, at = new Date()) {
  try {
    const itemId = await inventoryEntryFor(doc, user, receivedAtOf(doc));
    if (!itemId) return;
    const set = step === 'received'
      ? { centreReceivedAt: at, centreReceivedBy: user._id }
      : { sentToCentreAt: at, sentToCentreBy: user._id };
    await logInventory(itemId, step === 'received' ? 'Received by the centre' : 'Sent to the centre', user, '',
      step === 'received' ? { $set: set } : { $set: set, $unset: { centreReceivedAt: 1, centreReceivedBy: 1 } }, at);
  } catch (e) {
    console.error('New Inventory update failed', doc?._id, e.message);
  }
}

// PATCH /documents/:id/dispatch-receive { receivedAt?, company?, trackingNo?, note? }
exports.dispatchReceive = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  // Now dispatch can confirm receipt from either University_Dispatched OR Sent_To_University
  if (!RECEIVABLE_STATUSES.includes(doc.status)) {
    const e = new Error('Must be Sent_To_University or University_Dispatched status'); e.status = 400; throw e;
  }
  const opts = receiptOptions(req.body);
  await receiveFromUniversity(doc, req.user, opts);

  // Notify university users that their courier was received (by the Inventory team)
  const uniId = doc.university?._id || doc.university;
  if (uniId) {
    const uniUsers = await User.find({ role: 'University', universityId: uniId, isActive: true }).select('_id').lean();
    for (const u of uniUsers) {
      await notify(u._id, {
        message: `Inventory confirmed receipt of your courier for "${doc.name}" (Student: ${doc.student?.name})`,
        type: 'doc_forwarded', documentId: doc._id, studentId: doc.student?._id, role: 'University',
      });
    }
  } else {
    // Legacy — notify all university users
    await notifyRole('University', {
      message: `Inventory confirmed receipt of courier for "${doc.name}" (Student: ${doc.student?.name})`,
      type: 'doc_forwarded', documentId: doc._id, role: 'University',
    });
  }

  await audit('dispatch_received', 'StudentDocument', doc._id, req.user, { receivedAt: opts.receivedAt, inventory: doc.receivedIntoInventory }, `Courier received for ${doc.name}`);
  res.json(doc);
});

// POST /documents/dispatch-receive { ids, receivedAt?, company?, trackingNo?, note? } — several at once.
// Each request is done on its own: one that is no longer waiting is reported back, the rest still go through.
exports.dispatchReceiveMany = asyncHandler(async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : []).map(String))].filter(isValidObjectId);
  if (!ids.length) { const e = new Error('Select the documents received'); e.status = 400; throw e; }
  if (ids.length > 200) { const e = new Error('Mark at most 200 documents at a time'); e.status = 400; throw e; }
  const opts = receiptOptions(req.body);

  const received = [];
  const failed = [];
  for (const id of ids) {
    try {
      const doc = await loadDoc(id);
      if (!RECEIVABLE_STATUSES.includes(doc.status)) {
        failed.push({ id, name: doc.name, error: 'No longer waiting for the university' });
        continue;
      }
      await receiveFromUniversity(doc, req.user, opts);
      received.push(doc);
      await audit('dispatch_received', 'StudentDocument', doc._id, req.user, { receivedAt: opts.receivedAt, inventory: doc.receivedIntoInventory, bulk: true }, `Courier received for ${doc.name}`);
    } catch (e) {
      failed.push({ id, error: e.message });
    }
  }

  // one notification per university for the whole batch
  const byUniversity = new Map();
  received.forEach(doc => {
    const uniId = String(doc.university?._id || doc.university || '');
    if (!uniId) return;
    if (!byUniversity.has(uniId)) byUniversity.set(uniId, []);
    byUniversity.get(uniId).push(doc);
  });
  for (const [uniId, docs] of byUniversity) {
    const uniUsers = await User.find({ role: 'University', universityId: uniId, isActive: true }).select('_id').lean();
    if (!uniUsers.length) continue;
    await notify(uniUsers.map(u => u._id), docs.length === 1
      ? { message: `Inventory received "${docs[0].name}" (Student: ${docs[0].student?.name}) - marked Sent`, type: 'doc_forwarded', documentId: docs[0]._id, studentId: docs[0].student?._id, role: 'University' }
      : { message: `Inventory received ${docs.length} documents from you - marked Sent`, type: 'doc_forwarded', role: 'University' });
  }

  res.json({ received: received.map(d => String(d._id)), failed });
});

// ── Inventory: ask the university for marksheets not in the New Inventory ──
// POST /documents/request-from-university { ids } — With_Inventory -> Sent_To_University (the university's Marksheet
// Requests tab). The university hears once per batch; a counselor's direct request tells that counselor too.
exports.requestFromUniversity = asyncHandler(async (req, res) => {
  const asked = [];
  const { done, failed } = await forEachRequest(req.body.ids, async doc => {
    if (doc.status !== 'With_Inventory') return 'Not waiting to be requested from the university';
    if (!doc.university) return 'The student has no university';
    pushHistory(doc, 'Sent_To_University', req.user, 'Requested from the university by Inventory');
    await doc.save();
    await audit('doc_requested_from_university', 'StudentDocument', doc._id, req.user, {}, `Requested from the university: ${doc.name}`);
    asked.push(doc);
    return null;
  });
  const byUniversity = new Map();
  asked.forEach(doc => {
    const uniId = String(doc.university);
    if (!byUniversity.has(uniId)) byUniversity.set(uniId, []);
    byUniversity.get(uniId).push(doc);
  });
  for (const [uniId, docs] of byUniversity) {
    const uniUsers = await User.find({ role: 'University', universityId: uniId, isActive: true }).select('_id').lean();
    if (!uniUsers.length) continue;
    await notify(uniUsers.map(u => u._id), docs.length === 1
      ? { message: `Marksheet requested: "${docs[0].name}"`, type: 'doc_forwarded', documentId: docs[0]._id, studentId: docs[0].student, role: 'University' }
      : { message: `${docs.length} marksheets requested`, type: 'doc_forwarded', role: 'University' });
  }
  for (const doc of asked.filter(d => d.origin === 'Counselor' && d.uploadedBy)) {
    await notify(doc.uploadedBy, { message: `Inventory requested "${doc.name}" from the university`, type: 'doc_forwarded', documentId: doc._id, studentId: doc.student });
  }
  res.json({ requested: done, failed });
});

// ── Inventory: correction check of a document received from the university ──
// Checked: a soft copy goes on to Upload Scan; a hard copy to Ready to Dispatch (paid) or to the centre's payment.
// Sent back: it goes to the university's Correction Needed tab and back to Inventory's request tabs, and the corrected
// copy goes through Mark Received and the check again.

// One physical document, one check. A request waits for its correction check when its copy came from the university
// and is not checked yet, or when it was answered from a New Inventory document that is not correction checked yet.
// Several requests can wait on the same document (a counselor's direct request and a centre's request): checking or
// sending back one of them does all of them, and the New Inventory entry with them.
async function awaitsCheck(doc) {
  if (doc.status !== 'Dispatch_Received' || doc.correctionCheckedAt) return false;
  if (!doc.inventoryItem) return true;
  if (doc.inventoryCheckPending) return true;
  const item = await InventoryDocument.findById(doc.inventoryItem._id || doc.inventoryItem).select('correctionCheckedAt').lean();
  return !item?.correctionCheckedAt;
}

// the other requests waiting for the check of this New Inventory document
async function waitingOnItem(itemId, exceptIds = []) {
  if (!itemId) return [];
  const docs = await StudentDoc.find({
    _id: { $nin: exceptIds }, status: 'Dispatch_Received', correctionCheckedAt: null,
    $or: [{ inventoryItem: itemId }, { receivedIntoInventory: itemId }],
  });
  const out = [];
  for (const d of docs) if (await awaitsCheck(d)) out.push(d);
  return out;
}

// checked: a soft copy -> Upload Scan, a hard copy -> Ready to dispatch (or the centre pays first), a counselor's
// direct request -> kept in the New Inventory. logItem false: the entry was already marked by the request checked with it.
async function applyCheck(doc, user, { logItem = true, via = '' } = {}) {
  const corrected = doc.correctionOpen;
  doc.correctionCheckedAt = new Date();
  doc.correctionCheckedBy = user._id;
  doc.correctionOpen = false;
  doc.inventoryCheckPending = false;
  addHistoryOnly(doc, 'Correction_Checked', user, `${corrected ? 'Corrected copy checked by Inventory' : 'Checked by Inventory'} - no correction needed${via ? ` (checked together with ${via})` : ''}`);
  let next = 'scan';
  if (doc.origin === 'Counselor') {   // a counselor's direct marksheet request: done, it stays in the New Inventory
    pushHistory(doc, 'In_Inventory', user, 'Correction checked - kept in the New Inventory');
    next = 'inventory';
  } else if (isHardCopyRequest(doc)) {
    const paid = (doc.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    if ((doc.chargeFee || 0) <= 0 || paid >= doc.chargeFee) {
      pushHistory(doc, 'Payment_Verified', user, 'Correction checked - hard copy ready to dispatch');
      next = 'dispatch';
    } else {
      pushHistory(doc, 'Center_Notified', user, 'Correction checked - hard copy fee to be paid before dispatch');
      next = 'payment';
    }
  }
  const itemId = await inventoryEntryFor(doc, user, receivedAtOf(doc));
  await doc.save();
  if (itemId && logItem) await logInventory(itemId, corrected ? 'Corrected copy checked by Inventory' : 'Correction checked by Inventory', user, '',
    { $set: { correctionCheckedAt: doc.correctionCheckedAt, correctionCheckedBy: user._id }, $unset: { correctionCheckPending: 1 } });
  if (next === 'inventory' && doc.uploadedBy) {
    const student = await Student.findById(doc.student).select('name').lean();
    await notify(doc.uploadedBy, { message: `Marksheet in the New Inventory (correction checked): "${doc.name}" - ${student?.name || ''}`, type: 'doc_forwarded', documentId: doc._id, studentId: doc.student });
  }
  if (next === 'dispatch') {   // a checked hard copy, paid: Dispatch couriers it
    await notifyRole('Dispatch', { message: `Ready to dispatch to the centre: "${doc.name}" (correction checked)`, type: 'payment_verified', documentId: doc._id, role: 'Dispatch' });
  }
  if (next === 'payment') {
    const centerUser = await User.findOne({ centerId: doc.center, role: 'Center', isActive: true }).select('_id').lean();
    if (centerUser) await notify(centerUser._id, { message: `Payment required for hard copy document "${doc.name}"`, type: 'doc_payment_required', documentId: doc._id, role: 'Center' });
  }
  await audit('doc_correction_checked', 'StudentDocument', doc._id, user, { next, via }, `Correction checked: ${doc.name}`);
  return { next, itemId };
}

// a New Inventory document was checked on its own: the requests waiting on it go on too
exports.checkWaitingOn = async (itemId, user, via = 'the New Inventory') => {
  const done = [];
  for (const d of await waitingOnItem(itemId)) { await applyCheck(d, user, { logItem: false, via }); done.push(String(d._id)); }
  return done;
};

// POST /documents/correction-checked { ids }
exports.correctionChecked = asyncHandler(async (req, res) => {
  const next = {};
  const handled = new Set();
  const also = [];
  const { done, failed } = await forEachRequest(req.body.ids, async doc => {
    if (handled.has(String(doc._id))) return null;   // checked together with another one of this batch
    if (doc.status === 'Dispatch_Received' && doc.correctionCheckedAt) return 'Already checked';
    if (!(await awaitsCheck(doc))) return 'Not waiting for a correction check';
    const r = await applyCheck(doc, req.user);
    next[String(doc._id)] = r.next;
    handled.add(String(doc._id));
    // the same document waits for other requests too (e.g. the counselor's own and the centre's): checked with it
    for (const other of await waitingOnItem(r.itemId, [doc._id])) {
      const o = await applyCheck(other, req.user, { logItem: false, via: `"${doc.name}" (${doc.origin === 'Counselor' ? "counselor's request" : 'request'})` });
      next[String(other._id)] = o.next;
      handled.add(String(other._id));
      also.push(String(other._id));
    }
    return null;
  });
  res.json({ checked: done, failed, next, alsoChecked: also.filter(id => !done.includes(id)) });
});

// POST /documents/send-for-correction { ids, note } — what is wrong is required
exports.sendForCorrection = asyncHandler(async (req, res) => {
  const note = String(req.body.note || '').trim().slice(0, 500);
  if (!note) { const e = new Error('Write what needs to be corrected'); e.status = 400; throw e; }
  const sent = [];
  const handled = new Set();
  const also = [];
  const sendBack = async (doc, logItem) => {
    if (doc.inventoryItem) {   // the held copy goes to the university: from now on a normal request for its corrected copy
      doc.receivedIntoInventory = doc.inventoryItem;
      doc.inventoryItem = undefined;
      doc.inventoryCheckPending = false;
    }
    doc.correctionOpen = true;
    doc.correctionCount = (doc.correctionCount || 0) + 1;
    doc.correctionSentAt = new Date();
    doc.correctionSentBy = req.user._id;
    doc.correctionNote = note;
    addHistoryOnly(doc, 'Sent_For_Correction', req.user, `Sent back to the university for correction: ${note}`);
    pushHistory(doc, 'Sent_To_University', req.user, 'Waiting for the corrected copy from the university');
    const itemId = await inventoryEntryFor(doc, req.user, receivedAtOf(doc));
    await doc.save();
    if (itemId && logItem) await logInventory(itemId, 'Sent back to the university for correction', req.user, note, { $set: { correctionSentAt: doc.correctionSentAt }, $unset: { correctionCheckedAt: 1, correctionCheckedBy: 1, correctionCheckPending: 1 } });
    await audit('doc_sent_for_correction', 'StudentDocument', doc._id, req.user, { note, count: doc.correctionCount }, `Sent for correction: ${doc.name}`);
    sent.push(doc);
    handled.add(String(doc._id));
    return itemId;
  };
  const { done, failed } = await forEachRequest(req.body.ids, async doc => {
    if (handled.has(String(doc._id))) return null;   // sent back together with another one of this batch
    if (!(await awaitsCheck(doc))) return 'Only documents waiting for the correction check can be sent back';
    const heldId = doc.inventoryItem?._id || doc.inventoryItem || doc.receivedIntoInventory;
    const waiting = await waitingOnItem(heldId, [doc._id]);   // the same document, waited on by other requests
    await sendBack(doc, true);
    for (const other of waiting) { await sendBack(other, false); also.push(String(other._id)); }
    return null;
  });
  // the university hears once per batch
  const byUniversity = new Map();
  sent.forEach(doc => {
    const uniId = String(doc.university || '');
    if (!uniId) return;
    if (!byUniversity.has(uniId)) byUniversity.set(uniId, []);
    byUniversity.get(uniId).push(doc);
  });
  for (const [uniId, docs] of byUniversity) {
    const uniUsers = await User.find({ role: 'University', universityId: uniId, isActive: true }).select('_id').lean();
    if (!uniUsers.length) continue;
    await notify(uniUsers.map(u => u._id), {
      message: docs.length === 1 ? `Correction needed: "${docs[0].name}" - ${note}` : `Correction needed for ${docs.length} documents - ${note}`,
      type: 'doc_forwarded', role: 'University', ...(docs.length === 1 ? { documentId: docs[0]._id } : {}),
    });
  }
  res.json({ sent: done, failed, alsoSent: also.filter(id => !done.includes(id)) });
});

// ── Inventory: close old requests that are not moving / reopen them ──
// Closing does not delete: the request keeps its history and payments, leaves the Inventory and university
// lists (status 'Closed'), and Reopen puts it back at the stage it was closed at.
const CLOSABLE_STATUSES = ['With_Inventory', 'Sent_To_University', 'University_Dispatched', 'Dispatch_Received'];

async function forEachRequest(ids, work) {
  const unique = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter(isValidObjectId);
  if (!unique.length) { const e = new Error('Select the requests'); e.status = 400; throw e; }
  if (unique.length > 200) { const e = new Error('At most 200 requests at a time'); e.status = 400; throw e; }
  const done = [];
  const failed = [];
  for (const id of unique) {
    try {
      const doc = await StudentDoc.findById(id);
      if (!doc) { failed.push({ id, error: 'Request not found' }); continue; }
      const problem = await work(doc);
      if (problem) failed.push({ id, name: doc.name, error: problem });
      else done.push(id);
    } catch (e) {
      failed.push({ id, error: e.message });
    }
  }
  return { done, failed };
}

// POST /documents/close { ids, reason? }
exports.closeRequests = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim().slice(0, 300);
  const { done, failed } = await forEachRequest(req.body.ids, async doc => {
    if (doc.status === 'Closed') return 'Already closed';
    if (!CLOSABLE_STATUSES.includes(doc.status)) return 'Only requests waiting for the university or for their scan can be closed';
    doc.closedFromStatus = doc.status;
    doc.closedAt = new Date();
    doc.closedBy = req.user._id;
    doc.closedReason = reason;
    pushHistory(doc, 'Closed', req.user, reason ? `Closed by ${req.user.role}: ${reason}` : `Closed by ${req.user.role} - not moving forward`);
    await doc.save();
    await audit('doc_closed', 'StudentDocument', doc._id, req.user, { from: doc.closedFromStatus, reason }, `Request closed: ${doc.name}`);
    return null;
  });
  res.json({ closed: done, failed });
});

// POST /documents/centre-received { ids } — Dispatch marks couriered requests as received by the centre
// (when the centre has not confirmed it itself); their New Inventory entries show it too
exports.centreReceivedMany = asyncHandler(async (req, res) => {
  const { done, failed } = await forEachRequest(req.body.ids, async doc => {
    if (doc.status === 'Delivered') return 'Already received by the centre';
    if (doc.status !== 'Dispatched') return 'Not sent to the centre yet';
    pushHistory(doc, 'Delivered', req.user, `Received by centre - marked by ${req.user.role}`);
    await noteCentreStep(doc, req.user, 'received');
    await doc.save();
    await notifyCounselors({ counselorId: doc.counselor, centerId: doc.center }, {
      message: `"${doc.name}" marked received by the centre (by ${req.user.name || req.user.role})`,
      type: 'doc_delivered', documentId: doc._id,
    });
    await audit('doc_delivered', 'StudentDocument', doc._id, req.user, { via: 'dispatch' }, `Delivered: ${doc.name}`);
    return null;
  });
  res.json({ received: done, failed });
});

// POST /documents/reopen { ids }
exports.reopenRequests = asyncHandler(async (req, res) => {
  const { done, failed } = await forEachRequest(req.body.ids, async doc => {
    if (doc.status !== 'Closed') return 'Not closed';
    const back = CLOSABLE_STATUSES.includes(doc.closedFromStatus) ? doc.closedFromStatus : 'Sent_To_University';
    pushHistory(doc, back, req.user, `Reopened by ${req.user.role}`);
    doc.closedFromStatus = undefined;
    doc.closedAt = undefined;
    doc.closedBy = undefined;
    doc.closedReason = undefined;
    await doc.save();
    await audit('doc_reopened', 'StudentDocument', doc._id, req.user, { to: back }, `Request reopened: ${doc.name}`);
    return null;
  });
  res.json({ reopened: done, failed });
});

// The Inventory team uploads the scanned copy -> straight to the counselor, then the centre
// (scans used to go to the accountant first; ones still there are forwarded by accountantForwardScan)
exports.uploadScan = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Dispatch_Received') { const e = new Error('Must confirm receipt first'); e.status = 400; throw e; }
  // a copy from the university is checked for corrections first (one answered from the New Inventory was not sent for)
  if (await awaitsCheck(doc)) { const e = new Error('Check the document for corrections first (Correction Check)'); e.status = 400; throw e; }

  if (req.file) { doc.scannedUrl = `/uploads/${req.file.filename}`; doc.scannedName = req.file.originalname; }
  if (req.body.scannedUrl) doc.scannedUrl = req.body.scannedUrl;

  // the scan is kept with the document in the New Inventory, to download later
  if (doc.scannedUrl) {
    const itemId = await inventoryEntryFor(doc, req.user, receivedAtOf(doc));
    if (itemId) {
      const added = await InventoryDocument.updateOne({ _id: itemId, 'files.url': { $ne: doc.scannedUrl } }, { $push: { files: {
        url: doc.scannedUrl, name: doc.scannedName || doc.name, sizeKb: req.file ? Math.round(req.file.size / 1024) : 0,
        uploadedAt: new Date(), uploadedBy: req.user._id, request: doc._id,
      } } });
      if (added.modifiedCount) await logInventory(itemId, 'Scan uploaded', req.user, doc.scannedName || '');
    }
  }

  pushHistory(doc, 'Scanned', req.user, 'Scanned copy uploaded by Inventory');
  // straight to the counselor ("From Inventory"); the accountant no longer reviews scans
  pushHistory(doc, 'Counselor_Received', req.user, 'Scanned copy sent to the counselor');
  await doc.save();

  await notifyCounselors({ counselorId: doc.counselor, centerId: doc.center }, {
    message: `Scanned document from Inventory: "${doc.name}" for ${doc.student?.name}. Please review and forward to the centre.`,
    type: 'doc_scanned', documentId: doc._id,
  });
  await audit('scan_uploaded', 'StudentDocument', doc._id, req.user, {}, `Scan uploaded for ${doc.name}`);
  res.json(doc);
});

// Accountant forwards scan to counselor — only scans uploaded before they went straight to the counselor
exports.accountantForwardScan = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Accountant_Received') { const e = new Error('Must be Accountant_Received status'); e.status = 400; throw e; }
  pushHistory(doc, 'Counselor_Received', req.user, 'Accountant reviewed and forwarded to counselor');
  await doc.save();
  await notifyCounselors({ counselorId: doc.counselor, centerId: doc.center }, {
    message: `Scanned document ready: "${doc.name}" for ${doc.student?.name}. Please review and forward to center.`,
    type: 'doc_scanned', documentId: doc._id,
  });
  await audit('accountant_forwarded_scan', 'StudentDocument', doc._id, req.user, {}, `Accountant forwarded scan to counselor`);
  res.json(doc);
});

// Counselor forwards scanned doc to center (notifies center for payment)
exports.counselorForwardToCenter = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Counselor_Received') { const e = new Error('Must be in Counselor_Received status'); e.status = 400; throw e; }

  // Recalculate totalPaid from payments array
  const totalPaid = doc.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  doc.totalPaid = totalPaid;
  const fullyPaid = doc.chargeFee <= 0 || totalPaid >= doc.chargeFee;

  // The scanned copy goes to the centre. It reaches Dispatch (Ready to dispatch) only when the centre asks for the
  // document to be couriered (Request Dispatch). Older requests not paid in full: the centre pays first.
  pushHistory(doc, 'Center_Notified', req.user, fullyPaid
    ? 'Counselor sent the scanned copy to the centre - courier on the centre\'s request'
    : 'Counselor forwarded to center - payment required');
  await doc.save();

  const centerUser = await User.findOne({ centerId: doc.center, role: 'Center', isActive: true });
  if (centerUser) {
    await notify(centerUser._id, {
      message: fullyPaid
        ? `Scanned copy ready: "${doc.name}" - ${doc.student?.name}. Download it from the request; use Request Dispatch if you need the document couriered.`
        : `Document ready: "${doc.name}" — please complete payment`,
      type: 'doc_scanned', documentId: doc._id, role: 'Center',
    });
  }
  await audit('counselor_forwarded_to_center', 'StudentDocument', doc._id, req.user, { fullyPaid }, `Forwarded to center`);
  res.json(doc);
});

// Add/update doc payment
exports.addPayment = asyncHandler(async (req, res) => {
  const {
    amount, mode, utrRef, note, paidAt,
    upiId, bankName, accountHolder, accountNumber, ifscCode,
    paidToAccount, paidToAccountLabel,
  } = req.body;
  if (!amount || Number(amount) <= 0) { const e = new Error('Amount must be positive'); e.status = 400; throw e; }

  const doc = await loadDoc(req.params.id);
  const centerOriginated = await canUseCenterFlow(req, doc.center?._id || doc.center);
  if (req.user.role === 'ViewerCounselor' && !centerOriginated) {
    const e = new Error('Viewer counselors can add document payments only from center view'); e.status = 403; throw e;
  }
  if ((req.user.role === 'Center' || wantsCenterFlow(req)) && !centerOriginated) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  doc.payments.push({
    amount: Number(amount),
    mode: mode || 'UPI',
    upiId: upiId || '',
    utrRef: utrRef || '',
    bankName: bankName || '',
    accountHolder: accountHolder || '',
    accountNumber: accountNumber || '',
    ifscCode: ifscCode || '',
    note: note || '',
    paidAt: paidAt ? new Date(paidAt) : new Date(),
    recordedBy: req.user._id,
    lastUpdatedBy: req.user.role === 'ViewerCounselor' ? req.user._id : undefined,
    lastUpdatedAt: req.user.role === 'ViewerCounselor' ? new Date() : undefined,
    paidToAccount: paidToAccount || undefined,
    paidToAccountLabel: paidToAccountLabel || '',
    paymentScreenshot: req.file ? `/uploads/${req.file.filename}` : '',
  });

  const newTotalPaid = doc.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  doc.totalPaid = newTotalPaid;

  // BUG FIX: Status change depends on current doc status:
  // 'Requested' = doc not yet forwarded to university. Payment attaches but status stays.
  // 'Center_Notified' or 'Fee_Rejected' = scanned doc received, center now paying.
  if (doc.status === 'Requested') {
    // DO NOT change status - counselor must still forward to accountant via normal flow
    await notifyCounselors({ counselorId: doc.counselor, centerId: doc.center }, {
      message: `Payment attached to doc request: "${doc.name}" for ${doc.student?.name}. Forward to accountant when ready.`,
      type: 'doc_payment_received', documentId: doc._id,
    });
  } else if (['Center_Notified', 'Fee_Rejected'].includes(doc.status)) {
    // Scanned doc payment flow - move to Payment_Submitted for counselor to verify
    pushHistory(doc, 'Payment_Submitted', req.user, 'Payment submitted - counselor to verify and forward to accountant');
    await notifyCounselors({ counselorId: doc.counselor, centerId: doc.center }, {
      message: `Center submitted payment for "${doc.name}" - ${doc.student?.name}. Please verify and forward to accountant.`,
      type: 'doc_payment_received', documentId: doc._id,
    });
  }
  await doc.save();
  await audit('doc_payment_added', 'StudentDocument', doc._id, req.user, { amount, utrRef }, `Payment ₹${amount} for ${doc.name}`);
  res.json(await loadDoc(doc._id));
});

// Update existing doc payment
exports.updatePayment = asyncHandler(async (req, res) => {
  const doc = await StudentDoc.findById(req.params.id);
  if (!doc) { const e = new Error('Document not found'); e.status = 404; throw e; }
  const centerOriginated = await canUseCenterFlow(req, doc.center);
  if (req.user.role === 'ViewerCounselor' && !centerOriginated) {
    const e = new Error('Viewer counselors can edit document payments only from center view'); e.status = 403; throw e;
  }
  if ((req.user.role === 'Center' || wantsCenterFlow(req)) && !centerOriginated) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  const payment = doc.payments.id(req.params.payId);
  if (!payment) { const e = new Error('Payment not found'); e.status = 404; throw e; }

  const fields = ['amount','mode','upiId','utrRef','bankName','accountHolder','accountNumber','ifscCode','note','paidAt'];
  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      payment[f] = f === 'amount' ? Number(req.body[f]) : f === 'paidAt' ? new Date(req.body[f]) : req.body[f];
    }
  });
  if (req.user.role === 'ViewerCounselor' && centerOriginated) {
    payment.lastUpdatedBy = req.user._id;
    payment.lastUpdatedAt = new Date();
  }
  await doc.save();
  res.json(await loadDoc(doc._id));
});

// Center requests dispatch when already fully paid (skips payment step)
exports.requestDispatch = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  const centerOriginated = await canUseCenterFlow(req, doc.center?._id || doc.center);
  if (req.user.role === 'ViewerCounselor' && !centerOriginated) {
    const e = new Error('Viewer counselors can request dispatch only from center view'); e.status = 403; throw e;
  }
  if ((req.user.role === 'Center' || wantsCenterFlow(req)) && !centerOriginated) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  if (doc.status !== 'Center_Notified') { const e = new Error('Document must be in Center_Notified status'); e.status = 400; throw e; }

  const fullyPaid = doc.chargeFee <= 0 || doc.totalPaid >= doc.chargeFee;
  if (!fullyPaid) { const e = new Error('Payment not complete yet'); e.status = 400; throw e; }

  // Paid in full and already verified (other documents are paid when requested): straight to Ready to dispatch
  const verified = doc.payments.length ? doc.payments.every(p => p.verified) : doc.chargeFee <= 0;
  if (verified) {
    pushHistory(doc, 'Payment_Verified', req.user, 'Centre requested dispatch - payment already verified, ready for dispatch');
    await doc.save();
    await notifyRole('Dispatch', { message: `Ready to dispatch to the centre (centre requested): "${doc.name}" - ${doc.student?.name}`, type: 'payment_verified', documentId: doc._id, role: 'Dispatch' });
    await notifyCounselors({ counselorId: doc.counselor, centerId: doc.center }, {
      message: `Centre requested dispatch for "${doc.name}" — ${doc.student?.name}. It is with Dispatch to courier.`,
      type: 'doc_forwarded', documentId: doc._id,
    });
    await audit('request_dispatch', 'StudentDocument', doc._id, req.user, { direct: true }, `Center requested dispatch for ${doc.name} (to Dispatch)`);
    return res.json(await loadDoc(doc._id));
  }

  // Not verified yet — move to Payment_Submitted so counselor can forward
  pushHistory(doc, 'Payment_Submitted', req.user, 'Center requested dispatch — payment already complete');
  await doc.save();

  // Notify counselor to forward to accountant
  await notifyCounselors({ counselorId: doc.counselor, centerId: doc.center }, {
    message: `Dispatch requested for "${doc.name}" — ${doc.student?.name}. Payment already complete. Please forward to accountant.`,
    type: 'doc_payment_received', documentId: doc._id,
  });
  await audit('request_dispatch', 'StudentDocument', doc._id, req.user, {}, `Center requested dispatch for ${doc.name}`);
  res.json(await loadDoc(doc._id));
});

// Counselor forwards payment verification to accountant
exports.counselorForwardPayment = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Payment_Submitted') { const e = new Error('Must be Payment_Submitted status'); e.status = 400; throw e; }
  pushHistory(doc, 'Payment_Submitted', req.user, COUNSELOR_PAYMENT_FORWARD_NOTE);
  await doc.save();
  // Now notify accountant
  await notifyRole('Accountant', { message: `Doc payment ready for verification: "${doc.name}" - ${doc.student?.name}`, type: 'doc_payment_received', documentId: doc._id, role: 'Accountant' });
  await audit('counselor_forwarded_payment', 'StudentDocument', doc._id, req.user, {}, `Forwarded payment to accountant`);
  res.json(doc);
});

// Accountant verifies doc payment -> sends to Dispatch
exports.verifyPayment = asyncHandler(async (req, res) => {
  const { approved, note } = req.body;
  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Payment_Submitted') { const e = new Error('Not in payment verification'); e.status = 400; throw e; }

  if (approved) {
    markDocPaymentsVerified(doc, req.user);
    pushHistory(doc, 'Payment_Verified', req.user, note||'Payment verified');
    // Notify Dispatch to send courier to center
    await notifyRole('Dispatch', { message: `Payment verified - send courier to center for: "${doc.name}" - ${doc.student?.name}`, type: 'payment_verified', documentId: doc._id, role: 'Dispatch' });
    // Also notify Counselor
    await notifyCounselors({ counselorId: doc.counselor, centerId: doc.center }, { message: `Doc payment verified for "${doc.name}" - Dispatch will courier to center`, type: 'payment_verified', documentId: doc._id });
  } else {
    pushHistory(doc, 'Center_Notified', req.user, note||'Payment rejected - resubmit');
  }
  await doc.save();
  await audit('doc_payment_verified', 'StudentDocument', doc._id, req.user, { approved }, `Payment ${approved ? 'verified':'rejected'}`);
  res.json(doc);
});

// Dispatch sends courier to center (with courier details sent to counselor too)
exports.dispatchToCenter = asyncHandler(async (req, res) => {
  const { company, trackingNo, dispatchDate, documentsDesc } = req.body;
  if (!trackingNo?.trim()) { const e = new Error('Tracking number required'); e.status = 400; throw e; }

  const doc = await loadDoc(req.params.id);
  if (doc.status !== 'Payment_Verified') { const e = new Error('Payment must be verified first'); e.status = 400; throw e; }

  // Overwrite courierInfo with dispatch-to-center details
  doc.centerCourierInfo = { company: company||'', trackingNo, dispatchDate: dispatchDate ? new Date(dispatchDate) : new Date(), documentsDesc: documentsDesc||doc.name, sentBy: req.user._id, sentAt: new Date() };
  pushHistory(doc, 'Dispatched', req.user, `Courier: ${company||''} - ${trackingNo}`);
  await noteCentreStep(doc, req.user, 'sent');
  await doc.save();

  // Notify COUNSELOR first with courier details
  await notifyCounselors({ counselorId: doc.counselor, centerId: doc.center }, {
    message: `Document dispatched to center: "${doc.name}" - ${company||''} Tracking: ${trackingNo}`,
    type: 'doc_dispatched', documentId: doc._id,
  });
  // Then notify center
  const centerUser = await User.findOne({ centerId: doc.center, role: 'Center', isActive: true });
  if (centerUser) {
    await notify(centerUser._id, {
      message: `Document en route: "${doc.name}" - ${company||''}, Tracking: ${trackingNo}`,
      type: 'doc_dispatched', documentId: doc._id, role: 'Center',
    });
  }
  await audit('doc_dispatched', 'StudentDocument', doc._id, req.user, { company, trackingNo }, `Dispatched: ${doc.name}`);
  res.json(doc);
});


exports.centerConfirmDelivery = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  const centerOriginated = await canUseCenterFlow(req, doc.center?._id || doc.center);
  if (req.user.role !== 'Admin' && !centerOriginated) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  if (doc.status !== 'Dispatched') {
    const e = new Error('Document must be in Dispatched status'); e.status = 400; throw e;
  }

  pushHistory(doc, 'Delivered', req.user, 'Center confirmed receipt of courier');
  await noteCentreStep(doc, req.user, 'received');
  await doc.save();

  
  
  await notifyCounselors({ counselorId: doc.counselor, centerId: doc.center }, {
    message: `Center "${doc.center?.name}" confirmed receipt of courier for "${doc.name}" - Student: ${doc.student?.name}${doc.student?.enrollmentNumber ? ` (${doc.student.enrollmentNumber})` : ''}`,
    type: 'doc_delivered', documentId: doc._id,
  });

  await audit('doc_delivered', 'StudentDocument', doc._id, req.user, {}, `Delivered: ${doc.name}`);
  res.json(doc);
});

function latestStatusAt(doc, status) {
  const found = [...(doc.statusHistory || [])].reverse().find(h => h.status === status);
  return found?.at || null;
}

function docPaymentBucket(doc) {
  const due = Math.max(0, (doc.chargeFee || 0) - (doc.totalPaid || 0));
  if (doc.status === 'Delivered') return 'delivered';
  if (doc.status === 'Dispatched') return 'dispatched';
  if (doc.status === 'Payment_Verified') return 'ready_dispatch';
  if (doc.status === 'Payment_Submitted') return 'submitted';
  if (['Center_Notified', 'Fee_Rejected'].includes(doc.status) && due > 0) return 'needs_call';
  if (['Center_Notified', 'Fee_Rejected'].includes(doc.status)) return 'submitted';
  return 'tracking';
}

exports.documentPaymentTimeline = asyncHandler(async (req, res) => {
  const docs = await StudentDoc.find({
    origin: { $nin: ['Inventory', 'Added'] },
    status: { $in: ['Center_Notified', 'Fee_Rejected', 'Payment_Submitted', 'Payment_Verified', 'Dispatched', 'Delivered'] },
  })
    .populate('student', 'name phone email courseName courseYear enrollmentNumber')
    .populate('center', 'name organisationName city')
    .populate('counselor', 'name')
    .populate('university', 'name shortName')
    .populate('payments.recordedBy', 'name role')
    .sort('-updatedAt')
    .lean();

  const rows = docs.map(doc => {
    const dueAmount = Math.max(0, (doc.chargeFee || 0) - (doc.totalPaid || 0));
    const followups = Array.isArray(doc.coordinatorFollowups) ? doc.coordinatorFollowups : [];
    const lastFollowup = followups[followups.length - 1] || null;
    return {
      documentId: doc._id,
      documentName: doc.name,
      status: doc.status,
      chargeFee: doc.chargeFee || 0,
      totalPaid: doc.totalPaid || 0,
      dueAmount,
      bucket: docPaymentBucket(doc),
      scanReceivedAt: latestStatusAt(doc, 'Center_Notified') || latestStatusAt(doc, 'Counselor_Received') || latestStatusAt(doc, 'Accountant_Received'),
      paymentSubmittedAt: latestStatusAt(doc, 'Payment_Submitted'),
      paymentVerifiedAt: latestStatusAt(doc, 'Payment_Verified'),
      dispatchedAt: latestStatusAt(doc, 'Dispatched'),
      deliveredAt: latestStatusAt(doc, 'Delivered'),
      followups,
      lastFollowup,
      nextFollowupDate: doc.nextCoordinatorFollowupDate || lastFollowup?.expectedPaymentDate || null,
      payments: doc.payments || [],
      student: doc.student,
      studentId: doc.student?._id,
      studentName: doc.student?.name || '',
      phone: doc.student?.phone || '',
      email: doc.student?.email || '',
      courseName: doc.student?.courseName || '',
      courseYear: doc.student?.courseYear || '',
      enrollmentNumber: doc.student?.enrollmentNumber || '',
      centerName: doc.center?.name || doc.center?.organisationName || '',
      centerCity: doc.center?.city || '',
      counselorName: doc.counselor?.name || '',
      universityName: doc.university?.name || doc.university?.shortName || '',
    };
  });

  rows.sort((a, b) => {
    const rank = { needs_call: 0, submitted: 1, ready_dispatch: 2, dispatched: 3, tracking: 4, delivered: 5 };
    return ((rank[a.bucket] ?? 9) - (rank[b.bucket] ?? 9))
      || (new Date(a.nextFollowupDate || a.scanReceivedAt || a.paymentSubmittedAt || 0) - new Date(b.nextFollowupDate || b.scanReceivedAt || b.paymentSubmittedAt || 0))
      || String(a.studentName).localeCompare(String(b.studentName));
  });

  res.json(rows);
});

exports.documentPaymentFollowup = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  const note = String(req.body.note || '').trim();
  const outcome = String(req.body.outcome || '').trim();
  const contactWith = ['Center', 'Dispatch'].includes(req.body.contactWith) ? req.body.contactWith : 'Center';
  const expectedPaymentDate = req.body.expectedPaymentDate ? new Date(req.body.expectedPaymentDate) : undefined;
  if (!note && !outcome && !expectedPaymentDate) {
    const e = new Error('Add note, outcome, or expected payment date'); e.status = 400; throw e;
  }

  doc.coordinatorFollowups.push({
    contactWith,
    note,
    outcome,
    expectedPaymentDate,
    contactedAt: new Date(),
    contactedBy: req.user._id,
  });
  doc.lastCoordinatorFollowupAt = new Date();
  doc.nextCoordinatorFollowupDate = expectedPaymentDate;
  doc.statusHistory.push({
    status: 'Coordinator_Followup',
    changedBy: req.user._id,
    at: new Date(),
    note: [`Talked to ${contactWith}`, outcome, note, expectedPaymentDate ? `Expected payment: ${expectedPaymentDate.toLocaleDateString('en-IN')}` : ''].filter(Boolean).join(' - '),
  });
  await doc.save();
  await audit('doc_payment_followup', 'StudentDocument', doc._id, req.user, { contactWith, note, outcome, expectedPaymentDate }, `Document payment follow-up`);
  res.json(await loadDoc(doc._id));
});

async function assertInventoryStudentAccess(req, student) {
  if (!student) { const e = new Error('Student not found'); e.status = 404; throw e; }
  if (['Counselor', 'ViewerCounselor'].includes(req.user.role)) {
    const directMatch = String(student.counselor?._id || student.counselor) === String(req.user.counselorId);
    const counselorDoc = await Counselor.findById(req.user.counselorId).select('centers').lean();
    const centerMatch = (counselorDoc?.centers || []).some(id => String(id) === String(student.center?._id || student.center));
    if (!directMatch && !centerMatch) {
      const e = new Error('Forbidden'); e.status = 403; throw e;
    }
  }
  if (req.user.role === 'Center' && String(student.center?._id || student.center) !== String(req.user.centerId)) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
}

// GET /api/accountant/docs-queue?queue=scanreview|docrequest|docpayments|docpayments_all
// Accountant "Marksheet Requests" / "Other Doc Requests" tab (?queue=requests&section=Marksheet|Other):
// requests the counselor approved ("Forwarded" / "Fee_Pending", payment attached or not) and payments the
// centre made after the scan once the counselor has forwarded them. Urgent first, then most recently updated.
// Small set (only what waits for the accountant), so it is filtered and paged in memory.
async function accountantRequestsQueue(req, res) {
  const section = req.query.section === 'Marksheet' ? 'Marksheet' : 'Other';
  const docs = await StudentDoc.find({ origin: { $nin: ['Inventory', 'Added'] }, status: { $in: ['Forwarded', 'Fee_Pending', 'Payment_Submitted'] } })
    .populate('student', 'name enrollmentNumber courseName')
    .populate('center', 'name')
    .populate('payments.recordedBy', 'name role')
    .populate('uploadedBy', 'name role')
    .populate('statusHistory.changedBy', 'name role')
    .populate('urgentMarkedBy', 'name role')
    .sort('-updatedAt')
    .lean();
  let rows = docs.filter(d => sectionOf(d.section, d.name) === section && (d.status !== 'Payment_Submitted' || paymentForwardedToAccountant(d)));
  const paid = d => (d.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const summary = {
    all: rows.length,
    requests: rows.filter(d => d.status !== 'Payment_Submitted').length,
    payments: rows.filter(d => d.status === 'Payment_Submitted').length,
    urgent: section === 'Other' ? rows.filter(d => d.urgent).length : 0,
    received: rows.reduce((s, d) => s + paid(d), 0),
  };

  const q = String(req.query.search || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter(d => [d.name, d.student?.name, d.student?.enrollmentNumber, d.center?.name, ...(d.payments || []).map(p => p.utrRef)]
      .some(v => String(v || '').toLowerCase().includes(q)));
  }
  if (section === 'Other' && req.query.urgent === '1') rows = rows.filter(d => d.urgent);
  if (section === 'Other') rows.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));   // stable: keeps newest first within each

  const page  = Math.max(1, parseInt(req.query.page, 10)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const documents = rows.slice((page - 1) * limit, page * limit);

  // the student's course fee, shown on marksheet cards
  const studentIds = [...new Set(documents.map(docStudentId).filter(Boolean))];
  const fees = await Payment.find({ student: { $in: studentIds } }).select('student totalFee discount netFee paidAmount dueAmount').lean();
  const feeOf = new Map(fees.map(p => [String(p.student), { totalFee: p.totalFee || 0, discount: p.discount || 0, netFee: p.netFee || 0, paidAmount: p.paidAmount || 0, dueAmount: p.dueAmount || 0 }]));
  res.json({
    documents: documents.map(d => ({ ...d, courseFeeSummary: feeOf.get(docStudentId(d)) || null })),
    total: rows.length, page, pages: Math.ceil(rows.length / limit) || 1, summary,
  });
}

// Mongo filter for one request tab; older requests without a tab go by their name
const MARKSHEET_NAME = /marksheet|transcript/i;
const sectionQuery = section => (section === 'Marksheet'
  ? { $or: [{ section: 'Marksheet' }, { section: null, name: MARKSHEET_NAME }] }
  : { $or: [{ section: 'Other' }, { section: null, name: { $not: MARKSHEET_NAME } }] });

exports.accountantDocsQueue = asyncHandler(async (req, res) => {
  const { queue } = req.query;
  if (queue === 'requests') return accountantRequestsQueue(req, res);
  const filter = { origin: { $ne: 'Inventory' } };
  // docpayments_all can be narrowed to one request tab (the payment records under each tab)
  if (DOC_SECTIONS.includes(req.query.section)) filter.$and = [sectionQuery(req.query.section)];
  if (queue === 'scanreview') {
    filter.status = 'Accountant_Received';
  } else if (queue === 'docrequest') {
    filter.status = { $in: ['Forwarded','Fee_Pending'] };
  } else if (queue === 'docpayments') {
    // Payments awaiting the accountant: the post-scan "Payment_Submitted" ones, PLUS
    // request-stage docs that were forwarded with a payment attached (request + payment
    // travel together — approving the request here also verifies its payment).
    filter.$or = [
      { status: 'Payment_Submitted' },
      { status: { $in: ['Forwarded','Fee_Pending'] }, 'payments.0': { $exists: true } },
    ];
  } else if (queue === 'docpayments_all') {
    filter.status = { $in: ['Forwarded','Fee_Pending','Payment_Submitted','Payment_Verified','Center_Notified','Fee_Rejected'] };
    filter['payments.0'] = { $exists: true };
  } else {
    const e = new Error('Invalid queue'); e.status = 400; throw e;
  }

  if (req.query.search) {
    const q = req.query.search;
    filter.name = { $regex: q, $options: 'i' };
  }

  const page  = Math.max(1, parseInt(req.query.page, 10)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip  = (page - 1) * limit;

  const [total, documents] = await Promise.all([
    StudentDoc.countDocuments(filter),
    StudentDoc.find(filter)
      .populate('student', 'name enrollmentNumber courseName')
      .populate('center', 'name')
      .sort('-updatedAt')
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);
  res.json({ documents, total, page, pages: Math.ceil(total / limit) || 1 });
});

exports.inventoryList = asyncHandler(async (req, res) => {
  const filter = { applicationStatus: 'Enrolled', enrollmentNumber: { $exists: true, $ne: '' } };
  if (['Counselor', 'ViewerCounselor'].includes(req.user.role)) {
    const counselorDoc = await Counselor.findById(req.user.counselorId).select('centers').lean();
    const linkedCenterIds = counselorDoc?.centers || [];
    filter.$or = linkedCenterIds.length > 0
      ? [{ counselor: req.user.counselorId }, { center: { $in: linkedCenterIds } }]
      : [{ counselor: req.user.counselorId }];
  }
  if (req.user.role === 'Center') filter.center = req.user.centerId;
  if (req.query.search) {
    const q = req.query.search;
    filter.$and = [
      ...(filter.$and || []),
      { $or: [
        { name: { $regex: q, $options: 'i' } },
        { enrollmentNumber: { $regex: q, $options: 'i' } },
      ] },
    ];
  }

  // Pagination — page defaults to fetching everything ONLY if no page param passed (kept for backward compat),
  // but the frontend should always pass page+limit to avoid loading the whole enrolled list at once.
  const page  = Math.max(1, parseInt(req.query.page, 10)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const skip  = (page - 1) * limit;

  const [total, students] = await Promise.all([
    Student.countDocuments(filter),
    Student.find(filter)
      .populate('center', 'name city')
      .populate('counselor', 'name')
      .populate('university', 'name shortName')
      .sort('-updatedAt')
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const studentIds = students.map(s => s._id);
  const docs = await StudentDoc.find({ student: { $in: studentIds }, origin: { $ne: 'Added' } })
    .populate('student', 'name enrollmentNumber courseName')
    .populate('center', 'name')
    .populate('university', 'name shortName')
    .sort('name')
    .lean();

  const docsByStudent = docs.reduce((acc, doc) => {
    const sid = String(doc.student?._id || doc.student);
    if (!acc[sid]) acc[sid] = [];
    acc[sid].push(doc);
    return acc;
  }, {});

  res.json({
    total,
    page,
    limit,
    hasMore: skip + students.length < total,
    rows: students.map(student => ({
    student,
    docs: (() => {
      const studentDocs = docsByStudent[String(student._id)] || [];
      const inventoryDocs = studentDocs.filter(d => d.origin === 'Inventory');
      const requestDocsByName = studentDocs
        .filter(d => d.origin !== 'Inventory')
        .reduce((acc, doc) => {
          const key = normalizeInventoryDocName(doc.name);
          acc[key] = bestDispatchSource(acc[key], doc);
          return acc;
        }, {});
      const byName = {};
      inventoryDocs.forEach(d => { byName[normalizeInventoryDocName(d.name)] = mergeInventoryDispatchStatus(d, requestDocsByName[normalizeInventoryDocName(d.name)]); });
      const catalogDocs = INVENTORY_DOC_NAMES.map((name, idx) => (
        byName[normalizeInventoryDocName(name)] || mergeInventoryDispatchStatus({
          _id: `catalog-${student._id}-${idx}`,
          catalog: true,
          studentId: student._id,
          name,
          status: 'Not_Requested',
          origin: 'Inventory',
        }, requestDocsByName[normalizeInventoryDocName(name)])
      ));
      const extraDocs = inventoryDocs
        .filter(d => !INVENTORY_DOC_NAMES.some(name => normalizeInventoryDocName(name) === normalizeInventoryDocName(d.name)))
        .map(d => mergeInventoryDispatchStatus(d, requestDocsByName[normalizeInventoryDocName(d.name)]));
      return [...catalogDocs, ...extraDocs];
    })(),
    requestedDocs: (docsByStudent[String(student._id)] || []).filter(d => d.origin !== 'Inventory'),
  })),
  });
});

exports.inventoryAddDoc = asyncHandler(async (req, res) => {
  const { name, names, received, urgent, dispatched, delivered, requestedDate, receivedDate, urgentDate, dispatchedDate, deliveredDate } = req.body;
  const rawNames = Array.isArray(names) ? names : String(name || '').split('\n');
  const docNames = rawNames.map(n => String(n || '').trim()).filter(Boolean);
  if (docNames.length === 0) { const e = new Error('Document name required'); e.status = 400; throw e; }

  const student = await Student.findById(req.params.studentId);
  await assertInventoryStudentAccess(req, student);

  const created = [];
  for (const docName of docNames) {
    const actionDate = delivered
      ? asActionDate(deliveredDate)
      : dispatched
        ? asActionDate(dispatchedDate)
        : received
          ? asActionDate(receivedDate)
          : asActionDate(requestedDate || urgentDate);
    let doc = await StudentDoc.findOne({ student: student._id, origin: 'Inventory', name: new RegExp(`^${docName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (!doc) {
      const initialStatus = delivered ? 'Delivered' : dispatched ? 'Dispatched' : received ? 'Dispatch_Received' : 'Sent_To_University';
      doc = new StudentDoc({
        student: student._id,
        center: student.center,
        counselor: student.counselor,
        university: student.university,
        name: docName,
        origin: 'Inventory',
        uploadedBy: req.user._id,
        status: initialStatus,
        statusHistory: [{
          status: initialStatus,
          changedBy: req.user._id,
          at: actionDate,
          note: delivered
            ? 'Added to inventory as already received by center'
            : dispatched
              ? 'Added to inventory as already dispatched to center'
              : received
                ? 'Added to inventory as received from university'
                : 'Added to inventory and requested',
        }],
      });
      if (!received && urgent) {
        addHistoryOnly(doc, 'Urgent_Requested', req.user, 'Urgent document request', asActionDate(urgentDate || requestedDate));
      }
    } else if (delivered && doc.status !== 'Delivered') {
      if (doc.status !== 'Dispatched') {
        addHistoryOnly(doc, 'Dispatched', req.user, 'Already dispatched to center', actionDate);
      }
      pushHistory(doc, 'Delivered', req.user, 'Already received by center', actionDate);
    } else if (dispatched && !['Dispatched','Delivered'].includes(doc.status)) {
      pushHistory(doc, 'Dispatched', req.user, 'Already dispatched to center', actionDate);
    } else if (received && !INVENTORY_RECEIVED_OR_DONE_STATUSES.includes(doc.status)) {
      pushHistory(doc, 'Dispatch_Received', req.user, 'Received from university', actionDate);
    } else if (!received && !INVENTORY_RECEIVED_OR_DONE_STATUSES.includes(doc.status)) {
      if (!['Sent_To_University','University_Dispatched'].includes(doc.status)) {
        pushHistory(doc, 'Sent_To_University', req.user, 'Document requested from university/external courier', actionDate);
      } else {
        addHistoryOnly(doc, 'Sent_To_University', req.user, 'Document requested from university/external courier', actionDate);
      }
      if (urgent) {
        addHistoryOnly(doc, 'Urgent_Requested', req.user, 'Urgent document request', asActionDate(urgentDate || requestedDate));
      }
    }
    await doc.save();
    if (!received && !dispatched && !delivered && doc.university) {
      const uniUsers = await User.find({ role: 'University', universityId: doc.university, isActive: true }).select('_id').lean();
      await notify(uniUsers.map(u => u._id), {
        message: `Document requested by Dispatch: "${doc.name}" - Student: ${student.name}`,
        type: 'doc_forwarded',
        documentId: doc._id,
        studentId: student._id,
        role: 'University',
      });
    }
    created.push(doc);
  }
  res.status(201).json(created);
});

exports.inventoryReceiveDoc = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  await assertInventoryStudentAccess(req, doc.student);
  if (!['Admin','Inventory'].includes(req.user.role)) {
    const e = new Error('Only Inventory/Admin can mark documents received'); e.status = 403; throw e;
  }
  if (!['Sent_To_University','University_Dispatched','Requested'].includes(doc.status)) {
    return res.json(doc);
  }
  if (!doc.courierInfo) {
    doc.courierInfo = {
      company: req.body.company || 'External Courier',
      trackingNo: req.body.trackingNo || '',
      dispatchDate: req.body.dispatchDate ? new Date(req.body.dispatchDate) : new Date(),
      documentsDesc: req.body.documentsDesc || doc.name,
      sentBy: req.user._id,
      sentAt: new Date(),
    };
  }
  pushHistory(doc, 'Dispatch_Received', req.user, 'Received from university', asActionDate(req.body.receivedDate));
  await doc.save();
  res.json(doc);
});

exports.inventoryRequestDoc = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  await assertInventoryStudentAccess(req, doc.student);
  if (INVENTORY_RECEIVED_OR_DONE_STATUSES.includes(doc.status)) {
    return res.json(doc);
  }
  pushHistory(doc, 'Sent_To_University', req.user, 'Document requested from university/external courier', asActionDate(req.body.requestedDate));
  await doc.save();
  await notifyRole('Inventory', {
    message: `Inventory request: "${doc.name}" - Student: ${doc.student?.name}. Mark received when it arrives.`,
    type: 'doc_forwarded', documentId: doc._id, studentId: doc.student?._id, role: 'Inventory',
  });
  if (doc.university) {
    const uniUsers = await User.find({ role: 'University', universityId: doc.university, isActive: true }).select('_id').lean();
    await notify(uniUsers.map(u => u._id), {
      message: `Document requested by Dispatch: "${doc.name}" - Student: ${doc.student?.name}`,
      type: 'doc_forwarded',
      documentId: doc._id,
      studentId: doc.student?._id,
      role: 'University',
    });
  }
  res.json(doc);
});

exports.inventoryUrgentRequestDoc = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  await assertInventoryStudentAccess(req, doc.student);
  if (INVENTORY_RECEIVED_OR_DONE_STATUSES.includes(doc.status)) {
    return res.json(doc);
  }
  const actionDate = asActionDate(req.body.urgentDate || req.body.requestedDate);
  if (!['Sent_To_University','University_Dispatched'].includes(doc.status)) {
    pushHistory(doc, 'Sent_To_University', req.user, 'Urgent document request from university/external courier', actionDate);
  }
  addHistoryOnly(doc, 'Urgent_Requested', req.user, req.body.note || 'Urgent document request', actionDate);
  await doc.save();

  await notifyRole('Inventory', {
    message: `Urgent inventory request: "${doc.name}" - Student: ${doc.student?.name}.`,
    type: 'doc_forwarded', documentId: doc._id, studentId: doc.student?._id, role: 'Inventory',
  });
  if (doc.university) {
    const uniUsers = await User.find({ role: 'University', universityId: doc.university, isActive: true }).select('_id').lean();
    await notify(uniUsers.map(u => u._id), {
      message: `Urgent document requested by Dispatch: "${doc.name}" - Student: ${doc.student?.name}`,
      type: 'doc_forwarded',
      documentId: doc._id,
      studentId: doc.student?._id,
      role: 'University',
    });
  }
  res.json(doc);
});

exports.inventoryMarkDispatchedDoc = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  await assertInventoryStudentAccess(req, doc.student);
  if (!['Admin','Dispatch'].includes(req.user.role)) {
    const e = new Error('Only Dispatch/Admin can mark documents dispatched'); e.status = 403; throw e;
  }
  if (doc.status === 'Delivered' || doc.status === 'Dispatched') {
    return res.json(doc);
  }
  pushHistory(doc, 'Dispatched', req.user, 'Already dispatched to center', asActionDate(req.body.dispatchedDate));
  await doc.save();
  res.json(doc);
});

exports.inventoryMarkDeliveredDoc = asyncHandler(async (req, res) => {
  const doc = await loadDoc(req.params.id);
  await assertInventoryStudentAccess(req, doc.student);
  if (!['Admin','Dispatch'].includes(req.user.role)) {
    const e = new Error('Only Dispatch/Admin can mark documents received by center'); e.status = 403; throw e;
  }
  const actionDate = asActionDate(req.body.deliveredDate);
  if (doc.status === 'Delivered') {
    return res.json(doc);
  }
  if (doc.status !== 'Dispatched') {
    addHistoryOnly(doc, 'Dispatched', req.user, 'Already dispatched to center', actionDate);
  }
  pushHistory(doc, 'Delivered', req.user, 'Already received by center', actionDate);
  await doc.save();
  res.json(doc);
});

exports.remove = asyncHandler(async (req, res) => {
  await StudentDoc.findByIdAndDelete(req.params.id);
  res.status(204).end();
});
