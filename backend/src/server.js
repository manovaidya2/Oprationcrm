require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initRealtime } = require('./utils/realtime');
const connectDB = require('./config/db');
const { startAutoCancelJob } = require('./jobs/autoCancelAdmissions');

const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB();
  const server = http.createServer(app);
  initRealtime(server);   // live updates (socket.io) on the same port
  server.listen(PORT, () => console.log(`API listening on :${PORT}`));
  startAutoCancelJob();   // cancels admissions whose course fee was not paid in time (hourly)
})();
