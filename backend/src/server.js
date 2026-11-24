require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { startAutoCancelJob } = require('./jobs/autoCancelAdmissions');

const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB();
  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
  startAutoCancelJob();   // cancels admissions whose course fee was not paid in time (hourly)
})();
