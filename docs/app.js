(() => {
  const core = window.KokenCore;
  const state = {
    contentsRows: [],
    items: [],
    missingRows: [],
    top3Ranks: new Map(),
    contentsNames: [],
    rewardName: "",
    rankFilter: "missing",
    typeFilter: "all",
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
    copyVisible: document.querySelector("#copy-visible"),
    downloadContents: document.querySelector("#download-contents"),
    downloadMissing: document.querySelector("#download-missing"),
    downloadRanks: document.querySelector("#download-ranks"),
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

    article.append(thumbLink, content);
    return article;
  }

  function badge(text, className) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  }

  function renderGrid() {
    const visible = core.applyResultOperations(state.items, {
      rankFilter: state.rankFilter,
      typeFilter: state.typeFilter,
      query: elements.search.value,
      sort: elements.sort.value,
    });
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
      });
      document.querySelectorAll("[data-filter]").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.filter === state.rankFilter));
      });
      elements.search.value = "";
      elements.sort.value = "index";
      renderAll();
      setStatus("分析が完了しました。");
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

  elements.sort.addEventListener("change", renderGrid);
  elements.search.addEventListener("input", renderGrid);

  elements.copyVisible.addEventListener("click", async () => {
    try {
      const items = visibleItems();
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
})();
