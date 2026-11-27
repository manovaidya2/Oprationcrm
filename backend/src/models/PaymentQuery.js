const mongoose = require('mongoose');

// A counselor asks the Viewer Counselor(s) of a student's centre to get the course fee from the centre
// (raised from the counselor's Marksheet Requests page). It stays Open, with updates from either side,
// until it is closed with a confirmation (and a note).
const updateSchema = new mongoose.Schema({
  by:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  at:   { type: Date, default: Date.now },
  text: { type: String, trim: true, maxlength: 1000 },
}, { _id: true });

const paymentQuerySchema = new mongoose.Schema({
  student:  { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  center:   { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true },
  raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message:  { type: String, trim: true, maxlength: 1000 },
  // the course fee when it was raised
  feeAtRaise: {
    netFee:     { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    dueAmount:  { type: Number, default: 0 },
  },
  status:    { type: String, enum: ['Open', 'Closed'], default: 'Open' },
  updates:   [updateSchema],
  closedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closedAt:  { type: Date },
  closeNote: { type: String, trim: true, maxlength: 1000 },
}, { timestamps: true });

paymentQuerySchema.index({ center: 1, status: 1, createdAt: -1 });
paymentQuerySchema.index({ student: 1, status: 1 });

module.exports = mongoose.model('PaymentQuery', paymentQuerySchema);
