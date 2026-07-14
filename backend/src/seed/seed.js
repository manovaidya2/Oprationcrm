require('dotenv').config();
const mongoose   = require('mongoose');
const connectDB  = require('../config/db');
const User       = require('../models/User');
const Center     = require('../models/Center');
const Counselor  = require('../models/Counselor');
const University = require('../models/University');
const Student    = require('../models/Student');
const Payment    = require('../models/Payment');
const StudentDoc = require('../models/StudentDocument');
const Notification = require('../models/Notification');
const AuditLog   = require('../models/AuditLog');

(async () => {
  await connectDB();
  console.log('Wiping collections...');
  await Promise.all([
    User.deleteMany({}), Center.deleteMany({}), Counselor.deleteMany({}),
    University.deleteMany({}),
    Student.deleteMany({}), Payment.deleteMany({}), StudentDoc.deleteMany({}),
    Notification.deleteMany({}), AuditLog.deleteMany({}),
  ]);

  const universities = await University.insertMany([
    { name: 'Delhi University', shortName: 'DU', city: 'Delhi', state: 'Delhi', avatarColor: '#6366f1' },
    { name: 'Mumbai University', shortName: 'MU', city: 'Mumbai', state: 'Maharashtra', avatarColor: '#10b981' },
    { name: 'Bangalore Tech University', shortName: 'BTU', city: 'Bangalore', state: 'Karnataka', avatarColor: '#f59e0b' },
  ]);

  const centers = await Center.insertMany([
    { name: 'Mumbai Central', city: 'Mumbai', state: 'Maharashtra', contactNumber: '+91 98765 43210', organisationName: 'EduTech Solutions' },
    { name: 'Delhi North', city: 'Delhi', state: 'Delhi', contactNumber: '+91 98112 33445', organisationName: 'Learning Edge' },
  ]);

  const counselors = await Counselor.insertMany([
    { name: 'Aarav Sharma', email: 'aarav@edu.io', avatarColor: '#6366f1', centers: [centers[0]._id] },
    { name: 'Priya Patel',  email: 'priya@edu.io', avatarColor: '#10b981', centers: [centers[1]._id] },
  ]);
  await Center.findByIdAndUpdate(centers[0]._id, { assignedCounselor: counselors[0]._id });
  await Center.findByIdAndUpdate(centers[1]._id, { assignedCounselor: counselors[1]._id });

  await User.create({ name: 'Admin',        email: 'admin@edu.io',       password: 'password123', role: 'Admin',       avatarColor: '#ef4444' });
  await User.create({ name: 'Aarav Sharma', email: 'aarav@edu.io',       password: 'password123', role: 'Counselor',   counselorId: counselors[0]._id, avatarColor: '#6366f1' });
  await User.create({ name: 'Priya Patel',  email: 'priya@edu.io',       password: 'password123', role: 'Counselor',   counselorId: counselors[1]._id, avatarColor: '#10b981' });
  await User.create({ name: 'Mumbai Center',email: 'mumbai@center.io',   password: 'password123', role: 'Center',      centerId: centers[0]._id });
  await User.create({ name: 'Delhi Center', email: 'delhi@center.io',    password: 'password123', role: 'Center',      centerId: centers[1]._id });
  await User.create({ name: 'Raj Accountant',email:'accountant@edu.io',  password: 'password123', role: 'Accountant',  avatarColor: '#f59e0b' });
  await User.create({ name: 'Payment Coordinator',email:'paymentcoordinator@edu.io',  password: 'password123', role: 'PaymentCoordinator',  avatarColor: '#14b8a6' });
  await User.create({ name: 'Dispatch',     email: 'dispatch@edu.io',    password: 'password123', role: 'Dispatch',    avatarColor: '#06b6d4' });
  await User.create({ name: 'Delhi Univ',    email: 'du@university.io',  password: 'password123', role: 'University', universityId: universities[0]._id, avatarColor: '#6366f1' });
  await User.create({ name: 'Mumbai Univ',   email: 'mu@university.io',  password: 'password123', role: 'University', universityId: universities[1]._id, avatarColor: '#10b981' });
  await User.create({ name: 'Bangalore Univ',email: 'btu@university.io', password: 'password123', role: 'University', universityId: universities[2]._id, avatarColor: '#f59e0b' });

  console.log('\n✅ Seeded successfully (multi-university)');
  console.log('Admin:           admin@edu.io');
  console.log('Counselor 1:     aarav@edu.io');
  console.log('Counselor 2:     priya@edu.io');
  console.log('Center 1:        mumbai@center.io');
  console.log('Center 2:        delhi@center.io');
  console.log('Accountant:      accountant@edu.io');
  console.log('Pay Coordinator: paymentcoordinator@edu.io');
  console.log('Dispatch:        dispatch@edu.io');
  console.log('University (DU): du@university.io');
  console.log('University (MU): mu@university.io');
  console.log('University(BTU): btu@university.io');

  mongoose.disconnect();
})();
