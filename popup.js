"use strict";

const els = {
  chooseButton: document.getElementById("chooseButton"),
  clearButton: document.getElementById("clearButton"),
  dropZone: document.getElementById("dropZone"),
  emptyState: document.getElementById("emptyState"),
  fileInput: document.getElementById("fileInput"),
  fileMeta: document.getElementById("fileMeta"),
  fileName: document.getElementById("fileName"),
  openOptions: document.getElementById("openOptions"),
  previewImage: document.getElementById("previewImage"),
  previewState: document.getElementById("previewState"),
  statusMessage: document.getElementById("statusMessage"),
  subtitle: document.getElementById("subtitle")
};

let currentObjectUrl = "";
let currentFile = null;

init();

function init() {
  bindEvents();
}

function bindEvents() {
  els.chooseButton.addEventListener("click", () => els.fileInput.click());
  els.dropZone.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (file) {
      handleFile(file);
    }
    event.target.value = "";
  });

  els.clearButton.addEventListener("click", clearCurrentImage);
  els.openOptions.addEventListener("click", openOptionsPage);

  ["dragenter", "dragover"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("is-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("is-over");
    });
  });

  els.dropZone.addEventListener("drop", (event) => {
    const file = [...(event.dataTransfer.files || [])].find((item) => item.type.startsWith("image/"));
    if (file) {
      handleFile(file);
    } else {
      setStatus("请放入图片文件。", true);
    }
  });
}

async function handleFile(file) {
  if (!file.type.startsWith("image/")) {
    setStatus("请选择图片文件。", true);
    return;
  }

  currentFile = file;
  showPreview(file);
  setStatus("正在打开等待页...");

  try {
    const id = await ImageSearchStore.saveFile(file);
    openWaitingPage(id);
    if (currentFile === file) {
      els.fileMeta.textContent = `${formatBytes(file.size)} · 已发送到等待页`;
      els.subtitle.textContent = "搜索完成后会展示结果";
      setStatus("已打开等待页。");
    }
  } catch (error) {
    setStatus(error.message || "打开等待页失败", true);
  }
}

function showPreview(file) {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }
  currentObjectUrl = URL.createObjectURL(file);
  els.previewImage.src = currentObjectUrl;
  els.fileName.textContent = file.name || "本地图片";
  els.fileMeta.textContent = `${formatBytes(file.size)} · 准备搜索`;
  els.emptyState.hidden = true;
  els.previewState.hidden = false;
  els.clearButton.hidden = false;
  els.subtitle.textContent = "正在打开等待页";
}

function clearCurrentImage() {
  currentFile = null;
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = "";
  }
  els.previewImage.removeAttribute("src");
  els.emptyState.hidden = false;
  els.previewState.hidden = true;
  els.clearButton.hidden = true;
  els.subtitle.textContent = "拖入图片或点击选择";
  setStatus("");
}

function openOptionsPage() {
  const chromeApi = globalThis.chrome;
  if (chromeApi?.runtime?.openOptionsPage) {
    chromeApi.runtime.openOptionsPage();
    return;
  }
  if (chromeApi?.tabs?.create && chromeApi.runtime?.getURL) {
    chromeApi.tabs.create({ url: chromeApi.runtime.getURL("options.html") });
    return;
  }
  window.open("options.html", "_blank");
}

function openWaitingPage(id) {
  const page = `waiting.html?id=${encodeURIComponent(id)}`;
  const chromeApi = globalThis.chrome;
  if (chromeApi?.tabs?.query && chromeApi.tabs?.update && chromeApi.tabs?.create && chromeApi.runtime?.getURL) {
    const targetUrl = chromeApi.runtime.getURL(page);
    const pagePatterns = [
      `${chromeApi.runtime.getURL("waiting.html")}*`,
      `${chromeApi.runtime.getURL("results.html")}*`
    ];
    chromeApi.tabs.query({ url: pagePatterns }, (tabs) => {
      const [tab] = tabs || [];
      if (tab?.id) {
        chromeApi.tabs.update(tab.id, { active: true, url: targetUrl });
        return;
      }
      chromeApi.tabs.create({ url: targetUrl });
    });
    return;
  }
  if (chromeApi?.tabs?.create && chromeApi.runtime?.getURL) {
    chromeApi.tabs.create({ url: chromeApi.runtime.getURL(page) });
    return;
  }
  window.open(page, "_blank");
}

function setStatus(message, isError = false) {
  els.statusMessage.textContent = message;
  els.statusMessage.classList.toggle("is-error", isError);
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
