"use strict";

importScripts("image-store.js");

const MENU_ID = "search-image-with-image-search-helper";
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

chrome.runtime.onInstalled.addListener(registerContextMenu);
chrome.runtime.onStartup.addListener(registerContextMenu);
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID || !info.srcUrl) {
    return;
  }
  void searchImageFromContextMenu(info.srcUrl);
});

registerContextMenu();

function registerContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "使用以图搜图助手搜索此图片",
      contexts: ["image"]
    }, () => void chrome.runtime.lastError);
  });
}

async function searchImageFromContextMenu(srcUrl) {
  try {
    const file = await downloadImage(srcUrl);
    const id = await ImageSearchStore.saveFile(file);
    await openWaitingPage(id);
  } catch (error) {
    await openWaitingPage("", error.message || "无法读取网页图片，请先保存图片后再上传。");
  }
}

async function downloadImage(srcUrl) {
  const response = await fetch(srcUrl, {
    cache: "no-store",
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(`无法下载网页图片：HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const type = normalizeImageType(blob.type || response.headers.get("content-type") || "");
  if (!type.startsWith("image/")) {
    throw new Error("右键目标没有返回有效图片，请先保存图片后再上传。");
  }
  if (blob.size > MAX_IMAGE_SIZE) {
    throw new Error("网页图片超过 15MB，请压缩后再上传。");
  }

  return new File([blob], createFileName(srcUrl, type), {
    type,
    lastModified: Date.now()
  });
}

function normalizeImageType(value) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

function createFileName(srcUrl, type) {
  const fallbackExtension = extensionForType(type);
  try {
    const url = new URL(srcUrl);
    const candidate = decodeURIComponent(url.pathname.split("/").pop() || "");
    if (candidate && /\.[a-z0-9]{2,5}$/i.test(candidate)) {
      return sanitizeFileName(candidate);
    }
  } catch {
    // Data and blob URLs use the generic fallback below.
  }
  return `web-image-${Date.now()}.${fallbackExtension}`;
}

function extensionForType(type) {
  return {
    "image/avif": "avif",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp"
  }[type] || "img";
}

function sanitizeFileName(value) {
  return value.replace(/[\\/:*?"<>|]/g, "_").slice(-120) || `web-image-${Date.now()}.img`;
}

function openWaitingPage(id, errorMessage = "") {
  const params = new URLSearchParams();
  if (id) {
    params.set("id", id);
  }
  if (errorMessage) {
    params.set("error", errorMessage);
  }

  const page = `waiting.html?${params.toString()}`;
  const targetUrl = chrome.runtime.getURL(page);
  const pagePatterns = [
    `${chrome.runtime.getURL("waiting.html")}*`,
    `${chrome.runtime.getURL("results.html")}*`
  ];

  return new Promise((resolve) => {
    chrome.tabs.query({ url: pagePatterns }, (tabs) => {
      const [tab] = tabs || [];
      if (tab?.id) {
        chrome.tabs.update(tab.id, { active: true, url: targetUrl }, resolve);
        return;
      }
      chrome.tabs.create({ url: targetUrl }, resolve);
    });
  });
}
