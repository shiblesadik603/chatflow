import * as userService from '../services/userService.js';

export const getMe = async (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user } });
};

export const updateMe = async (req, res, next) => {
  try {
    const user = await userService.updateProfile(req.user._id, req.body);
    res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const user = await userService.getPublicProfile(req.params.id);
    res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
};

export const searchUsers = async (req, res, next) => {
  try {
    const users = await userService.searchUsers(req.user._id, req.query.q);
    res.status(200).json({ success: true, data: { users } });
  } catch (err) {
    next(err);
  }
};

export const blockUser = async (req, res, next) => {
  try {
    await userService.blockUser(req.user._id, req.params.id);
    res.status(200).json({ success: true, message: 'User blocked' });
  } catch (err) {
    next(err);
  }
};

export const unblockUser = async (req, res, next) => {
  try {
    await userService.unblockUser(req.user._id, req.params.id);
    res.status(200).json({ success: true, message: 'User unblocked' });
  } catch (err) {
    next(err);
  }
};
