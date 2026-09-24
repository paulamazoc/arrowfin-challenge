import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const env = process.env.NODE_ENV ?? 'development';
  if (env !== 'production') {
    app.enableCors({ origin: ['http://localhost:3001'] });
  }
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
