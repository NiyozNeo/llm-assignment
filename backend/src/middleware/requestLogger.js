const logger = require('../logger');

module.exports = (req, res, next) => {
  const safeHeaders = { ...req.headers };
  if (safeHeaders.authorization) safeHeaders.authorization = '[REDACTED]';
  logger.info(`HTTP ${req.method} ${req.url}`, { ip: req.ip || req.connection?.remoteAddress, query: req.query, headers: { host: safeHeaders.host } });
  next();
};
