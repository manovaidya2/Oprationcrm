const mongoose = require('mongoose');

// A centre's advance account. Centres sometimes pay in advance, before their students are admitted.
//   Deposit - money received from the centre in advance (it is real bank money: the Bank Book counts it on this date)
//   Used    - part of that balance applied to students' fees (a settlement, or a single student's payment).
//             The money was already counted when it was deposited, so the fee payments it creates are NOT counted again.
// Balance = active deposits - active uses. A reversed entry no longer counts.
const centreAdvanceSchema = new mongoose.Schema({
  center:  { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true, index: true },
  kind:    { type: String, enum: ['Deposit', 'Used'], required: true },
  amount:  { type: Number, required: true, min: 0.01 },
  date:    { type: Date, required: true },
  // Deposit only: how the money arrived
  mode:    { type: String, enum: ['UPI', 'Bank Transfer', ''], default: '' },
  utrRef:  { type: String, trim: true },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAccount' },
  accountLabel: { type: String, trim: true },
  paymentScreenshot: { type: String, trim: true },
  note:    { type: String, trim: true },
  // Used only: where it went
  settlement: { type: mongoose.Schema.Types.ObjectId, ref: 'CenterSettlement' },
  student:    { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  payment:    { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  transactionId: { type: mongoose.Schema.Types.ObjectId },
  studentCount:  { type: Number },
  status:  { type: String, enum: ['Active', 'Reversed'], default: 'Active', index: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reversedAt: { type: Date },
  reversalReason: { type: String, trim: true },
}, { timestamps: true });

centreAdvanceSchema.index({ center: 1, date: 1, createdAt: 1 });

// Current balance of one centre (pass the session when called inside a transaction)
centreAdvanceSchema.statics.balanceOf = async function (centerId, session) {
  const rows = await this.aggregate([
    { $match: { center: new mongoose.Types.ObjectId(String(centerId)), status: 'Active' } },
    { $group: { _id: '$kind', total: { $sum: '$amount' } } },
  ]).session(session || null);
  const t = Object.fromEntries(rows.map(r => [r._id, r.total]));
  return Math.round(((t.Deposit || 0) - (t.Used || 0)) * 100) / 100;
};

module.exports = mongoose.model('CentreAdvance', centreAdvanceSchema);
