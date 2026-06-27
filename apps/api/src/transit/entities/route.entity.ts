import type { LineString } from 'geojson';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'routes' })
@Index('routes_city_active_idx', ['cityId', 'isActive'])
export class RouteEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'city_id', type: 'bigint' })
  cityId!: string;

  @Column({ type: 'text', unique: true })
  code!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  color!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'LineString',
    srid: 4326,
    nullable: true,
  })
  geometry!: LineString | null;
}
