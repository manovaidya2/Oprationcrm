const mongoose = require('mongoose');

// Manual money entries for the Bank Book / Cash Book:
//   Opening    - balance of an account (or cash) as on a date
//   Withdrawal - money taken out of an account
//   Expense    - an expense paid from an account or from cash
// Student collections are NOT stored here: the Bank Book reads them live from verified payments.
const accountEntrySchema = new mongoose.Schema({
  kind:    { type: String, enum: ['Opening', 'Withdrawal', 'Expense'], required: true, index: true },
  date:    { type: Date, required: true, index: true },
  head:    { type: String, trim: true },                         // expense head (Expense only)
  amount:  { type: Number, required: true, min: 0 },
  mode:    { type: String, enum: ['Cash', 'Bank'], default: 'Bank' },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAccount' },   // required when mode = Bank
  note:    { type: String, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

accountEntrySchema.index({ account: 1, date: 1 });

module.exports = mongoose.model('AccountEntry', accountEntrySchema);
