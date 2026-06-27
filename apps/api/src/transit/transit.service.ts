import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RouteEntity } from './entities/route.entity';
import { StopEntity } from './entities/stop.entity';
import { NearbyStopsDto } from './dto/nearby-stops.dto';

@Injectable()
export class TransitService {
  constructor(
    @InjectRepository(RouteEntity)
    private readonly routes: Repository<RouteEntity>,
    @InjectRepository(StopEntity)
    private readonly stops: Repository<StopEntity>,
  ) {}

  listRoutes() {
    return this.routes.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  nearbyStops({ lat, lng, radius }: NearbyStopsDto) {
    return this.stops.query(
      `select id, name, reference,
              ST_Y(location) as latitude,
              ST_X(location) as longitude,
              ST_Distance(
                location::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
              )::integer as distance_meters
         from stops
        where is_active = true
          and ST_DWithin(
            location::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3
          )
        order by location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
        limit 50`,
      [lng, lat, radius],
    );
  }
}
