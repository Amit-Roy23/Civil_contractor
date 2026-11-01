import { Module } from '@nestjs/common';
import { V2Store } from './store.js';
import { V2Auth, V2Guard } from './auth.js';
import { DemoService } from './demo.service.js';
import { BackupService } from './backup.service.js';
import { AdminV2Controller, AuthV2Controller, DataV2Controller } from './controllers.js';

/** v2: one API for every module, with the business rules from @civil/domain enforced on the server */
@Module({
  providers: [V2Store, V2Auth, V2Guard, DemoService, BackupService],
  controllers: [AuthV2Controller, DataV2Controller, AdminV2Controller],
  exports: [V2Store, DemoService, BackupService],
})
export class V2Module {}
