import * as conversationService from '../services/conversationService.js';

export const createConversation = async (req, res, next) => {
  try {
    const { conversation, created } = await conversationService.createOrGetPrivateConversation(
      req.user._id,
      req.body.participantId
    );
    res.status(created ? 201 : 200).json({ success: true, data: { conversation } });
  } catch (err) {
    next(err);
  }
};

export const listConversations = async (req, res, next) => {
  try {
    const conversations = await conversationService.listConversations(req.user._id);
    res.status(200).json({ success: true, data: { conversations } });
  } catch (err) {
    next(err);
  }
};

export const getConversation = async (req, res, next) => {
  try {
    const conversation = await conversationService.getConversationById(req.user._id, req.params.id);
    res.status(200).json({ success: true, data: { conversation } });
  } catch (err) {
    next(err);
  }
};

export const deleteConversation = async (req, res, next) => {
  try {
    await conversationService.deleteConversation(req.user._id, req.params.id);
    res.status(200).json({ success: true, message: 'Conversation deleted' });
  } catch (err) {
    next(err);
  }
};
