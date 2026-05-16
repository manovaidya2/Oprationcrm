const mongoose = require('mongoose');

const counselorSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:       { type: String, trim: true },
  avatarColor: { type: String, default: '#6366f1' },
  centers:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Center' }],
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Counselor', counselorSchema);
