const { mkdirSync, writeFileSync } = require("fs");
const { dirname } = require("path");

// Truncate before every run so a report never mixes two invocations.
module.exports = () => {
  const file = require("path").join(__dirname, "..", "..", "docs", ".gate-results.jsonl");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "");
};
