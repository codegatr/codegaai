import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve("tests", "reasoning");
const files = fs.readdirSync(root)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort();

let passed = 0;
const failures = [];
for (const file of files) {
  try {
    await import(pathToFileURL(path.join(root, file)).href);
    passed += 1;
    console.log(`✓ ${file}`);
  } catch (error) {
    failures.push({ file, error });
    console.error(`✗ ${file}: ${error && error.message ? error.message : error}`);
  }
}

const score = files.length ? Math.round((passed / files.length) * 100) : 0;
console.log(`Reasoning regression score: ${score}% (${passed}/${files.length})`);
if (failures.length || score < 95) {
  throw new Error(`Reasoning regression failed: ${score}%`);
}
