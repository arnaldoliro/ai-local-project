import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { EnvironmentVariables } from '../config/env.validation.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Prisma 7 talks to Postgres through a driver adapter (node-postgres here)
 * instead of a bundled Rust engine. The pool is kept small: this is a
 * single-user app and Postgres runs with a tight memory limit.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(env: EnvironmentVariables) {
    super({
      adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 5 }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
