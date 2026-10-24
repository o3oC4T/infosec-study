const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});
const CONTENT_CONTEXT = 'infosec-final-content-v1';
export const VAULT_FORMAT = 'infosec-final-v1';
export const PROGRESS_KEY = 'infosec-final-progress-v1';
const encode = value => {
  let binary = '';
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt, iterations}, material,
    {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}
async function seal(value, key, context) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: encoder.encode(context)}, key,
    encoder.encode(JSON.stringify(value)));
  return {iv: encode(iv), ciphertext: encode(ciphertext)};
}
async function open(envelope, key, context) {
  if (!envelope || typeof envelope.iv !== 'string' || typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > 4_000_000) throw new Error('Invalid encrypted data');
  const iv = decode(envelope.iv);
  if (iv.length !== 12) throw new Error('Invalid IV');
  const data = await crypto.subtle.decrypt({name: 'AES-GCM', iv, additionalData: encoder.encode(context)}, key, decode(envelope.ciphertext));
  return JSON.parse(decoder.decode(data));
}
export async function encryptContent(value, password) {
  if (typeof password !== 'string' || !password.length) throw new Error('A password is required');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 600_000;
  const key = await derive(password, salt, iterations);
  return {format: VAULT_FORMAT, iterations, salt: encode(salt), ...await seal(value, key, CONTENT_CONTEXT)};
}
export async function decryptContent(envelope, password) {
  if (envelope?.format !== VAULT_FORMAT || !Number.isInteger(envelope.iterations) || envelope.iterations < 600_000 || envelope.iterations > 2_000_000 || typeof envelope.salt !== 'string') throw new Error('Invalid vault');
  const salt = decode(envelope.salt);
  if (salt.length !== 16) throw new Error('Invalid salt');
  const key = await derive(password, salt, envelope.iterations);
  return {data: await open(envelope, key, CONTENT_CONTEXT), key};
}
export const encryptProgress = (value, key, revision) => seal(value, key, `infosec-final-progress:${revision}`);
export const decryptProgress = (value, key, revision) => open(value, key, `infosec-final-progress:${revision}`);
