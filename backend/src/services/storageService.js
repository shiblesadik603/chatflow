import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env.js';

// --- Local disk now, Cloudinary/S3 in production ---
//
// Every other part of the app only ever calls saveFile()/deleteFileByUrl()
// from this module - never touches fs directly. That's what makes the
// production swap painless: replace the two functions below with calls to
// the Cloudinary/S3 SDK (which take a buffer and return a URL, same
// shape), and nothing in uploadController.js has to change.
//
// Why not local disk in production? A few reasons that matter once you
// have more than one server: (1) uploaded files would only exist on
// whichever instance handled that request - a second instance serving a
// later request for the same file would 404. (2) redeploying (most
// platforms) wipes the filesystem. (3) no CDN, so every image request
// round-trips to your own server instead of an edge location near the
// user. Cloudinary/S3 solve all three: one shared store any instance can
// read from, survives deploys, and usually ships with CDN delivery built in.

export const UPLOAD_DIR = path.resolve(process.cwd(), env.UPLOAD_DIR);

export const saveFile = async (buffer, extension) => {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  // Always a server-generated name, never the client's original filename -
  // sidesteps path traversal entirely instead of trying to sanitize it away.
  const filename = `${crypto.randomUUID()}${extension}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return { url: `${env.PUBLIC_URL}/uploads/${filename}`, filename };
};

export const deleteFileByUrl = async (url) => {
  if (!url || !url.startsWith(`${env.PUBLIC_URL}/uploads/`)) {
    return; // not one of our local files (or empty) - nothing to clean up
  }
  const filename = url.split('/uploads/')[1];
  if (!filename) return;

  try {
    await fs.unlink(path.join(UPLOAD_DIR, filename));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err; // already gone is fine, anything else isn't
  }
};
