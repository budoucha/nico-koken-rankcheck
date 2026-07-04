const assert = require("assert");
const core = require("../../src/core/koken-core");

const rankPath = {
  1: "M14.616 19.176V9H11",
  2: "M15.824 19.176v-1.68h-2.992",
  3: "M13.792 19.176c1.355",
};

function contentsItem({ type, contentId, numericId, title, contribution, thumbnail }) {
  const url = type === "seiga"
    ? `https://seiga.nicovideo.jp/seiga/${contentId}`
    : `https://www.nicovideo.jp/watch/${contentId}`;
  return `
    <li data-v-0f929b6d="" class="item">
      <p class="title"><a href="${url}">${title}</a></p>
      <img class="thumbnail-image" src="${thumbnail}">
      <div class="total-contribution"><strong class="value">${contribution}</strong></div>
      <span data-type="nicoad"></span>
    </li>`;
}

function contentsHtml({ filterLabel, item }) {
  return `
    <button class="trigger" aria-selected="true">${filterLabel}</button>
    <ul>${item}</ul>`;
}

function rewardItem({ type, numericId, rank }) {
  const thumb = type === "seiga"
    ? `https://lohas.nicoseiga.jp/thumb/${numericId}u`
    : `https://nicovideo.cdn.nimg.jp/thumbnails/${numericId}/${numericId}.12345.M`;
  return `
    <li class="item">
      <span data-type="${type}"></span>
      <img src="${thumb}">
      <svg><path d="background"></path><path d="${rankPath[rank]}"></path></svg>
    </li>`;
}

const seigaContents = contentsHtml({
  filterLabel: "静画のみ表示",
  item: contentsItem({
    type: "seiga",
    contentId: "im11529455",
    numericId: "11529455",
    title: "テスト&amp;静画",
    contribution: "1,234",
    thumbnail: "https://lohas.nicoseiga.jp/thumb/11529455u",
  }),
});

const videoContents = contentsHtml({
  filterLabel: "動画のみ表示",
  item: contentsItem({
    type: "video",
    contentId: "sm46001796",
    numericId: "46001796",
    title: "テスト動画",
    contribution: "987",
    thumbnail: "https://nicovideo.cdn.nimg.jp/thumbnails/46001796/46001796.12345.M",
  }),
});

const rewardHtml = `
  <ul>
    ${rewardItem({ type: "seiga", numericId: "11529455", rank: 1 })}
    ${rewardItem({ type: "video", numericId: "46001796", rank: 2 })}
  </ul>`;

assert.strictEqual(core.detectContentsType(seigaContents), "seiga");
assert.strictEqual(core.detectContentsType(videoContents), "video");

const seigaRows = core.extractContents(seigaContents);
const videoRows = core.extractContents(videoContents);
assert.strictEqual(seigaRows.length, 1);
assert.strictEqual(videoRows.length, 1);
const manySeigaRows = core.extractContents(contentsHtml({
  filterLabel: "静画のみ表示",
  item: Array.from({ length: 501 }, (_, index) => {
    const numericId = String(11530000 + index);
    return contentsItem({
      type: "seiga",
      contentId: `im${numericId}`,
      numericId,
      title: `テスト静画${index + 1}`,
      contribution: String(index + 1),
      thumbnail: `https://lohas.nicoseiga.jp/thumb/${numericId}u`,
    });
  }).join("\n"),
}));
assert.strictEqual(manySeigaRows.length, 501);
assert.strictEqual(manySeigaRows[500].index, "501");
assert.deepStrictEqual(seigaRows[0], {
  index: "1",
  type: "seiga",
  typeLabel: "静画",
  title: "テスト&静画",
  url: "https://seiga.nicovideo.jp/seiga/im11529455",
  contentId: "im11529455",
  numericId: "11529455",
  totalContribution: "1,234",
  thumbnailSrc: "https://lohas.nicoseiga.jp/thumb/11529455u",
  key: "seiga:11529455",
  inferredNicoadUrl: "https://nicoad.nicovideo.jp/seiga/publish/im11529455",
});

const ranks = core.extractTop3Ranks(rewardHtml);
assert.strictEqual(ranks.get("seiga:11529455"), 1);
assert.strictEqual(ranks.get("video:46001796"), 2);

const rows = [...seigaRows, ...videoRows];
const items = rows.map((row, index) => core.normalizeResultItem(row, index, {
  rank: ranks.get(row.key) || 0,
  thumbnail: row.thumbnailSrc,
}));
assert.strictEqual(items[0].globalIndex, "1");
assert.strictEqual(items[0].rank, 1);
assert.strictEqual(items[0].inTop3, true);
assert.strictEqual(items[1].nicoadUrl, "https://nicoad.nicovideo.jp/video/publish/sm46001796");

const visibleRank1 = core.applyResultOperations(items, { rankFilter: "rank1" });
assert.deepStrictEqual(visibleRank1.map((item) => item.key), ["seiga:11529455"]);

const contributionDesc = core.applyResultOperations(items, { rankFilter: "all", sort: "contribution-desc" });
assert.deepStrictEqual(contributionDesc.map((item) => item.key), ["seiga:11529455", "video:46001796"]);

assert.deepStrictEqual(core.createMissingRows(items), []);

const csv = core.csvText(core.CONTENTS_CSV_HEADER, seigaRows);
assert.ok(csv.startsWith("\uFEFF"));
assert.ok(csv.includes('"テスト&静画"'));

const tsv = core.spreadsheetText(items);
assert.ok(tsv.startsWith("id\tタイトル\tコンテンツのURL\t獲得貢\t広告画面のURL"));
assert.ok(tsv.includes("im11529455\tテスト&静画"));

const ranksText = core.top3RanksText(ranks);
assert.ok(ranksText.includes("seiga:11529455,1"));
assert.ok(ranksText.includes("video:46001796,2"));

console.log("Core compatibility tests OK");
