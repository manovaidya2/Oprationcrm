const mongoose = require('mongoose');

// Individual transaction entry
const transactionSchema = new mongoose.Schema({
  amount:      { type: Number, required: true, min: 0 },
  mode:        { type: String, enum: ['UPI', 'Bank Transfer'], default: 'UPI' },
  // UPI fields
  upiId:       { type: String, trim: true },
  utrRef:      { type: String, trim: true },   // UTR for both UPI and Bank Transfer
  // Bank Transfer fields
  bankName:    { type: String, trim: true },
  accountHolder:{ type: String, trim: true },
  accountNumber:{ type: String, trim: true },  
  ifscCode:    { type: String, trim: true },
  // paidToAccountLabel ke baad add karo:
  paymentScreenshot: { type: String, trim: true }, // file URL
  note:        { type: String, trim: true },
  paidAt:      { type: Date, default: Date.now },
  recordedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type:        { type: String, enum: ['Fee', 'Document'], default: 'Fee' },
  // If type=Document, link to which document
  documentRef: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentDocument' },
  // Verification flow for Fee payments added by Center
  verificationStatus: {
    type: String,
    enum: ['not_required', 'pending_counselor', 'pending_accountant', 'verified', 'rejected'],
    default: 'not_required',
  },
  verificationNote: { type: String, trim: true },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: { type: Date },
  // Which company account was payment made to
  paidToAccount:     { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAccount' },
  paidToAccountLabel:{ type: String, trim: true }, // denormalized label for quick display
}, { timestamps: true });

const installmentSchema = new mongoose.Schema({
  installmentNumber: { type: Number, required: true, min: 1 },
  paymentDate:       { type: Date, required: true },
  amount:            { type: Number, default: 0, min: 0 },
  reasonOrRequirement: { type: String, trim: true },
  paidAmount:        { type: Number, default: 0 },
  status:            { type: String, enum: ['Pending', 'Partially_Paid', 'Paid', 'Overdue'], default: 'Pending' },
  paidAt:            { type: Date },
}, { timestamps: true });

const paymentSchema = new mongoose.Schema({
  student:  { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, unique: true },
  center:   { type: mongoose.Schema.Types.ObjectId, ref: 'Center',  required: true },

  // Fee structure
  totalFee:   { type: Number, default: 0 },
  discount:   { type: Number, default: 0 },
  netFee:     { type: Number, default: 0 },  // auto = totalFee - discount
  paidAmount: { type: Number, default: 0 },  // auto = sum of Fee transactions
  dueAmount:  { type: Number, default: 0 },  // auto = netFee - paidAmount

  // All transactions (fee + document)
  transactions: [transactionSchema],

  // Planned fee installments for payment follow-up.
  installments: [installmentSchema],

  notes: { type: String, trim: true },
}, { timestamps: true });

// Recompute running totals on every save
paymentSchema.pre('save', function (next) {
  this.netFee     = Math.max(0, (this.totalFee || 0) - (this.discount || 0));
  this.paidAmount = this.transactions
    .filter(t => t.type === 'Fee')
    .reduce((s, t) => s + (t.amount || 0), 0);
  this.dueAmount  = Math.max(0, this.netFee - this.paidAmount);
  let remainingPaid = this.paidAmount || 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ordered = [...(this.installments || [])].sort((a, b) => {
    const byDate = new Date(a.paymentDate || 0) - new Date(b.paymentDate || 0);
    return byDate || (a.installmentNumber || 0) - (b.installmentNumber || 0);
  });
  ordered.forEach(inst => {
    const amount = Number(inst.amount || 0);
    const applied = amount > 0 ? Math.min(amount, remainingPaid) : 0;
    inst.paidAmount = applied;
    if (amount > 0) remainingPaid = Math.max(0, remainingPaid - applied);
    const dueDate = inst.paymentDate ? new Date(inst.paymentDate) : null;
    if (dueDate) dueDate.setHours(0, 0, 0, 0);
    if (amount > 0 && applied >= amount) {
      inst.status = 'Paid';
      if (!inst.paidAt) inst.paidAt = new Date();
    } else if (amount > 0 && applied > 0) {
      inst.status = 'Partially_Paid';
      inst.paidAt = undefined;
    } else if (dueDate && dueDate < today) {
      inst.status = 'Overdue';
      inst.paidAt = undefined;
    } else {
      inst.status = 'Pending';
      inst.paidAt = undefined;
    }
  });
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);
