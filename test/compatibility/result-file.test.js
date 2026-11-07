const assert = require("node:assert/strict");
const core = require("../../src/core/koken-core");
const resultFile = require("../../src/core/result-file");

function fixture() {
  const rows = ["123", "456"].map((id, i) => ({
    index: String(i + 1), type: "video", typeLabel: "動画", contentId: `sm${id}`, numericId: id,
    key: `video:${id}`, title: `Video ${id}`, url: `https://www.nicovideo.jp/watch/sm${id}`,
    totalContribution: i ? "" : "1,000", inferredNicoadUrl: "", sourceName: "contents.html",
  }));
  return {
    format: "koken-result", schemaVersion: 1, exportedAt: "2026-11-08T00:00:00.000Z",
    result: {
      contentsRows: rows,
      items: rows.map((row, i) => core.normalizeResultItem(row, i, { rank: i ? 0 : 1 })),
      top3Ranks: [["video:123", 1], ["seiga:999", 3]],
      contentsNames: ["contents.html"], rewardName: "reward.html",
      summary: { total: 999 }, missingRows: [],
    },
    excludedKeys: ["video:888", "video:888", "seiga:123"],
  };
}
const parsed = resultFile.parse(`\uFEFF${JSON.stringify(fixture())}`);
assert.deepEqual(parsed.result.summary, { total: 2, inTop3: 1, missing: 1 });
assert.deepEqual(parsed.result.missingRows, core.createMissingRows(parsed.result.items));
assert.deepEqual(parsed.excludedKeys, ["video:888", "seiga:123"]);
assert.equal(parsed.result.items[1].totalContribution, "");
const legacy = fixture();
for (const field of ["index", "globalIndex", "typeLabel", "nicoadUrl", "thumbnail", "rank", "inTop3"]) delete legacy.result.items[0][field];
const normalized = resultFile.parse(JSON.stringify(legacy));
assert.equal(normalized.result.items[0].globalIndex, "1");
assert.equal(normalized.result.items[0].typeLabel, "動画");
assert.equal(normalized.result.items[0].rank, 1);
assert.equal(normalized.result.items[0].nicoadUrl, core.CONTENT_TYPES.video.adUrl("sm123"));
const duplicate = fixture();
duplicate.result.items.push(duplicate.result.items[0]);
duplicate.result.contentsRows.push(duplicate.result.contentsRows[0]);
assert.equal(resultFile.parse(JSON.stringify(duplicate)).result.items.length, 3);
const noExclusions = fixture();
delete noExclusions.excludedKeys;
assert.equal(resultFile.parse(JSON.stringify(noExclusions)).excludedKeys, undefined);
noExclusions.excludedKeys = [];
assert.deepEqual(resultFile.parse(JSON.stringify(noExclusions)).excludedKeys, []);
const largeThumbnail = fixture();
largeThumbnail.result.items[0].thumbnail = `data:image/png;base64,${"A".repeat(20001)}`;
assert.equal(resultFile.parse(JSON.stringify(largeThumbnail)).result.items[0].thumbnail, core.CONTENT_TYPES.video.remoteThumb("123"));

for (const mutate of [
  (file) => { file.format = "other"; },
  (file) => { file.schemaVersion = 2; },
  (file) => { file.exportedAt = "not a date"; },
  (file) => { file.result = null; },
  (file) => { file.result.items = {}; },
  (file) => { file.result.contentsNames = [null]; },
  (file) => { file.result.items[0].type = "other"; },
  (file) => { file.result.items[0].numericId = 123; },
  (file) => { file.result.items[0].key = "video:999"; },
  (file) => { file.result.items[0].contentId = "sm999"; },
  (file) => { file.result.items[0].title = {}; },
  (file) => { file.result.items[0].url = "javascript:alert(1)"; },
  (file) => { file.result.items[0].url = "https://x\n.example.com"; },
  (file) => { file.result.items[0].nicoadUrl = "data:text/html,x"; },
  (file) => { file.result.items[0].thumbnail = "javascript:alert(1)"; },
  (file) => { file.result.items[0].rank = "1"; },
  (file) => { file.result.items[0].inTop3 = false; },
  (file) => { file.result.items[0].rank = 4; },
  (file) => { file.result.top3Ranks = [["video:123", 2]]; },
  (file) => { file.result.top3Ranks.push(["video:123", 1]); },
  (file) => { file.result.top3Ranks = [["bad", 1]]; },
  (file) => { file.result.contentsRows.reverse(); },
  (file) => { file.excludedKeys = null; },
  (file) => { file.excludedKeys = ["other:1"]; },
]) {
  const file = fixture();
  mutate(file);
  assert.throws(() => resultFile.parse(JSON.stringify(file)), /解析結果JSONが不正/);
}
for (const source of ["{", "null", "[]", "true"]) assert.throws(() => resultFile.parse(source), /解析結果JSONが不正/);
console.log("Result file validation tests OK");
