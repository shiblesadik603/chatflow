import { fileTypeFromBuffer } from 'file-type';
import { AppError } from './AppError.js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// A curated allowlist, not a blocklist: we only accept formats we've
// explicitly vetted, so a format we forgot to consider is rejected by
// default rather than silently permitted. Note what's deliberately
// excluded: .svg (can embed executable JavaScript - a real stored-XSS
// vector if ever rendered directly), .exe/.sh/.js and any other
// executable or script type.
const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const EXTENSIONS_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

// Never trust the client's declared MIME type (req.file.mimetype) alone -
// it comes straight from the multipart Content-Type header, which a
// malicious client fully controls. This inspects the file's actual bytes
// (its "magic number" / signature) to determine what it really is, and
// that detected type - never the claimed one - is what gets used from
// here on for the allowlist check and the stored file's extension.
export const validateFileContent = async (buffer, category) => {
  const allowed = category === 'document' ? DOCUMENT_TYPES : IMAGE_TYPES;

  const detected = await fileTypeFromBuffer(buffer);

  if (!detected) {
    // Plain-text formats (.txt, .csv) have no magic number by design, so
    // this isn't automatically suspicious - but we also can't verify their
    // true content past "not a recognizable binary format in disguise",
    // so for the image category (which should always have a signature)
    // this is a hard rejection.
    if (category === 'document') {
      const isLikelyText = !buffer.subarray(0, 512).includes(0); // no null bytes = plausibly text
      if (isLikelyText) {
        return { mimeType: 'text/plain', extension: '.txt' };
      }
    }
    throw new AppError('Could not verify the uploaded file type', 400, 'INVALID_FILE_TYPE');
  }

  if (!allowed.has(detected.mime)) {
    throw new AppError(
      `File content does not match an allowed ${category} type (detected: ${detected.mime})`,
      400,
      'INVALID_FILE_TYPE'
    );
  }

  return { mimeType: detected.mime, extension: EXTENSIONS_BY_MIME[detected.mime] };
};
