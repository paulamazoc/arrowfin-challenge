/**
 * Server-side request identity.
 * Production would populate this from verified JWT/session claims, never from the client body.
 */
export type AuthenticatedIdentity = {
  traderId: string;
  brokerId: string;
};
