import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RouteEntity } from './entities/route.entity';
import { StopEntity } from './entities/stop.entity';
import { TransitController } from './transit.controller';
import { TransitService } from './transit.service';

@Module({
  imports: [TypeOrmModule.forFeature([RouteEntity, StopEntity])],
  controllers: [TransitController],
  providers: [TransitService],
})
export class TransitModule {}
