const mongoose = require('mongoose');

const centerSchema = new mongoose.Schema({
  // Screen 1 - Basic Details
  organisationType: {
    type: String,
    enum: ['Education Consultant','Admission Centre','Coaching Institute','School/Institute','Freelance Consultant','Other',''],
    trim: true,
  },
  fullName:         { type: String, trim: true },       // Contact person name
  organisationName: { type: String, required: true, trim: true },
  name:             { type: String, required: true, trim: true }, // Display name (same as org name)
  emailId:          { type: String, trim: true, lowercase: true },
  city:             { type: String, required: true, trim: true },
  state:            { type: String, trim: true },
  address:          { type: String, trim: true },
  website:          { type: String, trim: true },       // Website / Instagram / Google profile
  contactNumber:    { type: String, trim: true },

  // Screen 2 - Fill Below
  experience: {
    type: String,
    enum: ['0 to 1 year','1 to 3 years','3 to 7 years','7+ years',''],
    trim: true,
  },
  teamSize: {
    type: String,
    enum: ['Solo','2 to 5','6 to 15','15+',''],
    trim: true,
  },
  monthlyEnquiries: {
    type: String,
    enum: ['Under 20','20 to 50','50 to 150','150+',''],
    trim: true,
  },
  coverage: {
    type: String,
    enum: ['City','State','Multiple States','PAN India',''],
    trim: true,
  },
  programInterest:  { type: [String], default: [] },   // UG, PG, Diploma/Certificate, Research/PhD
  streams:          { type: [String], default: [] },   // Management, IT/Computer, Education, etc.
  timeline: {
    type: String,
    enum: ['Immediate (0 to 15 days)','15 to 30 days','1 to 3 months','Not sure',''],
    trim: true,
  },

  isActive:          { type: Boolean, default: true },
  feeStructureType:  { type: String, enum: ['Very Special', 'Special', 'Normal'], default: 'Normal' },
  loginProvisionStatus: { type: String, enum: ['Login Provided', 'Login Not Provided'], default: 'Login Not Provided' },
  assignedCounselor: { type: mongoose.Schema.Types.ObjectId, ref: 'Counselor' },

  // Universities this center is allowed to apply to (set by counselor)
  allowedUniversities: [{ type: mongoose.Schema.Types.ObjectId, ref: 'University' }],
  allowedPaymentAccounts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAccount' }],

  // Verification documents uploaded by counselor
  verificationDocs: [{
    name:      { type: String, required: true },   // e.g. "GST Certificate"
    fileUrl:   { type: String },
    fileName:  { type: String },
    sizeKb:    { type: Number, default: 0 },
    uploadedAt:{ type: Date,   default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Center', centerSchema);
