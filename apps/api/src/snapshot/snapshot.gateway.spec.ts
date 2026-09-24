import { SnapshotGateway } from './snapshot.gateway.js';
import { snapshotRoom } from './snapshot.room.js';

describe('SnapshotGateway', () => {
  it('disconnects an invalid tenant identity and does not join a room', async () => {
    const prisma = {
      trader: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const gateway = new SnapshotGateway(prisma as never);
    const client = {
      handshake: { auth: { traderId: 'T-001', brokerId: 'BRK-SMPT' } },
      join: vi.fn(),
      disconnect: vi.fn(),
    };

    await gateway.handleConnection(client as never);

    expect(prisma.trader.findFirst).toHaveBeenCalledWith({
      where: { id: 'T-001', brokerId: 'BRK-SMPT' },
      select: { id: true },
    });
    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('joins a server-derived room for a valid tenant pair', async () => {
    const prisma = {
      trader: { findFirst: vi.fn().mockResolvedValue({ id: 'T-001' }) },
    };
    const gateway = new SnapshotGateway(prisma as never);
    const client = {
      handshake: { auth: { traderId: 'T-001', brokerId: 'BRK-ARWP' } },
      join: vi.fn(),
      disconnect: vi.fn(),
    };

    await gateway.handleConnection(client as never);

    expect(client.join).toHaveBeenCalledWith(
      snapshotRoom('BRK-ARWP', 'T-001'),
    );
    expect(client.disconnect).not.toHaveBeenCalled();
  });
});
