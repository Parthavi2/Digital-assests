const sendSuccess = (res, data, meta = undefined, statusCode = 200) => {
  res.status(statusCode).json({
    success: true,
    data,
    ...(meta ? { meta } : {})
  });
};

module.exports = { sendSuccess };
