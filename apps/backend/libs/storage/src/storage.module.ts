import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '@weevil/config';
import { StorageService } from './storage.service';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
