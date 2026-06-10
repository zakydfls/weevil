import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '@weevil/config';
import { QueueService } from './queue.service';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
