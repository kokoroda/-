"use strict";

const els = {
  previewImage: document.getElementById("previewImage"),
  providerStrip: document.getElementById("providerStrip"),
  statusMessage: document.getElementById("statusMessage")
};

let previewObjectUrl = "";
const providerChips = new Map();

init();

async function init() {
  const params = new URLSearchParams(location.search);
  const errorMessage = params.get("error");
  if (errorMessage) {
    setStatus(errorMessage, true);
    return;
  }

  const id = params.get("id");
  if (!id) {
    setStatus("没有图片任务，请从扩展弹窗重新上传。", true);
    return;
  }

  try {
    const [file, options] = await Promise.all([
      ImageSearchStore.readFile(id),
      ImageSearchCore.readOptions()
    ]);
    showImage(file);
    await runSearchAndRedirect(id, file, options);
  } catch (error) {
    setStatus(error.message || "搜索失败", true);
  }
}

function showImage(file) {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
  }
  previewObjectUrl = URL.createObjectURL(file);
  els.previewImage.src = previewObjectUrl;
  els.previewImage.hidden = false;
}

async function runSearchAndRedirect(id, file, options) {
  const providers = ImageSearchCore.getProviders(file, options);
  renderProviderChips(providers);

  if (!providers.length) {
    const searchResult = {
      results: [],
      errors: [{ name: "设置", error: "没有启用搜索平台" }],
      providers: [],
      options
    };
    await ImageSearchStore.saveSearchResult(id, searchResult);
    goToResults(id);
    return;
  }

  setStatus("搜索中，请稍候...");
  const summary = await ImageSearchCore.runSearch(file, options, {
    onProviderStart: (provider) => {
      setProviderStatus(provider.id, "running");
      setStatus(`正在搜索 ${provider.name}...`);
    },
    onProviderDone: (provider) => {
      if (provider.hidden) {
        removeProviderChip(provider.id);
        return;
      }
      setProviderStatus(provider.id, provider.error ? "error" : "done");
    }
  });

  await ImageSearchStore.saveSearchResult(id, {
    ...summary,
    options
  });

  setStatus("搜索完成，正在打开结果页...");
  window.setTimeout(() => goToResults(id), 450);
}

function renderProviderChips(providers) {
  providerChips.clear();
  els.providerStrip.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const provider of providers) {
    const chip = document.createElement("span");
    chip.className = "provider-chip";
    chip.textContent = provider.name;
    providerChips.set(provider.id, chip);
    fragment.append(chip);
  }
  els.providerStrip.append(fragment);
}

function setProviderStatus(id, status) {
  const chip = providerChips.get(id);
  if (!chip) {
    return;
  }
  chip.classList.remove("is-running", "is-done", "is-error");
  chip.classList.add(`is-${status}`);
}

function removeProviderChip(id) {
  const chip = providerChips.get(id);
  if (!chip) {
    return;
  }
  chip.remove();
  providerChips.delete(id);
}

function goToResults(id) {
  location.replace(`results.html?id=${encodeURIComponent(id)}`);
}

function setStatus(message, isError = false) {
  els.statusMessage.textContent = message;
  els.statusMessage.classList.toggle("is-error-text", isError);
}
