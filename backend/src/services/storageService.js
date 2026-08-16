import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';

// --- Local disk for development, Cloudinary once configured ---
//
// Every other part of the app only ever calls saveFile()/deleteFileByUrl()
// from this module - never touches fs directly. That's what makes this
// swap painless: both functions branch internally on whether Cloudinary
// credentials are present, so uploadController.js never has to change and
// local dev keeps working with zero Cloudinary account needed.
//
// Why not local disk in production? A few reasons that matter once you
// deploy: (1) most free/managed hosts (Render, etc.) wipe the filesystem on
// every redeploy or restart - uploaded files vanish. (2) a second instance
// serving a later request for the same file would 404. (3) no CDN, so every
// image request round-trips to your own server instead of an edge location
// near the user. Cloudinary solves all three.

const useCloudinary = Boolean(env.CLOUDINARY_CLOUD_NAME);

if (useCloudinary) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

export const UPLOAD_DIR = path.resolve(process.cwd(), env.UPLOAD_DIR);

const saveToCloudinary = (buffer, extension) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'auto', folder: 'chatflow', format: extension.replace('.', '') },
      (error, result) => (error ? reject(error) : resolve({ url: result.secure_url }))
    );
    stream.end(buffer);
  });

const saveToDisk = async (buffer, extension) => {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  // Always a server-generated name, never the client's original filename -
  // sidesteps path traversal entirely instead of trying to sanitize it away.
  const filename = `${crypto.randomUUID()}${extension}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return { url: `${env.PUBLIC_URL}/uploads/${filename}` };
};

export const saveFile = (buffer, extension) =>
  useCloudinary ? saveToCloudinary(buffer, extension) : saveToDisk(buffer, extension);

// Matches the public_id (including any folder prefix) out of a Cloudinary
// delivery URL, e.g. .../upload/v1234/chatflow/abc123.jpg -> chatflow/abc123
const CLOUDINARY_PUBLIC_ID_RE = /\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/;

const deleteFromCloudinary = async (url) => {
  const match = url && url.match(CLOUDINARY_PUBLIC_ID_RE);
  if (!match) return;
  try {
    // Only ever called for avatars (see uploadController.js), always images.
    await cloudinary.uploader.destroy(match[1], { resource_type: 'image' });
  } catch {
    // best-effort - a failed cleanup shouldn't surface anywhere
  }
};

const deleteFromDisk = async (url) => {
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

export const deleteFileByUrl = (url) => (useCloudinary ? deleteFromCloudinary(url) : deleteFromDisk(url));
