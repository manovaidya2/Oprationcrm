const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:  { type: String, required: true, select: false },
  createdPassword: { type: String, select: false },
  role: {
    type: String,
    enum: ['Admin', 'Counselor', 'ViewerCounselor', 'Center', 'Accountant', 'University', 'Dispatch', 'PaymentCoordinator'],
    required: true,
  },
  // Counselor link
  counselorId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Counselor' },
  // Center link
  centerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Center' },
  // University link — set when role=University
  universityId: { type: mongoose.Schema.Types.ObjectId, ref: 'University' },
  avatarColor: { type: String, default: '#6366f1' },
  avatarSeed:  { type: String, trim: true, default: '' },
  isActive:    { type: Boolean, default: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
