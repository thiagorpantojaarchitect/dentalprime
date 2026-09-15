import { z } from "zod";

import { DevelopmentBootstrapService } from "./application/development-bootstrap.js";
import { argon2Hasher } from "./application/password.js";
import { createDbConnection } from "./infrastructure/db/client.js";
import { DrizzleIdentityUnitOfWork } from "./infrastructure/repositories.js";

const bootstrapConfig = z.object({
  nodeEnv: z.literal("development"),
  allowed: z.literal("true"),
  databaseUrl: z.string().min(1),
  tenantName: z.string().min(1),
  adminEmail: z.string().email(),
  adminName: z.string().min(1),
  adminPassword: z.string().min(12),
});

async function main(): Promise<void> {
  const config = bootstrapConfig.parse({
    nodeEnv: process.env.NODE_ENV,
    allowed: process.env.ALLOW_DEVELOPMENT_BOOTSTRAP,
    databaseUrl: process.env.DATABASE_URL,
    tenantName: process.env.BOOTSTRAP_TENANT_NAME,
    adminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL,
    adminName: process.env.BOOTSTRAP_ADMIN_NAME,
    adminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  });
  const connection = createDbConnection(config.databaseUrl);
  try {
    const service = new DevelopmentBootstrapService({
      unitOfWork: new DrizzleIdentityUnitOfWork(connection.db),
      passwords: argon2Hasher,
    });
    const result = await service.run(config);
    // tenantId nao e segredo e e necessario no primeiro login multi-tenant.
    console.log(
      `Development bootstrap: ${result.status}. Tenant ID: ${result.tenantId}.`,
    );
  } finally {
    await connection.pool.end();
  }
}

void main().catch(() => {
  console.error("Development bootstrap failed. Check configuration and database state.");
  process.exit(1);
});
