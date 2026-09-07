import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const target = "functions/vendor/shared";
await rm(`${target}/dist`, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp("shared/dist", `${target}/dist`, { recursive: true });
const pkg = JSON.parse(await readFile("shared/package.json", "utf8"));
const deployPkg = { name: pkg.name, version: pkg.version, main: pkg.main, types: pkg.types, dependencies: pkg.dependencies };
await writeFile(`${target}/package.json`, `${JSON.stringify(deployPkg, null, 2)}\n`);
