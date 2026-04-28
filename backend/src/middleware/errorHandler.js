const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const notFound = (req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

const errorHandler = (error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational || statusCode < 500;

  if (!isOperational) {
    logger.error(error);
  }

  res.status(statusCode).json({
    success: false,
    message: isOperational ? error.message : 'Internal server error',
    ...(error.details ? { details: error.details } : {})
  });
};

module.exports = { notFound, errorHandler };
