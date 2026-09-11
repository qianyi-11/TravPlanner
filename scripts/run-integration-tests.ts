import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const databasePath = join(root, "prisma", "integration.db");
const environment: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: "file:./integration.db",
  NODE_ENV: "test",
  AUTH_DEMO_ENABLED: "false",
  AUTH_SECRET: "travplanner-integration-test-secret",
};
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

function cleanup() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(`${databasePath}${suffix}`, { force: true });
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: environment,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? "unknown"}`);
}

try {
  cleanup();
  writeFileSync(databasePath, "");
  run(npxCommand, ["prisma", "generate", "--schema=prisma/schema.sqlite.prisma"]);
  run(npxCommand, ["prisma", "db", "push", "--schema=prisma/schema.sqlite.prisma", "--skip-generate"]);
  run(npxCommand, ["tsx", "--test", "tests/integration/trip-planning.test.ts"]);
} finally {
  cleanup();
}
