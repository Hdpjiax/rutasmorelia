import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NearbyStopsDto } from './dto/nearby-stops.dto';
import { TransitService } from './transit.service';

@ApiTags('transit')
@Controller()
export class TransitController {
  constructor(private readonly transit: TransitService) {}

  @Get('routes')
  @ApiOperation({ summary: 'Lista las rutas activas' })
  listRoutes() {
    return this.transit.listRoutes();
  }

  @Get('stops/nearby')
  @ApiOperation({ summary: 'Busca paradas cercanas a una coordenada' })
  nearbyStops(@Query() query: NearbyStopsDto) {
    return this.transit.nearbyStops(query);
  }
}
