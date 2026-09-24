import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import {
  DEV_AUTH_IDENTITY_KEY,
  DevAuthGuard,
} from './dev-auth.guard.js';

function contextWithHeaders(
  headers: Record<string, string | string[] | undefined>,
): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('DevAuthGuard', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('attaches header identity as request context in test', () => {
    process.env.NODE_ENV = 'test';
    const context = contextWithHeaders({
      'x-trader-id': 'T-001',
      'x-broker-id': 'BRK-ARWP',
    });

    expect(new DevAuthGuard().canActivate(context)).toBe(true);
    expect(context.switchToHttp().getRequest()[DEV_AUTH_IDENTITY_KEY]).toEqual({
      traderId: 'T-001',
      brokerId: 'BRK-ARWP',
    });
  });

  it('fails closed outside development and test', () => {
    process.env.NODE_ENV = 'production';
    const context = contextWithHeaders({
      'x-trader-id': 'T-001',
      'x-broker-id': 'BRK-ARWP',
    });

    expect(() => new DevAuthGuard().canActivate(context)).toThrow(
      UnauthorizedException,
    );
  });
});
