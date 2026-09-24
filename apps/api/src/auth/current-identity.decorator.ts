import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedIdentity } from './authenticated-identity.js';
import { DEV_AUTH_IDENTITY_KEY } from './dev-auth.guard.js';

type DevAuthenticatedRequest = Request & {
  [DEV_AUTH_IDENTITY_KEY]?: AuthenticatedIdentity;
};

export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedIdentity => {
    const request = context.switchToHttp().getRequest<DevAuthenticatedRequest>();
    const identity = request[DEV_AUTH_IDENTITY_KEY];
    if (!identity) {
      throw new Error('Authenticated identity missing from request context');
    }
    return identity;
  },
);
