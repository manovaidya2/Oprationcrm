const mongoose = require('mongoose');

const docPaymentSchema = new mongoose.Schema({
  amount:     { type: Number, required: true },
  mode:         { type: String, enum: ['UPI', 'Bank Transfer'], default: 'UPI' },
  // UPI fields
  upiId:        { type: String, trim: true },
  utrRef:       { type: String, trim: true },
  // Bank Transfer fields
  bankName:     { type: String, trim: true },
  accountHolder:{ type: String, trim: true },
  accountNumber:{ type: String, trim: true },
  ifscCode:     { type: String, trim: true },
  note:         { type: String, trim: true },
  paidAt:       { type: Date, default: Date.now },
  recordedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verified:     { type: Boolean, default: false },
  verifiedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: { type: Date },
  paidToAccount:      { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAccount' },
  paidToAccountLabel: { type: String, trim: true },
  paymentScreenshot:  { type: String, trim: true },
}, { _id: true });

const historyEntrySchema = new mongoose.Schema({
  status:    { type: String, required: true },
  note:      { type: String },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  at:        { type: Date, default: Date.now },
}, { _id: false });

const courierSchema = new mongoose.Schema({
  company:       { type: String, trim: true },
  trackingNo:    { type: String, trim: true },
  dispatchDate:  { type: Date },
  documentsDesc: { type: String, trim: true },
  sentBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sentAt:        { type: Date, default: Date.now },
}, { _id: false });

const coordinatorFollowupSchema = new mongoose.Schema({
  contactWith:         { type: String, enum: ['Center', 'Dispatch'], default: 'Center' },
  note:                { type: String, trim: true },
  outcome:             { type: String, trim: true },
  expectedPaymentDate: { type: Date },
  contactedAt:         { type: Date, default: Date.now },
  contactedBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: true });

const studentDocSchema = new mongoose.Schema({
  student:    { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  center:     { type: mongoose.Schema.Types.ObjectId, ref: 'Center',  required: true },
  counselor:  { type: mongoose.Schema.Types.ObjectId, ref: 'Counselor', required: true },
  university: { type: mongoose.Schema.Types.ObjectId, ref: 'University' }, // isolated per university

  // Document info
  name:      { type: String, required: true, trim: true },  // e.g. "Migration Certificate Sem1"
  type:      { type: String, trim: true },                  // Identity, Academic, Other
  note:      { type: String, trim: true },
  origin:    { type: String, enum: ['Request', 'Inventory'], default: 'Request' },
  requestType: { type: String, enum: ['Soft Copy', 'Hard Copy'], default: 'Soft Copy' },

  // Uploaded file
  fileUrl:   { type: String },
  sizeKb:    { type: Number, default: 0 },

  // Scanned copy from dispatch
  scannedUrl:  { type: String },
  scannedName: { type: String, trim: true },

  // Charge for this document
  chargeFee: { type: Number, default: 0 },
  totalPaid: { type: Number, default: 0 },  // auto

  // Payment history for this doc
  payments: [docPaymentSchema],

  // Document flow status
  status: {
    type: String,
    enum: [
      'Requested',          // center raised request
      'Forwarded',          // counselor forwarded to accountant
      'Fee_Pending',        // accountant checking fees
      'Fee_Rejected',       // accountant rejected
      'Fee_Approved',       // accountant approved → sent to university
      'Sent_To_University', // university notified
      'Dispatch_Received',  // dispatch got courier from university
      'Scanned',            // dispatch uploaded scan
      'Accountant_Received', // dispatch sent scan to accountant first
      'Counselor_Received', // accountant forwarded scan to counselor
      'Center_Notified',    // counselor forwarded to center, waiting payment
      'Payment_Submitted',  // center paid, accountant to verify
      'Payment_Verified',   // accountant verified payment
      'University_Dispatched', // university sent via courier to dispatch
      'Dispatched',         // dispatch sent courier to center
      'Delivered',          // center confirmed receipt
    ],
    default: 'Requested',
  },

  // Courier details from university (permanent — never overwritten)
  courierInfo: courierSchema,
  // Courier details when dispatching to center
  centerCourierInfo: courierSchema,

  // Full status history
  statusHistory: [historyEntrySchema],
  coordinatorFollowups: [coordinatorFollowupSchema],
  lastCoordinatorFollowupAt: { type: Date },
  nextCoordinatorFollowupDate: { type: Date },

  uploadedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Auto-compute totalPaid
studentDocSchema.pre('save', function (next) {
  this.totalPaid = this.payments.reduce((s, p) => s + (p.amount || 0), 0);
  next();
});

module.exports = mongoose.model('StudentDocument', studentDocSchema);
