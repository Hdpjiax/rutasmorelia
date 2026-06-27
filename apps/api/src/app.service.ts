import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'rutas-morelia-api',
      timestamp: new Date().toISOString(),
    };
  }
}
