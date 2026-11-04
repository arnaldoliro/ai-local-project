import { Module } from '@nestjs/common';
import { AttachmentsModule } from './attachments/attachments.module.js';
import { ChatModule } from './chat/chat.module.js';
import { ConfigModule } from './config/config.module.js';
import { ConversationsModule } from './conversations/conversations.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    HealthModule,
    ConversationsModule,
    AttachmentsModule,
    ChatModule,
  ],
})
export class AppModule {}
