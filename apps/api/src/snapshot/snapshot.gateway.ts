import { Injectable } from '@nestjs/common';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { AuthenticatedIdentity } from '../auth/authenticated-identity.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DATASET_NOW } from './snapshot.constants.js';
import { snapshotRoom } from './snapshot.room.js';

function handshakeValue(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Development-only socket identity.
 */
@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3001'],
  },
})
@Injectable()
export class SnapshotGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: Socket): Promise<void> {
    const env = process.env.NODE_ENV ?? 'development';
    if (env !== 'development' && env !== 'test') {
      client.disconnect(true);
      return;
    }

    const traderId = handshakeValue(client.handshake.auth.traderId);
    const brokerId = handshakeValue(client.handshake.auth.brokerId);
    if (!traderId || !brokerId) {
      client.disconnect(true);
      return;
    }

    const trader = await this.prisma.trader.findFirst({
      where: { id: traderId, brokerId },
      select: { id: true },
    });
    if (!trader) {
      client.disconnect(true);
      return;
    }

    await client.join(snapshotRoom(brokerId, traderId));
  }

  emitSnapshotUpdated(identity: AuthenticatedIdentity): void {
    this.server
      .to(snapshotRoom(identity.brokerId, identity.traderId))
      .emit('snapshot.updated', { asOf: DATASET_NOW.toISOString() });
  }
}
