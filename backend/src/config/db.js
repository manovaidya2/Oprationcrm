const mongoose = require('mongoose');

module.exports = async function connectDB() {
  // Support both MONGODB_URI (Atlas standard) and MONGO_URI (legacy)
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in .env');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('MongoDB connected');
};
