const logger = require('../logger');

module.exports = (err, req, res, next) => {
  logger.error('Unhandled error', { message: err?.message, stack: err?.stack });
  if (res.headersSent) return next(err);
  // Provide granular error info for known errors
  let status = err.status || 500;
  let errorType = err.name || 'Error';
  let errorMsg = err.message || 'Internal Server Error';
  let details = err.details || undefined;

  // For validation errors, provide more feedback
  if (status === 400 && errorType === 'ValidationError') {
    return res.status(400).json({ error: errorType, message: errorMsg, details });
  }

  // For other errors, provide type and message
  res.status(status).json({ error: errorType, message: errorMsg, details });
};
