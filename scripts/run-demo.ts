import { spawnSync } from "node:child_process";
import { copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const demoDbPath = join(root, "prisma", "demo.db");
const schemaDbPath = join(root, "prisma", "prisma", "dev.db");
const demoEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: "file:./demo.db",
  AUTH_DEMO_ENABLED: "true",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "travplanner-demo-only-secret-do-not-use-in-production",
  DEMO_TRIP_ID: process.env.DEMO_TRIP_ID ?? "trip-japan",
  NEXT_DIST_DIR: ".next-demo",
};
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command: string, args: string[]) {
  console.log(`\n> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: demoEnvironment,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("TravPlanner CodeNection Demo");
console.log("Using isolated database: prisma/demo.db");
console.log("Your normal development database is not modified.");

for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(`${demoDbPath}${suffix}`, { force: true });
copyFileSync(schemaDbPath, demoDbPath);

console.log("\n[1/3] Creating demo database...");
run(npxCommand, ["prisma", "generate", "--schema=prisma/schema.sqlite.prisma"]);
run(npxCommand, ["prisma", "db", "push", "--schema=prisma/schema.sqlite.prisma", "--skip-generate", "--accept-data-loss"]);
console.log("\n[2/3] Loading deterministic demo fixture...");
run(npxCommand, ["prisma", "db", "seed"]);
console.log("\n[3/3] Starting automated browser demo...");
run(npxCommand, ["playwright", "test", "demo/travplanner-demo.spec.ts", "--project=chromium", "--headed"]);
console.log("\nDemo completed.");
