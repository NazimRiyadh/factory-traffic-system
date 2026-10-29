/**
 * Global Express Error Handling Middleware.
 */

const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error(`Unhandled error on ${req.method} ${req.url}:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'test' ? undefined : err.stack
  });

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred.',
    timestamp: new Date().toISOString()
  });
}

module.exports = errorHandler;
