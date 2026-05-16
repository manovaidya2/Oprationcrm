const mongoose = require('mongoose');

const universitySchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  shortName:    { type: String, trim: true },        // e.g. "DU", "BHU"
  email:        { type: String, trim: true, lowercase: true },
  phone:        { type: String, trim: true },
  address:      { type: String, trim: true },
  city:         { type: String, trim: true },
  state:        { type: String, trim: true },
  website:      { type: String, trim: true },
  logoUrl:      { type: String },
  avatarColor:  { type: String, default: '#8b5cf6' },
  isActive:     { type: Boolean, default: true },
  // The User accounts (role=University) linked to this university
  // University users have universityId set on their User doc
}, { timestamps: true });

module.exports = mongoose.model('University', universitySchema);
