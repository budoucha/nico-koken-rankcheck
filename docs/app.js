(() => {
  const core = window.KokenCore;
  const bookmarklet = window.KokenBookmarklet;
  const resultFile = window.KokenResultFile;
  const HISTORY_KEY = "koken-lite-result-history-v1";
  const EXCLUSIONS_KEY = "koken-lite-excluded-keys-v1";
  const HISTORY_LIMIT = 10;
  const MAX_DATA_THUMBNAIL_LENGTH = 20000;
  const state = {
    contentsRows: [],
    items: [],
    missingRows: [],
    top3Ranks: new Map(),
    contentsNames: [],
    rewardName: "",
    rankFilter: "missing",
    typeFilter: "all",
    selectionMode: false,
    selectedKeys: new Set(),
    excludedKeys: new Set(),
    exclusionError: "",
    history: [],
  };

  const elements = {
    contentsFiles: document.querySelector("#contents-files"),
    rewardFile: document.querySelector("#reward-file"),
    analyze: document.querySelector("#analyze"),
    resultFile: document.querySelector("#result-file"),
    importResult: document.querySelector("#import-result"),
    importDialog: document.querySelector("#import-dialog"),
    importMessage: document.querySelector("#import-message"),
    importMerge: document.querySelector("#import-merge"),
    importResultOnly: document.querySelector("#import-result-only"),
    importCancel: document.querySelector("#import-cancel"),
    status: document.querySelector("#status"),
    sourceSummary: document.querySelector("#source-summary"),
    results: document.querySelector("#results"),
    summary: document.querySelector("#summary"),
    grid: document.querySelector("#grid"),
    visibleCount: document.querySelector("#visible-count"),
    copyStatus: document.querySelector("#copy-status"),
    typeFilter: document.querySelector("#type-filter"),
    sort: document.querySelector("#sort"),
    search: document.querySelector("#search"),
    selectionToggle: document.querySelector("#selection-toggle"),
    selectionSelectAll: document.querySelector("#selection-select-all"),
    selectionClear: document.querySelector("#selection-clear"),
    selectionDelete: document.querySelector("#selection-delete"),
    selectionRestore: document.querySelector("#selection-restore"),
    resultStatus: document.querySelector("#result-status"),
    copyVisible: document.querySelector("#copy-visible"),
    copyIncludeHeader: document.querySelector("#copy-include-header"),
    copySelected: document.querySelector("#copy-selected"),
    downloadContents: document.querySelector("#download-contents"),
    downloadMissing: document.querySelector("#download-missing"),
    downloadRanks: document.querySelector("#download-ranks"),
    downloadResult: document.querySelector("#download-result"),
    exportExclusions: document.querySelector("#export-exclusions"),
    historyList: document.querySelector("#history-list"),
    clearHistory: document.querySelector("#clear-history"),
    exclusionList: document.querySelector("#exclusion-list"),
    exclusionCount: document.querySelector("#exclusion-count"),
    exclusionStatus: document.querySelector("#exclusion-status"),
    reloadExclusions: document.querySelector("#reload-exclusions"),
    bookmarkletMode: document.querySelector("#bookmarklet-mode"),
    bookmarkletAction: document.querySelector("#bookmarklet-action"),
  };

  let copyStatusTimer = 0;
  let pendingImport = null;

  function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle("error", isError);
  }

  function setCopyStatus(message) {
    clearTimeout(copyStatusTimer);
    elements.copyStatus.textContent = message ? ` / ${message}` : "";
    if (message) {
      copyStatusTimer = setTimeout(() => setCopyStatus(""), 3000);
    }
  }

  function setResultStatus(message, isError = false) {
    elements.resultStatus.textContent = message;
    elements.resultStatus.classList.toggle("error", isError);
  }

  function readHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isValidHistoryEntry).slice(0, HISTORY_LIMIT) : [];
    } catch {
      return [];
    }
  }

  function writeHistory(entries) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
  }

  function isValidHistoryEntry(entry) {
    return entry &&
      typeof entry.id === "string" &&
      Array.isArray(entry.contentsRows) &&
      Array.isArray(entry.items) &&
      Array.isArray(entry.top3Ranks);
  }

  function compactRow(row) {
    const compact = {};
    for (const key of core.CONTENTS_CSV_HEADER) {
      compact[key] = row[key] ?? "";
    }
    compact.sourceName = row.sourceName || "";
    return compact;
  }

  function compactThumbnail(item) {
    const thumbnail = String(item.thumbnail || "");
    if (/^data:/i.test(thumbnail) && thumbnail.length > MAX_DATA_THUMBNAIL_LENGTH) {
      return core.CONTENT_TYPES[item.type].remoteThumb(item.numericId);
    }
    return thumbnail;
  }

  function compactItem(item) {
    return {
      index: item.index,
      globalIndex: item.globalIndex,
      type: item.type,
      typeLabel: item.typeLabel,
      title: item.title,
      url: item.url,
      contentId: item.contentId,
      numericId: item.numericId,
      totalContribution: item.totalContribution,
      key: item.key,
      inferredNicoadUrl: item.inferredNicoadUrl,
      nicoadUrl: item.nicoadUrl,
      thumbnail: compactThumbnail(item),
      rank: item.rank,
      inTop3: item.inTop3,
    };
  }

  function resultSnapshotFromState() {
    const total = state.items.length;
    const inTop3 = state.items.filter((item) => item.inTop3).length;
    return {
      contentsNames: [...state.contentsNames],
      rewardName: state.rewardName,
      summary: {
        total,
        inTop3,
        missing: total - inTop3,
      },
      contentsRows: state.contentsRows.map(compactRow),
      items: state.items.map(compactItem),
      top3Ranks: [...state.top3Ranks.entries()],
    };
  }

  function historyEntryFromState() {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      ...resultSnapshotFromState(),
    };
  }

  function resultExportFromState(includeExclusions) {
    const result = resultSnapshotFromState();
    const exported = {
      format: "koken-result",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      result: { ...result, missingRows: core.createMissingRows(result.items) },
    };
    if (includeExclusions) exported.excludedKeys = [...readExcludedKeys()].sort();
    return exported;
  }

  function saveCurrentResultToHistory() {
    try {
      const entry = historyEntryFromState();
      const history = [entry, ...state.history.filter((item) => item.id !== entry.id)].slice(0, HISTORY_LIMIT);
      writeHistory(history);
      state.history = history;
      renderHistory();
      return true;
    } catch {
      state.history = readHistory();
      renderHistory();
      return false;
    }
  }

  function isContentKey(key) {
    if (typeof key !== "string") return false;
    const match = /^([a-z]+):[0-9]+$/.exec(key);
    return Boolean(match && Object.hasOwn(core.CONTENT_TYPES, match[1]));
  }

  function writeExcludedKeys(keys) {
    localStorage.setItem(EXCLUSIONS_KEY, JSON.stringify([...keys].sort()));
  }

  function readExcludedKeys(initialize = true) {
    const raw = localStorage.getItem(EXCLUSIONS_KEY);
    if (raw === null) {
      const latest = readHistory()[0];
      const keys = new Set((Array.isArray(latest?.deletedKeys) ? latest.deletedKeys : []).filter(isContentKey));
      if (initialize) writeExcludedKeys(keys);
      return keys;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isContentKey)) throw new Error("Invalid exclusion list");
    return new Set(parsed);
  }

  function refreshExclusions() {
    try {
      state.excludedKeys = readExcludedKeys();
      state.exclusionError = "";
    } catch {
      state.exclusionError = "共通除外リストを読み込めません。保存領域または保存データを確認してください。";
    }
    renderExclusions();
  }

  function setExclusionStatus(message, isError = false) {
    elements.exclusionStatus.textContent = message;
    elements.exclusionStatus.classList.toggle("error", isError);
  }

  function renderExclusions() {
    elements.exclusionCount.textContent = state.exclusionError ? "未確認" : `${state.excludedKeys.size}件`;
    elements.exclusionList.replaceChildren();
    for (const key of [...state.excludedKeys].sort()) {
      const row = document.createElement("div");
      row.className = "exclusion-item";
      const label = document.createElement("span");
      label.textContent = key;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button";
      remove.dataset.exclusionRemove = key;
      remove.textContent = "除外を解除";
      remove.setAttribute("aria-label", `${key}の除外を解除`);
      row.append(label, remove);
      elements.exclusionList.appendChild(row);
    }
    if (!state.excludedKeys.size && !state.exclusionError) {
      const empty = document.createElement("p");
      empty.textContent = "除外しているコンテンツはありません。";
      elements.exclusionList.appendChild(empty);
    }
    setExclusionStatus(state.exclusionError, Boolean(state.exclusionError));
  }

  function loadHistoryEntry(entry) {
    refreshExclusions();
    Object.assign(state, {
      contentsRows: entry.contentsRows.map((row) => ({ ...row })),
      items: entry.items.map((item) => ({ ...item })),
      missingRows: core.createMissingRows(entry.items),
      top3Ranks: new Map(entry.top3Ranks),
      contentsNames: [...(entry.contentsNames || [])],
      rewardName: entry.rewardName || "",
      rankFilter: "missing",
      typeFilter: "all",
      selectionMode: false,
      selectedKeys: new Set(),
    });
    setResultStatus(state.exclusionError, Boolean(state.exclusionError));
    resetControls();
    renderAll();
    setStatus("履歴を開きました。");
  }

  function setSelectedItemsDeleted(deleted) {
    if (!state.selectionMode) return;
    if (deleted && state.rankFilter === "deleted") return;
    if (!deleted && state.rankFilter !== "deleted") return;
    const selected = new Set(selectedVisibleItems().map((item) => item.key));
    if (!selected.size) return;

    changeExclusions(selected, deleted);
  }

  function changeExclusions(keys, excluded) {
    let excludedKeys;
    try {
      excludedKeys = readExcludedKeys();
      for (const key of keys) {
        if (excluded) excludedKeys.add(key);
        else excludedKeys.delete(key);
      }
      writeExcludedKeys(excludedKeys);
    } catch {
      const message = "共通除外リストを読み込み・保存できなかったため、一覧の変更は反映していません。";
      setResultStatus(message, true);
      setExclusionStatus(message, true);
      return;
    }
    state.excludedKeys = excludedKeys;
    state.exclusionError = "";
    state.selectedKeys.clear();
    renderExclusions();
    renderHistory();
    if (state.items.length) {
      renderSummary();
      renderGrid();
    }
    const message = `${keys.size}件を${excluded ? "一覧から除外しました" : "除外から解除しました"}。すべての履歴と次回の分析にも適用されます。`;
    setResultStatus(message);
    setExclusionStatus(message);
  }

  function formatHistoryDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function historyTitle(entry) {
    const contents = Array.isArray(entry.contentsNames) && entry.contentsNames.length
      ? entry.contentsNames.join(" / ")
      : "contents";
    return `${formatHistoryDate(entry.savedAt)} ${contents}`;
  }

  function renderHistory() {
    elements.historyList.replaceChildren();
    elements.clearHistory.disabled = state.history.length === 0;
    if (!state.history.length) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "履歴なし";
      elements.historyList.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const entry of state.history) {
      fragment.appendChild(historyItem(entry));
    }
    elements.historyList.appendChild(fragment);
  }

  function historyItem(entry) {
    const article = document.createElement("article");
    article.className = "history-item";

    const main = document.createElement("div");
    main.className = "history-main";
    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = historyTitle(entry);
    const meta = document.createElement("div");
    meta.className = "history-meta";
    const summary = entry.summary || {};
    meta.textContent = `全件 ${summary.total || 0} / 4位以下 ${summary.missing || 0}`;
    main.append(title, meta);

    const buttons = document.createElement("div");
    buttons.className = "history-buttons";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "button primary";
    open.dataset.historyOpen = entry.id;
    open.textContent = "開く";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button";
    remove.dataset.historyRemove = entry.id;
    remove.textContent = "削除";
    buttons.append(open, remove);

    article.append(main, buttons);
    return article;
  }

  function resetControls() {
    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.filter === state.rankFilter));
    });
    elements.search.value = "";
    elements.sort.value = "index";
  }

  async function readTextFile(file) {
    return {
      name: file.name,
      text: await file.text(),
      lastModified: file.lastModified || 0,
    };
  }

  function validateHtmlFile(fileInfo, label) {
    const head = fileInfo.text.slice(0, 512).toLowerCase();
    if (!head.includes("<!doctype html") && !head.includes("<html")) {
      throw new Error(`${label} がHTMLファイルに見えません: ${fileInfo.name}`);
    }
  }

  function thumbnailFor(row) {
    if (row.thumbnailSrc && (/^https?:\/\//i.test(row.thumbnailSrc) || /^data:/i.test(row.thumbnailSrc))) {
      return row.thumbnailSrc;
    }
    return core.CONTENT_TYPES[row.type].remoteThumb(row.numericId);
  }

  function analyzeInputs(contentsFiles, rewardFile) {
    const contentsRows = [];
    const contentsNames = [];
    for (const file of contentsFiles) {
      validateHtmlFile(file, "contents HTML");
      const type = core.detectContentsType(file.text);
      if (!type) {
        throw new Error(`contents HTMLの種別を判定できません: ${file.name}`);
      }
      const rows = core.extractContents(file.text, type);
      if (!rows.length) {
        throw new Error(`contents HTMLからコンテンツを抽出できません: ${file.name}`);
      }
      contentsNames.push(`${file.name} (${core.CONTENT_TYPES[type].label}: ${rows.length}件)`);
      for (const row of rows) {
        contentsRows.push({ ...row, sourceName: file.name });
      }
    }

    validateHtmlFile(rewardFile, "reward HTML");
    const top3Ranks = core.extractTop3Ranks(rewardFile.text);
    if (!top3Ranks.size) {
      throw new Error(`reward HTMLから順位を抽出できません: ${rewardFile.name}`);
    }

    const items = contentsRows.map((row, index) => core.normalizeResultItem(row, index, {
      rank: top3Ranks.get(row.key) || 0,
      thumbnail: thumbnailFor(row),
    }));

    return {
      contentsRows,
      items,
      missingRows: core.createMissingRows(items),
      top3Ranks,
      contentsNames,
      rewardName: rewardFile.name,
    };
  }

  function renderTypeFilters(items) {
    const types = [...new Set(items.map((item) => item.type))].sort();
    elements.typeFilter.replaceChildren();
    const all = document.createElement("button");
    all.type = "button";
    all.dataset.typeFilter = "all";
    all.setAttribute("aria-pressed", String(state.typeFilter === "all"));
    all.textContent = "全種別";
    elements.typeFilter.appendChild(all);
    for (const type of types) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.typeFilter = type;
      button.setAttribute("aria-pressed", String(state.typeFilter === type));
      button.textContent = core.CONTENT_TYPES[type].label;
      elements.typeFilter.appendChild(button);
    }
  }

  function renderSummary() {
    const activeItems = state.items.filter((item) => !state.excludedKeys.has(item.key));
    const total = activeItems.length;
    const inTop3 = activeItems.filter((item) => item.inTop3).length;
    const notInTop3 = total - inTop3;
    elements.summary.replaceChildren(
      summaryItem("通常一覧", total),
      summaryItem("3位以内", inTop3),
      summaryItem("4位以下", notInTop3),
      summaryItem("除外済み", state.items.length - total),
      summaryItem("順位抽出", state.top3Ranks.size),
    );
    elements.sourceSummary.textContent = `contents: ${state.contentsNames.join(" / ")} / reward: ${state.rewardName}`;
  }

  function summaryItem(label, value) {
    const span = document.createElement("span");
    span.textContent = `${label} `;
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    span.appendChild(strong);
    return span;
  }

  function cardFor(item) {
    const article = document.createElement("article");
    article.className = "card";
    article.setAttribute("data-selection-key", item.key);
    article.classList.toggle("is-selected", state.selectionMode && state.selectedKeys.has(item.key));

    const selectionControl = document.createElement("label");
    selectionControl.className = "selection-control";
    const checkbox = document.createElement("input");
    checkbox.className = "selection-checkbox";
    checkbox.type = "checkbox";
    checkbox.checked = state.selectionMode && state.selectedKeys.has(item.key);
    checkbox.setAttribute("aria-label", `${item.title}を選択`);
    selectionControl.appendChild(checkbox);

    const thumbLink = document.createElement("a");
    thumbLink.className = "thumb-link";
    thumbLink.href = item.url;
    thumbLink.target = "_blank";
    thumbLink.rel = "noopener noreferrer";
    thumbLink.setAttribute("aria-label", `${item.title}を開く`);
    const img = document.createElement("img");
    img.className = "thumb";
    img.src = item.thumbnail;
    img.alt = "";
    img.loading = "lazy";
    thumbLink.appendChild(img);

    const content = document.createElement("div");
    content.className = "content";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.appendChild(badge(`#${item.index}`, "index"));
    meta.appendChild(badge(item.typeLabel, "badge"));
    meta.appendChild(badge(item.rank ? `${item.rank}位` : "4位以下", `badge rank rank-${item.rank || "outside"}`));

    const title = document.createElement("h3");
    title.className = "title";
    const titleLink = document.createElement("a");
    titleLink.href = item.url;
    titleLink.target = "_blank";
    titleLink.rel = "noopener noreferrer";
    titleLink.textContent = item.title;
    title.appendChild(titleLink);

    const id = document.createElement("p");
    id.className = "id";
    id.textContent = item.contentId;

    content.append(meta, title, id);
    if (item.totalContribution) {
      const contribution = document.createElement("p");
      contribution.className = "contribution";
      const label = document.createElement("span");
      label.textContent = "獲得";
      const value = document.createElement("strong");
      value.textContent = item.totalContribution;
      const unit = document.createElement("span");
      unit.textContent = "貢";
      contribution.append(label, value, unit);
      content.appendChild(contribution);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const ad = document.createElement("a");
    ad.className = "button primary";
    ad.href = item.nicoadUrl;
    ad.target = "_blank";
    ad.rel = "noopener noreferrer";
    ad.textContent = "広告する";
    actions.appendChild(ad);
    content.appendChild(actions);

    article.append(selectionControl, thumbLink, content);
    return article;
  }

  function badge(text, className) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  }

  function pruneSelectionToVisibleItems(items) {
    const visibleKeys = new Set(items.map((item) => item.key));
    state.selectedKeys = new Set([...state.selectedKeys].filter((key) => visibleKeys.has(key)));
  }

  function renderSelectionUi() {
    elements.results.classList.toggle("selection-mode", state.selectionMode);
    elements.selectionToggle.textContent = state.selectionMode ? "選択をやめる" : "選択する";
    elements.selectionToggle.setAttribute("aria-pressed", String(state.selectionMode));
    elements.selectionSelectAll.hidden = !state.selectionMode;
    elements.selectionClear.hidden = !state.selectionMode;
    elements.copySelected.hidden = !state.selectionMode;
    elements.selectionDelete.hidden = !state.selectionMode || state.rankFilter === "deleted";
    elements.selectionRestore.hidden = !state.selectionMode || state.rankFilter !== "deleted";
    elements.selectionDelete.disabled = state.selectedKeys.size === 0;
    elements.selectionRestore.disabled = state.selectedKeys.size === 0;
  }

  function setSelectionMode(enabled) {
    state.selectionMode = enabled;
    if (enabled) {
      state.selectedKeys = new Set(visibleItems().map((item) => item.key));
    } else {
      state.selectedKeys.clear();
    }
    renderSelectionUi();
    renderGrid();
  }

  function renderGrid() {
    const visible = visibleItems();
    if (state.selectionMode) pruneSelectionToVisibleItems(visible);
    renderSelectionUi();
    elements.visibleCount.textContent = String(visible.length);
    elements.grid.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "表示できる結果がありません。";
      elements.grid.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    visible.forEach((item) => fragment.appendChild(cardFor(item)));
    elements.grid.appendChild(fragment);
  }

  function renderAll() {
    renderTypeFilters(state.items);
    renderSummary();
    renderSelectionUi();
    renderGrid();
    elements.results.classList.remove("hidden");
  }

  function visibleItems() {
    const showDeleted = state.rankFilter === "deleted";
    const items = state.items.filter((item) => state.excludedKeys.has(item.key) === showDeleted);
    return core.applyResultOperations(items, {
      rankFilter: showDeleted ? "all" : state.rankFilter,
      typeFilter: state.typeFilter,
      query: elements.search.value,
      sort: elements.sort.value,
    });
  }

  function selectedVisibleItems() {
    return visibleItems().filter((item) => state.selectedKeys.has(item.key));
  }

  async function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall through to textarea copy.
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("copy failed");
  }

  function selectedBookmarklet() {
    return bookmarklet.BOOKMARKLETS[elements.bookmarkletMode.value] ||
      bookmarklet.BOOKMARKLETS.scroll ||
      bookmarklet.BOOKMARKLETS.current;
  }

  function updateBookmarkletAction() {
    const selected = selectedBookmarklet();
    const title = selected.bookmarkTitle || selected.label;
    elements.bookmarkletAction.href = selected.url;
    elements.bookmarkletAction.title = title;
    elements.bookmarkletAction.textContent = "クリップボードにコピー";
  }

  function downloadText(fileName, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setImportBusy(busy) {
    elements.importResult.disabled = busy;
    elements.analyze.disabled = busy;
  }

  function completeImport(mode) {
    const imported = pendingImport;
    pendingImport = null;
    if (elements.importDialog.open) elements.importDialog.close();
    try {
      if (!imported || mode === "cancel") {
        setStatus("インポートをキャンセルしました。");
        return;
      }
      const oldHistoryRaw = localStorage.getItem(HISTORY_KEY);
      let storedHistory;
      try { storedHistory = oldHistoryRaw === null ? [] : JSON.parse(oldHistoryRaw); }
      catch { throw new Error("既存の履歴を読み取れません。保存データを確認してください。"); }
      if (!Array.isArray(storedHistory)) throw new Error("既存の履歴を読み取れません。");
      const { missingRows, ...snapshot } = imported.result;
      const entry = { ...snapshot, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, savedAt: new Date().toISOString() };
      const history = [entry, ...storedHistory.filter(isValidHistoryEntry)].slice(0, HISTORY_LIMIT);
      let exclusionsMissing = false;
      try { exclusionsMissing = localStorage.getItem(EXCLUSIONS_KEY) === null; }
      catch (error) { if (mode === "merge") throw error; }
      const keys = mode === "merge" || exclusionsMissing ? readExcludedKeys(false) : null;
      const oldCount = keys?.size || 0;
      if (mode === "merge") for (const key of imported.excludedKeys) keys.add(key);
      const newHistoryRaw = JSON.stringify(history);
      let historyWritten = false;
      try {
        localStorage.setItem(HISTORY_KEY, newHistoryRaw);
        historyWritten = true;
        if (keys && (exclusionsMissing || keys.size !== oldCount)) writeExcludedKeys(keys);
      } catch (error) {
        if (historyWritten) {
          try {
            if (localStorage.getItem(HISTORY_KEY) !== newHistoryRaw) throw new Error("History changed");
            if (oldHistoryRaw === null) localStorage.removeItem(HISTORY_KEY);
            else localStorage.setItem(HISTORY_KEY, oldHistoryRaw);
          } catch {
            state.history = readHistory();
            renderHistory();
            throw new Error("インポートの保存と履歴の復旧に失敗しました。履歴を確認してください。共通除外リストは変更していません。");
          }
        }
        throw new Error("インポートを保存できませんでした。解析結果と共通除外リストは変更していません。");
      }
      state.history = history;
      loadHistoryEntry(entry);
      renderHistory();
      setStatus(`解析結果をインポートして履歴に保存しました。${keys && keys.size > oldCount ? `共通除外リストに${keys.size - oldCount}件追加しました。` : ""}`);
    } catch (error) {
      setStatus(error.message || "インポートに失敗しました。", true);
    } finally {
      setImportBusy(false);
    }
  }

  elements.importResult.addEventListener("click", async () => {
    if (elements.importResult.disabled) return;
    const file = elements.resultFile.files[0];
    if (!file) {
      setStatus("解析結果JSONを選択してください。", true);
      return;
    }
    setImportBusy(true);
    try {
      const imported = resultFile.parse(await file.text());
      let keys;
      elements.importMerge.disabled = false;
      try { keys = imported.excludedKeys?.length ? readExcludedKeys(false) : new Set(); }
      catch {
        pendingImport = imported;
        elements.importMerge.disabled = true;
        elements.importMessage.textContent = "共通除外リストを確認できません。解析結果だけをインポートするか、キャンセルしてください。";
        elements.importDialog.showModal();
        return;
      }
      const additions = (imported.excludedKeys || []).filter((key) => !keys.has(key));
      pendingImport = imported;
      if (additions.length) {
        elements.importMessage.textContent = `共通除外リストに${additions.length}件追加しますか？ 現在の${keys.size}件は残ります。`;
        elements.importDialog.showModal();
      } else {
        completeImport("result-only");
      }
    } catch (error) {
      pendingImport = null;
      setStatus(error.message || "解析結果JSONを読み込めませんでした。", true);
    } finally {
      if (!pendingImport) setImportBusy(false);
    }
  });
  elements.importMerge.addEventListener("click", () => completeImport("merge"));
  elements.importResultOnly.addEventListener("click", () => completeImport("result-only"));
  elements.importCancel.addEventListener("click", () => completeImport("cancel"));
  elements.importDialog.addEventListener("cancel", () => completeImport("cancel"));

  elements.analyze.addEventListener("click", async () => {
    if (elements.analyze.disabled) return;
    const contentsFileList = [...elements.contentsFiles.files];
    const reward = elements.rewardFile.files[0];
    if (!contentsFileList.length || !reward) {
      setStatus("contents HTMLとreward HTMLを選択してください。", true);
      return;
    }
    elements.analyze.disabled = true;
    elements.importResult.disabled = true;
    setStatus("分析しています...");
    try {
      const contents = await Promise.all(contentsFileList.map(readTextFile));
      const rewardFile = await readTextFile(reward);
      const result = analyzeInputs(contents, rewardFile);
      refreshExclusions();
      Object.assign(state, result, {
        rankFilter: "missing",
        typeFilter: "all",
        selectionMode: false,
        selectedKeys: new Set(),
      });
      setResultStatus(state.exclusionError, Boolean(state.exclusionError));
      resetControls();
      renderAll();
      setStatus(saveCurrentResultToHistory() ? "分析が完了しました。履歴に保存しました。" : "分析が完了しました。履歴には保存できませんでした。");
    } catch (error) {
      setStatus(error && error.message ? error.message : String(error), true);
    } finally {
      elements.analyze.disabled = false;
      elements.importResult.disabled = false;
    }
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.rankFilter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      renderGrid();
    });
  });

  elements.typeFilter.addEventListener("click", (event) => {
    const button = event.target.closest("[data-type-filter]");
    if (!button) return;
    state.typeFilter = button.dataset.typeFilter;
    elements.typeFilter.querySelectorAll("[data-type-filter]").forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });
    renderGrid();
  });

  elements.selectionToggle.addEventListener("click", () => setSelectionMode(!state.selectionMode));

  elements.selectionSelectAll.addEventListener("click", () => {
    if (!state.selectionMode) return;
    for (const item of visibleItems()) state.selectedKeys.add(item.key);
    renderGrid();
  });

  elements.selectionClear.addEventListener("click", () => {
    if (!state.selectionMode) return;
    for (const item of visibleItems()) state.selectedKeys.delete(item.key);
    renderGrid();
  });

  elements.selectionDelete.addEventListener("click", () => setSelectedItemsDeleted(true));
  elements.selectionRestore.addEventListener("click", () => setSelectedItemsDeleted(false));

  elements.grid.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".selection-checkbox");
    if (!checkbox || !state.selectionMode) return;
    const card = checkbox.closest(".card");
    if (!card) return;
    const key = card.dataset.selectionKey;
    if (checkbox.checked) state.selectedKeys.add(key);
    else state.selectedKeys.delete(key);
    card.classList.toggle("is-selected", checkbox.checked);
    renderSelectionUi();
  });

  elements.sort.addEventListener("change", renderGrid);
  elements.search.addEventListener("input", renderGrid);

  elements.bookmarkletAction.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      const selected = selectedBookmarklet();
      await writeClipboard(selected.url);
      setStatus(`${selected.label}ブックマークレットをコピーしました。ブックマークバーへドラッグして登録することもできます。`);
    } catch {
      setStatus("ブックマークレットをコピーできませんでした。", true);
    }
  });

  elements.bookmarkletMode.addEventListener("change", updateBookmarkletAction);

  elements.historyList.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-history-open]");
    if (openButton) {
      const entry = state.history.find((item) => item.id === openButton.dataset.historyOpen);
      if (entry) loadHistoryEntry(entry);
      return;
    }
    const removeButton = event.target.closest("[data-history-remove]");
    if (!removeButton) return;
    try {
      const history = state.history.filter((item) => item.id !== removeButton.dataset.historyRemove);
      writeHistory(history);
      state.history = history;
    } catch {
      setStatus("履歴を更新できませんでした。", true);
    }
    renderHistory();
  });

  elements.clearHistory.addEventListener("click", () => {
    if (!state.history.length) return;
    if (!window.confirm("履歴をすべて削除しますか？")) return;
    try {
      localStorage.removeItem(HISTORY_KEY);
      state.history = [];
    } catch {
      setStatus("履歴を削除できませんでした。", true);
    }
    renderHistory();
  });

  elements.copyVisible.addEventListener("click", async () => {
    try {
      const items = visibleItems();
      await writeClipboard(core.spreadsheetText(items, { includeHeader: elements.copyIncludeHeader.checked }));
      setCopyStatus(`${items.length}件をコピーしました`);
    } catch {
      setCopyStatus("コピーできませんでした");
    }
  });

  function reloadExclusions() {
    refreshExclusions();
    renderHistory();
    if (state.items.length) {
      renderSummary();
      renderGrid();
    } else {
      setStatus(state.exclusionError || "共通除外リストを読み込みました。", Boolean(state.exclusionError));
    }
    setResultStatus(state.exclusionError, Boolean(state.exclusionError));
  }

  elements.reloadExclusions.addEventListener("click", reloadExclusions);
  elements.exclusionList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-exclusion-remove]");
    if (button) changeExclusions(new Set([button.dataset.exclusionRemove]), false);
  });
  window.addEventListener("storage", (event) => {
    if ((event.storageArea === localStorage || event.storageArea == null) &&
        (event.key === EXCLUSIONS_KEY || event.key === null)) reloadExclusions();
  });

  elements.copySelected.addEventListener("click", async () => {
    try {
      const items = selectedVisibleItems();
      await writeClipboard(core.spreadsheetText(items));
      setCopyStatus(`${items.length}件をコピーしました`);
    } catch {
      setCopyStatus("コピーできませんでした");
    }
  });

  elements.downloadContents.addEventListener("click", () => {
    downloadText("result-contents.csv", core.csvText(core.CONTENTS_CSV_HEADER, state.contentsRows), "text/csv;charset=utf-8");
  });

  elements.downloadMissing.addEventListener("click", () => {
    downloadText("result-not-in-top3.csv", core.csvText(core.MISSING_CSV_HEADER, state.missingRows), "text/csv;charset=utf-8");
  });

  elements.downloadRanks.addEventListener("click", () => {
    downloadText("result-top3-ranks.txt", core.top3RanksText(state.top3Ranks), "text/plain;charset=utf-8");
  });

  elements.downloadResult.addEventListener("click", () => {
    try {
      const exported = resultExportFromState(elements.exportExclusions.checked);
      downloadText(`result-${exported.exportedAt.replace(/[:.]/g, "-")}.koken-result.json`,
        `${JSON.stringify(exported, null, 2)}\n`, "application/json;charset=utf-8");
      setResultStatus("解析結果JSONのダウンロードを開始しました。");
    } catch {
      setResultStatus("解析結果JSONを出力できませんでした。共通除外リストを含める場合は、その保存データも確認してください。", true);
    }
  });

  state.history = readHistory();
  refreshExclusions();
  renderHistory();
  updateBookmarkletAction();
  if (state.history.length) {
    loadHistoryEntry(state.history[0]);
  } else if (state.exclusionError) {
    setStatus(state.exclusionError, true);
  }
})();
