// One-time move of the old Document Inventory into the New Inventory (the old inventory page is removed).
// Every document that has reached the office — received from the university, sent to the centre, or received by
// the centre — whether marked on the old inventory page or come through a centre request, gets an entry in its
// student's New Inventory: the Marksheet tab for marksheets / transcripts (by name, as on the request tabs), else
// Other; marked where it is now (in the office / sent to the centre / received by the centre).
// An entry already there is kept and brought up to date (never moved back). Scans are kept with the entry.
// Nothing is deleted, and running it again changes nothing.
//
//   node src/scripts/move-old-inventory.js           -> list only
//   node src/scripts/move-old-inventory.js --apply   -> move them
require('dotenv').config();
const mongoose = require('mongoose');
const StudentDoc = require('../models/StudentDocument');
const InventoryDocument = require('../models/InventoryDocument');
const { audit } = require('../utils/helpers');

// in the office or beyond: received from the university at some point
const REACHED_OFFICE = ['Dispatch_Received', 'Scanned', 'Accountant_Received', 'Counselor_Received', 'Center_Notified',
  'Payment_Submitted', 'Payment_Verified', 'Dispatched', 'Delivered'];
const STATE_RANK = { office: 0, sent: 1, received: 2 };
const STATE_TEXT = { office: 'in the office', sent: 'sent to the centre', received: 'received by the centre' };

const isMarksheetName = name => /marksheet|transcript/i.test(name || '');
const sectionOf = doc => doc.section || (isMarksheetName(doc.name) ? 'Marksheet' : 'Other');
const lastEntry = (doc, status) => [...(doc.statusHistory || [])].reverse().find(h => h.status === status);
const day = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '-');

// where one document is, with the dates and who marked them
function placeOf(doc) {
  const delivered = lastEntry(doc, 'Delivered');
  const dispatched = lastEntry(doc, 'Dispatched');
  const received = lastEntry(doc, 'Dispatch_Received');
  const out = {
    receivedAt: doc.receivedFromUniversityAt || received?.at || doc.createdAt,
    receivedBy: doc.receivedFromUniversityBy || received?.changedBy || doc.uploadedBy,
    sentAt: dispatched?.at || doc.centerCourierInfo?.dispatchDate || null,
    sentBy: dispatched?.changedBy || doc.centerCourierInfo?.sentBy || null,
    centreAt: delivered?.at || null,
    centreBy: delivered?.changedBy || null,
  };
  if (doc.status === 'Delivered' || delivered) return { ...out, state: 'received', centreAt: out.centreAt || doc.updatedAt };
  if (doc.status === 'Dispatched' || dispatched || doc.centerCourierInfo?.trackingNo) return { ...out, state: 'sent', sentAt: out.sentAt || doc.updatedAt };
  return { ...out, state: 'office' };
}

const stateOfEntry = item => (item.centreReceivedAt ? 'received' : item.sentToCentreAt ? 'sent' : 'office');

