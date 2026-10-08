const mongoose = require('mongoose');

const allocationSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
  transactionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  totalFee: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 0 },
}, { _id: false });

const centerSettlementSchema = new mongoose.Schema({
  center: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true, index: true },
  billingMonth: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  dateBasis: { type: String, enum: ['createdAt', 'submittedAt'], required: true },
  amount: { type: Number, required: true, min: 0 },
  studentCount: { type: Number, required: true, min: 1 },
  mode: { type: String, enum: ['UPI', 'Bank Transfer'], required: true },
  utrRef: { type: String, trim: true },
  upiId: { type: String, trim: true },
  bankName: { type: String, trim: true },
  accountHolder: { type: String, trim: true },
  accountNumber: { type: String, trim: true },
  ifscCode: { type: String, trim: true },
  paidAt: { type: Date, required: true },
  note: { type: String, trim: true },
  paidToAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAccount' },
  paidToAccountLabel: { type: String, trim: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['Completed', 'Reversed'], default: 'Completed', index: true },
  lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastEditedAt: { type: Date },
  editReason: { type: String, trim: true },
  reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reversedAt: { type: Date },
  reversalReason: { type: String, trim: true },
  allocations: [allocationSchema],
}, { timestamps: true });

centerSettlementSchema.index({ center: 1, billingMonth: 1, createdAt: -1 });

module.exports = mongoose.model('CenterSettlement', centerSettlementSchema);
