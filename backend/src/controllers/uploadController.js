import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { validateFileContent } from '../utils/fileValidation.js';
import { sanitizeFileName } from '../utils/sanitizeFileName.js';
import { saveFile, deleteFileByUrl } from '../services/storageService.js';

export const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('No file provided', 400, 'NO_FILE');
    }

    const { extension } = await validateFileContent(req.file.buffer, 'image');
    const { url } = await saveFile(req.file.buffer, extension);

    const previousAvatar = req.user.avatar;
    const user = await User.findByIdAndUpdate(req.user._id, { avatar: url }, { new: true });

    // Best-effort cleanup of the old file - never let this fail the request.
    if (previousAvatar) {
      deleteFileByUrl(previousAvatar).catch(() => {});
    }

    res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
};

export const uploadChatFile = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('No file provided', 400, 'NO_FILE');
    }

    const { mimeType, extension } = await validateFileContent(req.file.buffer, req.body.type);
    const { url } = await saveFile(req.file.buffer, extension);

    res.status(201).json({
      success: true,
      data: {
        url,
        fileName: sanitizeFileName(req.file.originalname),
        mimeType,
        size: req.file.size,
        // Only present for voice uploads - the client-reported recording
        // length, already validated by uploadTypeSchema.
        ...(req.body.type === 'voice' ? { duration: req.body.duration } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
};