async function moveOldInventory({ apply = false, log = console.log } = {}) {
  const docs = await StudentDoc.find({
    origin: { $ne: 'Added' },
    student: { $ne: null },
    $or: [{ status: { $in: REACHED_OFFICE } }, { status: 'Closed', closedFromStatus: 'Dispatch_Received' }],
  }).populate('student', 'name enrollmentNumber').lean();

  // one entry per student, tab and document name
  const groups = new Map();
  for (const doc of docs) {
    if (!doc.student?._id || !String(doc.name || '').trim()) continue;
    const section = sectionOf(doc);
    const key = `${doc.student._id}|${section}|${InventoryDocument.nameKeyOf(doc.name)}`;
    if (!groups.has(key)) groups.set(key, { student: doc.student, section, docs: [] });
    groups.get(key).docs.push({ doc, place: placeOf(doc) });
  }

  const totals = { added: 0, updated: 0, unchanged: 0, office: 0, sent: 0, received: 0, Marksheet: 0, Other: 0 };
  for (const { student, section, docs: list } of groups.values()) {
    // the furthest along decides where it is; the earliest receipt is when it came
    const best = list.reduce((a, b) => (STATE_RANK[b.place.state] > STATE_RANK[a.place.state]
      || (STATE_RANK[b.place.state] === STATE_RANK[a.place.state] && new Date(b.doc.updatedAt || 0) > new Date(a.doc.updatedAt || 0)) ? b : a));
    const receivedAt = list.map(x => x.place.receivedAt).filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0] || new Date();
    const files = list.filter(x => x.doc.scannedUrl).map(x => ({
      url: x.doc.scannedUrl, name: x.doc.scannedName || x.doc.name, uploadedAt: lastEntry(x.doc, 'Scanned')?.at || x.doc.updatedAt, request: x.doc._id,
    }));
    const placeFields = p => ({
      ...(p.state !== 'office' && p.sentAt ? { sentToCentreAt: p.sentAt, ...(p.sentBy ? { sentToCentreBy: p.sentBy } : {}) } : {}),
      ...(p.state === 'received' ? { centreReceivedAt: p.centreAt, ...(p.centreBy ? { centreReceivedBy: p.centreBy } : {}) } : {}),
    });
    const name = best.doc.name.trim();
    const who = `${student.name}${student.enrollmentNumber ? ` (${student.enrollmentNumber})` : ''}`;
    const where = `${STATE_TEXT[best.place.state]}${best.place.state === 'received' ? ` ${day(best.place.centreAt)}` : best.place.state === 'sent' ? ` ${day(best.place.sentAt)}` : ''}`;

    const existing = await InventoryDocument.findOne({ student: student._id, section, nameKey: InventoryDocument.nameKeyOf(name) }).lean();
    let entryId = existing?._id;
    if (!existing) {
      totals.added += 1; totals[best.place.state] += 1; totals[section] += 1;
      log(`${apply ? 'Added' : 'Would add'}: ${who} | ${section} | ${name} | ${where}`);
      if (apply) {
        const created = await InventoryDocument.create({
          student: student._id, center: best.doc.center, section, name,
          note: 'Moved from the old inventory', addedBy: best.place.receivedBy || undefined,
          fromRequest: best.doc._id, receivedAt, files, ...placeFields(best.place),
        });
        entryId = created._id;
      }
    } else {
      const set = {};
      if (STATE_RANK[best.place.state] > STATE_RANK[stateOfEntry(existing)]) Object.assign(set, placeFields(best.place));
      if (!existing.fromRequest) set.fromRequest = best.doc._id;
      if (!existing.receivedAt) set.receivedAt = receivedAt;
      const newFiles = files.filter(f => !(existing.files || []).some(x => x.url === f.url));
      if (!Object.keys(set).length && !newFiles.length) { totals.unchanged += 1; }
      else {
        totals.updated += 1;
        log(`${apply ? 'Updated' : 'Would update'}: ${who} | ${section} | ${name} | ${set.centreReceivedAt || set.sentToCentreAt ? where : `already ${STATE_TEXT[stateOfEntry(existing)]}`}${newFiles.length ? ` | +${newFiles.length} scan(s)` : ''}`);
        if (apply) await InventoryDocument.updateOne({ _id: existing._id }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(newFiles.length ? { $push: { files: { $each: newFiles } } } : {}) });
      }
    }
    // the requests now point at their entry (so the centre's confirmation later updates it)
    if (apply && entryId) {
      await StudentDoc.updateMany({ _id: { $in: list.map(x => x.doc._id) }, inventoryItem: null, receivedIntoInventory: null }, { $set: { receivedIntoInventory: entryId } });
    }
  }

  log(`${groups.size} document(s) found: ${totals.added} new (${totals.office} in the office, ${totals.sent} sent, ${totals.received} received by the centre; ${totals.Marksheet} marksheet, ${totals.Other} other), ${totals.updated} to bring up to date, ${totals.unchanged} already right.`);
  if (apply) await audit('old_inventory_moved', 'InventoryDocument', null, { role: 'System' }, totals, 'Old inventory moved into the New Inventory');
  else log('Nothing was changed. Run with --apply to move them.');
  return totals;
}

module.exports = { moveOldInventory };

if (require.main === module) {
  const connectDB = require('../config/db');
  connectDB()
    .then(() => moveOldInventory({ apply: process.argv.includes('--apply') }))
    .catch(e => { console.error(e); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
}
