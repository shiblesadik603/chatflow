import * as messageService from '../services/messageService.js';

export const createMessage = async (req, res, next) => {
  try {
    const { message, created } = await messageService.createMessage(
      req.user._id,
      req.params.conversationId,
      req.body
    );
    res.status(created ? 201 : 200).json({ success: true, data: { message } });
  } catch (err) {
    next(err);
  }
};

export const listMessages = async (req, res, next) => {
  try {
    const result = await messageService.listMessages(req.user._id, req.params.conversationId, req.query);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const updateMessage = async (req, res, next) => {
  try {
    const message = await messageService.editMessage(req.user._id, req.params.id, req.body.content);
    res.status(200).json({ success: true, data: { message } });
  } catch (err) {
    next(err);
  }
};

export const deleteMessage = async (req, res, next) => {
  try {
    await messageService.deleteMessage(req.user._id, req.params.id);
    res.status(200).json({ success: true, message: 'Message deleted' });
  } catch (err) {
    next(err);
  }
};
