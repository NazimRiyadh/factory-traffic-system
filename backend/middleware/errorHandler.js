/**
 * Global Express Error Handling Middleware.
 */

import logger from '../utils/logger.js';

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

export default errorHandler;
