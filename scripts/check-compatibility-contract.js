const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const matrixPath = path.join(root, "docs", "compatibility", "FEATURE_MATRIX.md");
const exceptionsPath = path.join(root, "docs", "compatibility", "CAPABILITY_EXCEPTIONS.md");
const operationsPath = path.join(root, "docs", "compatibility", "OPERATIONS.md");
const checksPath = path.join(root, "test", "compatibility", "feature-checks.json");
const prTemplatePath = path.join(root, ".github", "pull_request_template.md");
const agentPath = path.join(root, "AGENTS.md");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function fail(message) {
  console.error(`compatibility contract error: ${message}`);
  process.exitCode = 1;
}

function extractFeatureIds(markdown) {
  return [...markdown.matchAll(/\|\s*(F\d{3})\s*\|/g)].map((match) => match[1]);
}

function unique(values) {
  return [...new Set(values)];
}

for (const filePath of [matrixPath, exceptionsPath, operationsPath, checksPath, prTemplatePath, agentPath]) {
  if (!fs.existsSync(filePath)) {
    fail(`missing required file: ${path.relative(root, filePath)}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);

const matrix = read(matrixPath);
const exceptions = read(exceptionsPath);
const operations = read(operationsPath);
const prTemplate = read(prTemplatePath);
const agentInstructions = read(agentPath);
let checks;

try {
  checks = JSON.parse(read(checksPath));
} catch (error) {
  fail(`invalid JSON in ${path.relative(root, checksPath)}: ${error.message}`);
  checks = {};
}

const featureIds = unique(extractFeatureIds(matrix));
const exceptionIds = unique(extractFeatureIds(exceptions));
const checkIds = Object.keys(checks).sort();

if (!featureIds.length) {
  fail("FEATURE_MATRIX.md has no Fxxx feature IDs");
}

for (const id of featureIds) {
  if (!checks[id]) {
    fail(`${id} is in FEATURE_MATRIX.md but missing from feature-checks.json`);
  }
}

for (const id of checkIds) {
  if (!featureIds.includes(id)) {
    fail(`${id} is in feature-checks.json but missing from FEATURE_MATRIX.md`);
  }
}

for (const id of exceptionIds) {
  if (!featureIds.includes(id)) {
    fail(`${id} is in CAPABILITY_EXCEPTIONS.md but missing from FEATURE_MATRIX.md`);
  }
}

for (const id of featureIds) {
  const entry = checks[id];
  if (!entry || !Array.isArray(entry.checks) || entry.checks.length === 0) {
    fail(`${id} must list at least one check in feature-checks.json`);
  }
  if (!entry.level || typeof entry.level !== "string") {
    fail(`${id} must include a string level in feature-checks.json`);
  }
}

for (const requiredText of [
  "docs/compatibility/FEATURE_MATRIX.md",
  "test/compatibility/feature-checks.json",
  "npm run check:compat",
]) {
  if (!operations.includes(requiredText)) {
    fail(`OPERATIONS.md must mention ${requiredText}`);
  }
  if (!prTemplate.includes(requiredText)) {
    fail(`pull_request_template.md must mention ${requiredText}`);
  }
  if (!agentInstructions.includes(requiredText)) {
    fail(`AGENTS.md must mention ${requiredText}`);
  }
}

if (!process.exitCode) {
  console.log(`Compatibility contract OK: ${featureIds.length} features, ${exceptionIds.length} exceptions.`);
}
