const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;


require('dotenv').config();
const { createClient } = require('./openaiClient');
const logger = require('./logger');
const { upload } = require('./multerConfig');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const apiRoutesFactory = require('./routes/api');

// Validate required environment variables
if (!process.env.OPEN_AI_KEY) {
  logger.error('Missing required environment variable: OPEN_AI_KEY');
  console.error('FATAL: Missing required environment variable: OPEN_AI_KEY');
  process.exit(1);
}

const cron = require('node-cron');
const path = require('path');
const { deleteOldFiles } = require('./utils/fileUtils');

const openai = createClient(process.env.OPEN_AI_KEY);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// mount API routes with dependencies
app.use('/api', apiRoutesFactory({ openai, upload, logsDir: logger.logsDir }));

// error handler
app.use(errorHandler);

app.listen(port, () => {
  logger.info(`Translation server listening on port ${port}`);
  logger.info(`Health check: http://localhost:${port}/api/health`);
  // Schedule cleanup of uploads directory every hour using node-cron
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
  cron.schedule('0 * * * *', () => {
    deleteOldFiles(uploadsDir, maxAgeMs);
    logger.info('Cron cleanup: deleted old files from uploads directory');
  });
});
