import { Controller, Get } from '@nestjs/common';
import { ApiRoutes } from '@weevil/contracts';
import { Public } from '@weevil/auth';

@Public()
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
