import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const demoDbPath = join(root, "prisma", "demo.db");
const recording = process.argv.includes("--record") || process.env.DEMO_RECORD === "1";
const recordingOutput = join(root, "demo-output", "travplanner-demo.webm");
const demoEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: "file:./demo.db",
  AUTH_DEMO_ENABLED: "true",
  AUTH_DEMO_MEMBER_ID: process.env.AUTH_DEMO_MEMBER_ID ?? "you",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "travplanner-demo-only-secret-do-not-use-in-production",
  DEMO_TRIP_ID: process.env.DEMO_TRIP_ID ?? "trip-japan",
  DEMO_RECORD: recording ? "1" : "0",
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "",
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

function findVideos(directory: string): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? findVideos(path) : entry.name.endsWith(".webm") ? [path] : [];
    });
  } catch {
    return [];
  }
}

console.log("Trippy CodeNection Demo");
console.log("Using isolated database: prisma/demo.db");
console.log("Your normal development database is not modified.");
if (recording) rmSync(recordingOutput, { force: true });

for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(`${demoDbPath}${suffix}`, { force: true });
writeFileSync(demoDbPath, "");

console.log("\n[1/3] Creating demo database...");
run(npxCommand, ["prisma", "generate", "--schema=prisma/schema.sqlite.prisma"]);
run(npxCommand, ["prisma", "db", "push", "--schema=prisma/schema.sqlite.prisma", "--skip-generate", "--accept-data-loss"]);
console.log("\n[2/3] Loading deterministic demo fixture...");
run(npxCommand, ["prisma", "db", "seed"]);
console.log("\n[3/3] Starting automated browser demo...");
run(npxCommand, ["playwright", "test", "demo/travplanner-demo.spec.ts", "--project=chromium", "--headed"]);
if (recording) {
  const videos = findVideos(join(root, "test-results", "demo"));
  if (videos.length !== 1) throw new Error(`Expected one demo recording, found ${videos.length}`);
  mkdirSync(join(root, "demo-output"), { recursive: true });
  copyFileSync(videos[0], recordingOutput);
  console.log(`\n[DEMO] Recording written to ${recordingOutput}`);
}
console.log("\nDemo completed.");
