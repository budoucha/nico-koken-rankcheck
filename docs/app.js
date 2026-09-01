(() => {
  const core = window.KokenCore;
  const bookmarklet = window.KokenBookmarklet;
  const HISTORY_KEY = "koken-lite-result-history-v1";
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
    history: [],
  };

  const elements = {
    contentsFiles: document.querySelector("#contents-files"),
    rewardFile: document.querySelector("#reward-file"),
    analyze: document.querySelector("#analyze"),
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
    copyVisible: document.querySelector("#copy-visible"),
    copySelected: document.querySelector("#copy-selected"),
    downloadContents: document.querySelector("#download-contents"),
    downloadMissing: document.querySelector("#download-missing"),
    downloadRanks: document.querySelector("#download-ranks"),
    historyList: document.querySelector("#history-list"),
    clearHistory: document.querySelector("#clear-history"),
    bookmarkletMode: document.querySelector("#bookmarklet-mode"),
    bookmarkletAction: document.querySelector("#bookmarklet-action"),
  };

  let copyStatusTimer = 0;

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

  function historyEntryFromState() {
    const savedAt = new Date().toISOString();
    const total = state.items.length;
    const inTop3 = state.items.filter((item) => item.inTop3).length;
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt,
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

  function saveCurrentResultToHistory() {
    try {
      const entry = historyEntryFromState();
      state.history = [entry, ...state.history.filter((item) => item.id !== entry.id)].slice(0, HISTORY_LIMIT);
      writeHistory(state.history);
      renderHistory();
      return true;
    } catch {
      state.history = readHistory();
      renderHistory();
      return false;
    }
  }

  function loadHistoryEntry(entry) {
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
    resetControls();
    renderAll();
    setStatus("履歴を開きました。");
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
    const total = state.items.length;
    const inTop3 = state.items.filter((item) => item.inTop3).length;
    const notInTop3 = state.missingRows.length;
    elements.summary.replaceChildren(
      summaryItem("全件", total),
      summaryItem("3位以内", inTop3),
      summaryItem("4位以下", notInTop3),
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
    const visible = core.applyResultOperations(state.items, {
      rankFilter: state.rankFilter,
      typeFilter: state.typeFilter,
      query: elements.search.value,
      sort: elements.sort.value,
    });
    if (state.selectionMode) pruneSelectionToVisibleItems(visible);
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
    return core.applyResultOperations(state.items, {
      rankFilter: state.rankFilter,
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
    elements.bookmarkletAction.textContent = title;
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

  elements.analyze.addEventListener("click", async () => {
    const contentsFileList = [...elements.contentsFiles.files];
    const reward = elements.rewardFile.files[0];
    if (!contentsFileList.length || !reward) {
      setStatus("contents HTMLとreward HTMLを選択してください。", true);
      return;
    }
    elements.analyze.disabled = true;
    setStatus("分析しています...");
    try {
      const contents = await Promise.all(contentsFileList.map(readTextFile));
      const rewardFile = await readTextFile(reward);
      const result = analyzeInputs(contents, rewardFile);
      Object.assign(state, result, {
        rankFilter: "missing",
        typeFilter: "all",
        selectionMode: false,
        selectedKeys: new Set(),
      });
      resetControls();
      renderAll();
      setStatus(saveCurrentResultToHistory() ? "分析が完了しました。履歴に保存しました。" : "分析が完了しました。履歴には保存できませんでした。");
    } catch (error) {
      setStatus(error && error.message ? error.message : String(error), true);
    } finally {
      elements.analyze.disabled = false;
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

  elements.grid.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".selection-checkbox");
    if (!checkbox || !state.selectionMode) return;
    const card = checkbox.closest(".card");
    if (!card) return;
    const key = card.dataset.selectionKey;
    if (checkbox.checked) state.selectedKeys.add(key);
    else state.selectedKeys.delete(key);
    card.classList.toggle("is-selected", checkbox.checked);
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
    state.history = state.history.filter((item) => item.id !== removeButton.dataset.historyRemove);
    try {
      writeHistory(state.history);
    } catch {
      setStatus("履歴を更新できませんでした。", true);
    }
    renderHistory();
  });

  elements.clearHistory.addEventListener("click", () => {
    if (!state.history.length) return;
    if (!window.confirm("履歴をすべて削除しますか？")) return;
    state.history = [];
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      setStatus("履歴を削除できませんでした。", true);
    }
    renderHistory();
  });

  elements.copyVisible.addEventListener("click", async () => {
    try {
      const items = visibleItems();
      await writeClipboard(core.spreadsheetText(items));
      setCopyStatus(`${items.length}件をコピーしました`);
    } catch {
      setCopyStatus("コピーできませんでした");
    }
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

  state.history = readHistory();
  renderHistory();
  updateBookmarkletAction();
})();
