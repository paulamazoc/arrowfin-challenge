/** Fixed assessment clock. Never substitute Date.now() or the machine clock. */
export const DATASET_NOW = new Date('2026-08-25T14:30:00Z');

/**
 * CME session open date already derived for DATASET_NOW (see prisma/cme-session.ts).
 * 2026-08-25T14:30:00Z is 09:30 America/Chicago, so the open session is 2026-08-24.
 */
export const DATASET_CURRENT_SESSION_DATE = '2026-08-24';
