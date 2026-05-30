"use strict";

const els = {
  fileMeta: document.getElementById("fileMeta"),
  fileName: document.getElementById("fileName"),
  openOptions: document.getElementById("openOptions"),
  previewImage: document.getElementById("previewImage"),
  providerStrip: document.getElementById("providerStrip"),
  resultCount: document.getElementById("resultCount"),
  resultsList: document.getElementById("resultsList"),
  searchSummary: document.getElementById("searchSummary"),
  statusMessage: document.getElementById("statusMessage")
};

let previewObjectUrl = "";

init();

async function init() {
  bindEvents();
  renderResults([]);

  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    setStatus("没有已完成的搜索任务，请从扩展弹窗重新上传。", true);
    return;
  }

  try {
    const [file, searchResult] = await Promise.all([
      ImageSearchStore.readFile(id),
      ImageSearchStore.readSearchResult(id)
    ]);
    const options = searchResult.options || await ImageSearchCore.readOptions();
    showImage(file);
    renderProviderChips(searchResult.providers || []);
    renderResults(searchResult.results || []);
    renderStatus(searchResult);
  } catch (error) {
    setStatus(error.message || "读取结果失败", true);
  }
}

function bindEvents() {
  els.openOptions.addEventListener("click", () => {
    const chromeApi = globalThis.chrome;
    if (chromeApi?.runtime?.openOptionsPage) {
      chromeApi.runtime.openOptionsPage();
      return;
    }
    window.open("options.html", "_blank");
  });
}

function showImage(file) {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
  }
  previewObjectUrl = URL.createObjectURL(file);
  els.previewImage.src = previewObjectUrl;
  els.previewImage.hidden = false;
  els.searchSummary.hidden = false;
  els.fileName.textContent = file.name || "本地图片";
  els.fileMeta.textContent = `${formatBytes(file.size)} · ${file.type || "image"}`;
}

function renderStatus(searchResult) {
  const results = searchResult.results || [];
  const errors = searchResult.errors || [];
  if (errors.length && results.length) {
    setStatus(`搜索完成，找到 ${results.length} 条结果；部分平台失败。`, true);
  } else if (errors.length) {
    setStatus(`搜索完成，但没有拿到结果：${errors.map((item) => `${item.name}: ${item.error}`).join("；")}`, true);
  } else if (results.length) {
    setStatus(`搜索完成，已按相似度排序，找到 ${results.length} 条结果。`);
  } else {
    setStatus("搜索完成，没有达到相似度阈值的结果。");
  }
}

function renderProviderChips(providers) {
  els.providerStrip.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const provider of providers) {
    const chip = document.createElement("span");
    chip.className = `provider-chip ${provider.error ? "is-error" : "is-done"}`;
    chip.textContent = provider.name;
    fragment.append(chip);
  }
  els.providerStrip.append(fragment);
}

function renderResults(results) {
  els.resultCount.textContent = String(results.length);
  els.resultsList.replaceChildren();

  if (!results.length) {
    const empty = document.createElement("div");
    empty.className = "empty-results";
    empty.textContent = "暂无结果";
    els.resultsList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const result of results) {
    fragment.append(createResultCard(result));
  }
  els.resultsList.append(fragment);
}

function createResultCard(result) {
  const card = document.createElement("article");
  card.className = "result-card";

  if (result.thumbnail) {
    const image = document.createElement("img");
    image.src = result.thumbnail;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.onerror = () => image.replaceWith(createThumbFallback(result.provider));
    card.append(image);
  } else {
    card.append(createThumbFallback(result.provider));
  }

  const body = document.createElement("div");
  body.className = "result-body";

  const title = document.createElement(result.url ? "a" : "span");
  title.className = "result-title";
  title.textContent = result.title;
  if (result.url) {
    title.href = result.url;
    title.target = "_blank";
    title.rel = "noreferrer";
  }

  const meta = document.createElement("div");
  meta.className = "result-meta";
  meta.textContent = [result.provider, result.meta].filter(Boolean).join(" · ");

  const source = document.createElement("div");
  source.className = "result-source";
  source.textContent = `出处：${result.source}`;

  const score = document.createElement("div");
  score.className = "score-row";
  const bar = document.createElement("div");
  bar.className = "score-bar";
  bar.style.setProperty("--score", `${Math.round(result.similarity)}%`);
  const fill = document.createElement("span");
  bar.append(fill);
  const text = document.createElement("span");
  text.className = "score-text";
  text.textContent = result.scoreLabel || `${result.similarity.toFixed(1)}%`;
  score.append(bar, text);

  body.append(title, meta, source, score);
  card.append(body);
  return card;
}

function createThumbFallback(label) {
  const fallback = document.createElement("div");
  fallback.className = "thumb-fallback";
  fallback.textContent = label.slice(0, 1).toUpperCase();
  return fallback;
}

function setStatus(message, isError = false) {
  els.statusMessage.textContent = message;
  els.statusMessage.classList.toggle("is-error-text", isError);
}

function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
