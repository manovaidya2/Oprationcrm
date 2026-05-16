// Run once: node src/scripts/fix-notifications.js
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Notification = require('./models/Notification');
  
  const result = await Notification.updateMany(
    { message: /undefined/ },
    [{ $set: { 
      message: { 
        $replaceAll: { 
          input: '$message', 
          find: ': undefined', 
          replacement: '' 
        } 
      } 
    }}]
  );
  console.log('Fixed:', result.modifiedCount, 'notifications');
  await mongoose.disconnect();
}

main().catch(console.error);
