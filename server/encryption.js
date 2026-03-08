import crypto from 'node:crypto';

// Use a fixed key/iv when no environment variables are provided so that
// service restarts don't break existing records.  Keys are hex-encoded
// strings (32 bytes for key, 16 bytes for iv).  In production you should
// override these with real secure values via env vars.
const DEFAULT_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const DEFAULT_IV = '0102030405060708090a0b0c0d0e0f10';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  : Buffer.from(DEFAULT_KEY, 'hex');

const ENCRYPTION_IV = process.env.ENCRYPTION_IV
  ? Buffer.from(process.env.ENCRYPTION_IV, 'hex')
  : Buffer.from(DEFAULT_IV, 'hex');

export function encryptText(text) {
  if (!text) return '';

  try {
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, ENCRYPTION_IV);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return '';
  }
}

export function decryptText(encryptedText) {
  if (!encryptedText) return '';

  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, ENCRYPTION_IV);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return '';
  }
}

export function encryptImagePath(imagePath) {
  return encryptText(imagePath);
}

export function decryptImagePath(encryptedPath) {
  return decryptText(encryptedPath);
}
