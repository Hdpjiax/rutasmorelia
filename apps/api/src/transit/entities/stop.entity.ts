import type { Point } from 'geojson';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'stops' })
@Index('stops_city_active_idx', ['cityId', 'isActive'])
export class StopEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'city_id', type: 'bigint' })
  cityId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  reference!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  location!: Point;
}
