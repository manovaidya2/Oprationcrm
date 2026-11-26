const mongoose = require('mongoose');

// "New Inventory": a marksheet or other document of a student that is physically held in the office.
// Kept apart from the older Document Inventory (StudentDocument with origin 'Inventory').
// When the accountant approves an Other Documents request, a held document of the same name answers it
// (see documentController.accountantAction): the request goes to Dispatch instead of the university.

// the name a document is matched by: case and spacing do not matter
const nameKeyOf = name => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

const matchSchema = new mongoose.Schema({
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentDocument', required: true },
  at:      { type: Date, default: Date.now },
  by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },   // the accountant who approved the request
}, { _id: false });

// a scan of the held document (Dispatch's Upload Scan), kept so it can be downloaded later
const fileSchema = new mongoose.Schema({
  url:        { type: String, required: true },
  name:       { type: String, trim: true },
  sizeKb:     { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  request:    { type: mongoose.Schema.Types.ObjectId, ref: 'StudentDocument' },   // the request it was scanned for
}, { _id: false });

// what happened to the document, newest last (received, correction checked / sent for correction, scan, centre)
const logSchema = new mongoose.Schema({
  action: { type: String, required: true },
  at:     { type: Date, default: Date.now },
  by:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  note:   { type: String, trim: true },
}, { _id: false });

const inventoryDocumentSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  center:  { type: mongoose.Schema.Types.ObjectId, ref: 'Center' },
  section: { type: String, enum: ['Marksheet', 'Other'], required: true },
  name:    { type: String, required: true, trim: true },
  nameKey: { type: String, required: true },
  note:    { type: String, trim: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // added by Dispatch marking a request received from the university: that request and the date it arrived
  fromRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentDocument' },
  receivedAt:  { type: Date },
  files: [fileSchema],
  // where the document is now: in the office until it is sent to the centre (Dispatch couriers it), then
  // received by the centre (the centre confirms, or Dispatch marks it). Only one still in the office answers a request.
  sentToCentreAt:   { type: Date },
  sentToCentreBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  centreReceivedAt: { type: Date },
  centreReceivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Dispatch's correction check: checked (who / when); sent back to the university for correction (away until
  // the corrected copy is received again)
  correctionCheckedAt: { type: Date },
  correctionCheckedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  correctionSentAt:    { type: Date },
  log: [logSchema],
  // requests this document answered
  matches: [matchSchema],
}, { timestamps: true });

// one entry per document name in each tab of a student
inventoryDocumentSchema.index({ student: 1, section: 1, nameKey: 1 }, { unique: true });

inventoryDocumentSchema.pre('validate', function (next) {
  this.nameKey = nameKeyOf(this.name);
  next();
});

const InventoryDocument = mongoose.model('InventoryDocument', inventoryDocumentSchema);
InventoryDocument.nameKeyOf = nameKeyOf;
module.exports = InventoryDocument;
