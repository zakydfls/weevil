import { Module } from '@nestjs/common';
import { AppConfigModule } from '@weevil/config';
import { MailerService } from './application/mailer.service';
import { NotificationGatewayClient } from './application/notification-gateway.client';

@Module({
  imports: [AppConfigModule],
  providers: [NotificationGatewayClient, MailerService],
  exports: [NotificationGatewayClient, MailerService],
})
export class NotificationsModule {}
