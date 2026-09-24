import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { SnapshotModule } from './snapshot/snapshot.module.js';

@Module({
  imports: [SnapshotModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
