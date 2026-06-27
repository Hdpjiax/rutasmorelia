import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TransitModule } from './transit/transit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.get<string>(
          'DATABASE_URL',
          'postgresql://rutas:rutas@localhost:5432/rutas_morelia',
        ),
        autoLoadEntities: true,
        synchronize: false,
        ssl:
          config.get('DATABASE_SSL') === 'true'
            ? { rejectUnauthorized: true }
            : false,
        extra: {
          max: Number(config.get('DATABASE_POOL_SIZE', '10')),
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
        },
      }),
    }),
    TransitModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
