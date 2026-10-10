import { createECDH } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** A P-256 VAPID key pair, generated once and retained as an encrypted JSON secret. */
export function vapidKeys(subject) {
  if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$|^https:\/\/[^\s]+$/.test(subject))
    throw new Error('VAPID subject must be a mailto address or HTTPS URL');
  const key = createECDH('prime256v1');
  key.generateKeys();
  return {
    publicKey: key.getPublicKey().toString('base64url'),
    privateKey: key.getPrivateKey().toString('base64url'),
    subject,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [subject, destination] = process.argv.slice(2);
  if (!subject || !destination)
    throw new Error('usage: provision-vapid.mjs <mailto:operator> <private-file.json>');
  // Refuse replacement: re-keying drops existing browser subscriptions.
  writeFileSync(destination, JSON.stringify(vapidKeys(subject)), { flag: 'wx', mode: 0o600 });
  console.log('VAPID keys written to the private destination; store them in Secrets Manager.');
}
