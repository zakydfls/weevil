import { Module } from '@nestjs/common';
import { DatabaseModule } from '@weevil/database';
import { InAppNotificationService } from './application/in-app-notification.service';

@Module({
  imports: [DatabaseModule],
  providers: [InAppNotificationService],
  exports: [InAppNotificationService],
})
export class InAppNotificationsModule {}
