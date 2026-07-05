// src/services/mfaService.js — TOTP (RFC 6238)
const crypto = require('crypto');

function base32Decode(str) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  str = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const out = [];
  let bits = 0, val = 0;
  for (const ch of str) {
    val = (val << 5) | alpha.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

async function getTOTPCode(secret, time) {
  const T = Math.floor((time || Date.now() / 1000) / 30);
  const msg = Buffer.alloc(8);
  let t = T;
  for (let i = 7; i >= 0; i--) { msg[i] = t & 0xff; t >>>= 8; }
  const keyBytes = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', keyBytes).update(msg).digest();
  const offset = hmac[19] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset+1] << 16 | hmac[offset+2] << 8 | hmac[offset+3]) % 1000000;
  return String(code).padStart(6, '0');
}

async function verifyTOTP(encryptedSecret, userCode) {
  const secret = decryptSecret(encryptedSecret);
  const now = Math.floor(Date.now() / 1000);
  for (const delta of [-1, 0, 1]) {
    const code = await getTOTPCode(secret, now + delta * 30);
    if (code === userCode.replace(/\s/g, '')) return true;
  }
  return false;
}

function encryptSecret(secret) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'), 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptSecret(encryptedSecret) {
  const [ivHex, encHex] = encryptedSecret.split(':');
  const key = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}

module.exports = { verifyTOTP, encryptSecret, decryptSecret, getTOTPCode };
