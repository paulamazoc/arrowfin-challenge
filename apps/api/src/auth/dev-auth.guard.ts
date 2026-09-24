import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedIdentity } from './authenticated-identity.js';

export const DEV_AUTH_IDENTITY_KEY = 'devAuthenticatedIdentity';

type DevAuthenticatedRequest = Request & {
  [DEV_AUTH_IDENTITY_KEY]?: AuthenticatedIdentity;
};

function headerValue(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isDevAuthAllowed(nodeEnv: string | undefined): boolean {
  const env = nodeEnv ?? 'development';
  return env === 'development' || env === 'test';
}

/**
 * Development-only identity source for the assessment.
 * Reads x-trader-id and x-broker-id and attaches them as authenticated request context.
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!isDevAuthAllowed(process.env.NODE_ENV)) {
      throw new UnauthorizedException('Development authentication is disabled');
    }

    const request = context.switchToHttp().getRequest<DevAuthenticatedRequest>();
    const traderId = headerValue(request.headers['x-trader-id']);
    const brokerId = headerValue(request.headers['x-broker-id']);

    if (!traderId || !brokerId) {
      throw new UnauthorizedException();
    }

    request[DEV_AUTH_IDENTITY_KEY] = { traderId, brokerId };
    return true;
  }
}
