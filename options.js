"use strict";

const DEFAULT_OPTIONS = {
  iqdbEnabled: true,
  ascii2dEnabled: true,
  saucenaoEnabled: true,
  traceMoeEnabled: true,
  saucenaoApiKey: "",
  traceMoeApiKey: "",
  minSimilarity: 35,
  resultLimit: 12
};

const form = document.getElementById("optionsForm");
const saveStatus = document.getElementById("saveStatus");
const fields = {
  iqdbEnabled: document.getElementById("iqdbEnabled"),
  ascii2dEnabled: document.getElementById("ascii2dEnabled"),
  saucenaoEnabled: document.getElementById("saucenaoEnabled"),
  traceMoeEnabled: document.getElementById("traceMoeEnabled"),
  saucenaoApiKey: document.getElementById("saucenaoApiKey"),
  traceMoeApiKey: document.getElementById("traceMoeApiKey"),
  minSimilarity: document.getElementById("minSimilarity"),
  resultLimit: document.getElementById("resultLimit")
};

document.addEventListener("DOMContentLoaded", restoreOptions);
form.addEventListener("submit", saveOptions);
document.getElementById("resetButton").addEventListener("click", resetOptions);

function restoreOptions() {
  storageGet(DEFAULT_OPTIONS, (items) => {
    fields.iqdbEnabled.checked = Boolean(items.iqdbEnabled);
    fields.ascii2dEnabled.checked = Boolean(items.ascii2dEnabled);
    fields.saucenaoEnabled.checked = Boolean(items.saucenaoEnabled);
    fields.traceMoeEnabled.checked = Boolean(items.traceMoeEnabled);
    fields.saucenaoApiKey.value = items.saucenaoApiKey || "";
    fields.traceMoeApiKey.value = items.traceMoeApiKey || "";
    fields.minSimilarity.value = String(items.minSimilarity);
    fields.resultLimit.value = String(items.resultLimit);
  });
}

function saveOptions(event) {
  event.preventDefault();
  const options = collectOptions();
  storageSet(options, () => {
    saveStatus.textContent = "已保存";
    window.setTimeout(() => {
      saveStatus.textContent = "";
    }, 1800);
  });
}

function resetOptions() {
  storageSet(DEFAULT_OPTIONS, () => {
    restoreOptions();
    saveStatus.textContent = "已恢复默认";
    window.setTimeout(() => {
      saveStatus.textContent = "";
    }, 1800);
  });
}

function collectOptions() {
  return {
    iqdbEnabled: fields.iqdbEnabled.checked,
    ascii2dEnabled: fields.ascii2dEnabled.checked,
    saucenaoEnabled: fields.saucenaoEnabled.checked,
    traceMoeEnabled: fields.traceMoeEnabled.checked,
    saucenaoApiKey: fields.saucenaoApiKey.value.trim(),
    traceMoeApiKey: fields.traceMoeApiKey.value.trim(),
    minSimilarity: clampNumber(Number(fields.minSimilarity.value), 0, 100),
    resultLimit: clampNumber(Number(fields.resultLimit.value), 1, 30)
  };
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function storageGet(defaults, callback) {
  const chromeApi = globalThis.chrome;
  if (chromeApi?.storage?.sync) {
    chromeApi.storage.sync.get(defaults, callback);
    return;
  }
  callback({ ...defaults, ...readLocalOptions() });
}

function storageSet(options, callback) {
  const chromeApi = globalThis.chrome;
  if (chromeApi?.storage?.sync) {
    chromeApi.storage.sync.set(options, callback);
    return;
  }
  localStorage.setItem("imageSearchOptions", JSON.stringify(options));
  callback();
}

function readLocalOptions() {
  try {
    return JSON.parse(localStorage.getItem("imageSearchOptions") || "{}");
  } catch {
    return {};
  }
}
