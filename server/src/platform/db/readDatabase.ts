import type { PrismaTransactionClient } from './client.js';
import type { EventScope } from './eventScope.js';
/** Source repositories receive only scoped data access, never an authority engine. */
export interface ReadDatabase { readonly scope: EventScope; readonly db: PrismaTransactionClient }
