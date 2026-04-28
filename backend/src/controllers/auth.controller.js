const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const authService = require('../services/auth.service');

const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.validated.body, req.user || null, req);
  sendSuccess(res, user, undefined, 201);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.validated.body, req);
  sendSuccess(res, result);
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getCurrentUser(req.user.id);
  sendSuccess(res, user);
});

const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout(req.user, req);
  sendSuccess(res, result);
});

module.exports = {
  register,
  login,
  me,
  logout
};
