(function initResultFile(root, factory) {
  const core = typeof module === "object" && module.exports ? require("./koken-core") : root.KokenCore;
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.KokenResultFile = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createResultFile(core) {
  function invalid(detail) { throw new Error(`解析結果JSONが不正です: ${detail}`); }
  function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
  function isContentKey(key) {
    const match = typeof key === "string" && /^([a-z]+):([0-9]+)$/.exec(key);
    return Boolean(match && Object.hasOwn(core.CONTENT_TYPES, match[1]));
  }
  function text(value, name, fallback) {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== "string") invalid(name);
    return value;
  }
  function url(value, name, allowEmpty = false, image = false) {
    const source = text(value, name, allowEmpty ? "" : undefined);
    if (allowEmpty && source === "") return source;
    if (image && /^data:image\/(?:png|jpeg|gif|webp|avif|bmp|svg\+xml)[;,]/i.test(source)) return source;
    if (!/^https?:\/\/[^\s]+$/i.test(source) || /[\u0000-\u0020\u007f]/.test(source)) invalid(name);
    return source;
  }
  function row(value, name) {
    if (!record(value) || !Object.hasOwn(core.CONTENT_TYPES, value.type)) invalid(name);
    const numericId = text(value.numericId, `${name}.numericId`);
    const contentId = text(value.contentId, `${name}.contentId`);
    if (!/^[0-9]+$/.test(numericId) || value.key !== `${value.type}:${numericId}`) invalid(`${name}.key`);
    const idPattern = value.type === "seiga" ? /^im([0-9]+)$/ : /^[a-z]{2}([0-9]+)$/;
    if (contentId.match(idPattern)?.[1] !== numericId) invalid(`${name}.contentId`);
    const result = {
      type: value.type, numericId, contentId, key: value.key,
      title: text(value.title, `${name}.title`),
      url: url(value.url, `${name}.url`),
      totalContribution: text(value.totalContribution, `${name}.totalContribution`, ""),
    };
    for (const field of ["index", "globalIndex", "typeLabel", "sourceName"]) {
      if (value[field] !== undefined) result[field] = text(value[field], `${name}.${field}`);
    }
    if (value.inferredNicoadUrl !== undefined) result.inferredNicoadUrl = url(value.inferredNicoadUrl, `${name}.inferredNicoadUrl`, true);
    return result;
  }
  function parse(source) {
    let file;
    try { file = JSON.parse(source.replace(/^\uFEFF/, "")); } catch { invalid("JSONを読み取れません"); }
    if (!record(file) || file.format !== "koken-result") invalid("format");
    if (file.schemaVersion !== 1) invalid("対応していないschemaVersion");
    if (typeof file.exportedAt !== "string" || !Number.isFinite(Date.parse(file.exportedAt))) invalid("exportedAt");
    const result = file.result;
    if (!record(result) || !Array.isArray(result.items) || !Array.isArray(result.contentsRows) ||
        !Array.isArray(result.top3Ranks) || !Array.isArray(result.contentsNames) ||
        !result.contentsNames.every((name) => typeof name === "string") || typeof result.rewardName !== "string") invalid("result");
    const ranks = new Map();
    for (const pair of result.top3Ranks) {
      if (!Array.isArray(pair) || pair.length !== 2 || !isContentKey(pair[0]) ||
          !Number.isInteger(pair[1]) || pair[1] < 1 || pair[1] > 3 || ranks.has(pair[0])) invalid("top3Ranks");
      ranks.set(pair[0], pair[1]);
    }
    const items = result.items.map((value, i) => {
      const name = `items[${i}]`;
      const item = row(value, name);
      const rank = value.rank === undefined ? (ranks.get(item.key) || 0) : value.rank;
      if (!Number.isInteger(rank) || rank < 0 || rank > 3 || rank !== (ranks.get(item.key) || 0)) invalid(`${name}.rank`);
      if (value.inTop3 !== undefined && value.inTop3 !== (rank > 0)) invalid(`${name}.inTop3`);
      const thumbnail = url(value.thumbnail, `${name}.thumbnail`, true, true);
      return {
        ...item,
        index: item.index ?? item.globalIndex ?? String(i + 1),
        globalIndex: item.globalIndex ?? String(i + 1),
        typeLabel: item.typeLabel ?? core.CONTENT_TYPES[item.type].label,
        rank, inTop3: rank > 0,
        nicoadUrl: url(value.nicoadUrl, `${name}.nicoadUrl`, true) || core.CONTENT_TYPES[item.type].adUrl(item.contentId),
        thumbnail: /^data:/i.test(thumbnail) && thumbnail.length > 20000 ? core.CONTENT_TYPES[item.type].remoteThumb(item.numericId) : thumbnail,
      };
    });
    const contentsRows = result.contentsRows.map((value, i) => row(value, `contentsRows[${i}]`));
    if (contentsRows.length !== items.length || contentsRows.some((value, i) => value.key !== items[i].key)) invalid("contentsRowsとitemsの対応");
    let excludedKeys;
    if (Object.hasOwn(file, "excludedKeys")) {
      if (!Array.isArray(file.excludedKeys) || !file.excludedKeys.every(isContentKey)) invalid("excludedKeys");
      excludedKeys = [...new Set(file.excludedKeys)];
    }
    const inTop3 = items.filter((item) => item.inTop3).length;
    return {
      result: {
        contentsRows, items, top3Ranks: [...ranks], contentsNames: [...result.contentsNames], rewardName: result.rewardName,
        summary: { total: items.length, inTop3, missing: items.length - inTop3 },
        missingRows: core.createMissingRows(items),
      },
      excludedKeys,
    };
  }
  return { parse };
});
