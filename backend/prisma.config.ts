import { defineConfig, env } from 'prisma/config';

// DATABASE_URL is injected by Docker Compose, so no dotenv is needed.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
