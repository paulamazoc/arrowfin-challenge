import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SnapshotController } from './snapshot.controller.js';
import { SnapshotService } from './snapshot.service.js';
import { DATASET_NOW } from './snapshot.constants.js';

describe('SnapshotController', () => {
  let app: INestApplication;
  const getSnapshot = vi.fn();

  beforeEach(async () => {
    getSnapshot.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [SnapshotController],
      providers: [{ provide: SnapshotService, useValue: { getSnapshot } }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('does not accept another trader ID as a path or query parameter', async () => {
    getSnapshot.mockResolvedValue({
      accountBalance: 0,
      positions: [],
      realizedPnl: 0,
      unrealizedPnl: 0,
      commissions: 0,
      dayPnl: 0,
      positionsNotional: 0,
      riskScore: 0,
      asOf: DATASET_NOW,
    });

    await request(app.getHttpServer()).get('/snapshot/T-005').expect(404);

    await request(app.getHttpServer())
      .get('/snapshot')
      .query({ traderId: 'T-005', brokerId: 'BRK-SMPT' })
      .set('x-trader-id', 'T-001')
      .set('x-broker-id', 'BRK-ARWP')
      .expect(200);

    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(getSnapshot).toHaveBeenCalledWith({
      traderId: 'T-001',
      brokerId: 'BRK-ARWP',
    });
  });

  it('maps a missing tenant-scoped trader to generic Not Found', async () => {
    getSnapshot.mockRejectedValue(new NotFoundException());

    const response = await request(app.getHttpServer())
      .get('/snapshot')
      .set('x-trader-id', 'T-001')
      .set('x-broker-id', 'BRK-SMPT')
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      message: 'Not Found',
    });
  });
});
