import { Controller, Get } from '@nestjs/common';
import { ApiRoutes } from '@weevil/contracts';

@Controller(ApiRoutes.Health)
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      checkedAt: new Date().toISOString(),
    };
  }
}
