import { pingDatabase } from '../../../platform/db/client.js';

/** Ready means the database answers. Throws when it does not. */
export async function checkReadiness(): Promise<void> {
  await pingDatabase();
}
