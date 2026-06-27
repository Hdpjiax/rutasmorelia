import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsNumber, Max, Min } from 'class-validator';

export class NearbyStopsDto {
  @ApiProperty({ example: 19.7027 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: -101.1925 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @ApiProperty({ required: false, default: 1000, minimum: 100, maximum: 5000 })
  @Type(() => Number)
  @IsNumber()
  @Min(100)
  @Max(5000)
  radius = 1000;
}
