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

  async getTrafficFeed() {
    const routes = await this.routes.find({ where: { isActive: true } });
    const features: any[] = [];
    const now = new Date();
    const hour = now.getHours();

    for (const route of routes) {
      if (
        !route.geometry ||
        !route.geometry.coordinates ||
        route.geometry.coordinates.length < 2
      ) {
        continue;
      }

      const coords = route.geometry.coordinates;
      for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i + 1];

        const coordSum = p1[0] + p1[1] + p2[0] + p2[1];
        const seed =
          Math.floor(Math.abs(Math.sin(coordSum) * 100000)) + now.getMinutes();

        let trafficLevel: 'low' | 'medium' | 'heavy' = 'low';
        let speed = 45;

        const isRushHour =
          (hour >= 8 && hour <= 9) ||
          (hour >= 13 && hour <= 14) ||
          (hour >= 18 && hour <= 19);
        const rand = seed % 100;

        if (isRushHour) {
          if (rand < 40) {
            trafficLevel = 'heavy';
            speed = 10 + (seed % 10);
          } else if (rand < 80) {
            trafficLevel = 'medium';
            speed = 22 + (seed % 8);
          } else {
            trafficLevel = 'low';
            speed = 38 + (seed % 12);
          }
        } else {
          if (rand < 10) {
            trafficLevel = 'heavy';
            speed = 12 + (seed % 8);
          } else if (rand < 30) {
            trafficLevel = 'medium';
            speed = 25 + (seed % 10);
          } else {
            trafficLevel = 'low';
            speed = 42 + (seed % 15);
          }
        }

        const colors = {
          low: '#10b981',
          medium: '#f97316',
          heavy: '#ef4444',
        };

        features.push({
          type: 'Feature',
          properties: {
            route_id: route.id,
            route_name: route.name,
            traffic_level: trafficLevel,
            traffic_color: colors[trafficLevel],
            speed_kmh: speed,
          },
          geometry: {
            type: 'LineString',
            coordinates: [p1, p2],
          },
        });
      }
    }

    return {
      type: 'FeatureCollection',
      features,
    };
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
