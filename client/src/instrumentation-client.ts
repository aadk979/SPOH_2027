import { z } from 'zod';

// Even Zod's caught evaluation probe reports a CSP violation. Configure its
// interpreter before application schemas load, preserving the strict policy.
z.config({ jitless: true });
