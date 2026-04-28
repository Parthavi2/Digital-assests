const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const settingsService = require('../services/settings.service');

const profile = asyncHandler(async (req, res) => {
  sendSuccess(res, await settingsService.getProfile(req.user.id));
});

const updateProfile = asyncHandler(async (req, res) => {
  sendSuccess(res, await settingsService.updateProfile(req.user.id, req.validated.body, req));
});

const organization = asyncHandler(async (req, res) => {
  sendSuccess(res, await settingsService.getOrganizationSettings(req.user));
});

const updateOrganization = asyncHandler(async (req, res) => {
  sendSuccess(res, await settingsService.updateOrganizationSettings(req.user, req.validated.body, req));
});

const notifications = asyncHandler(async (req, res) => {
  sendSuccess(res, await settingsService.getNotificationPreferences(req.user));
});

const updateNotifications = asyncHandler(async (req, res) => {
  sendSuccess(res, await settingsService.updateNotificationPreferences(req.user, req.validated.body, req));
});

module.exports = {
  profile,
  updateProfile,
  organization,
  updateOrganization,
  notifications,
  updateNotifications
};
