"use strict";

(() => {
  const DEFAULT_OPTIONS = {
    iqdbEnabled: true,
    ascii2dEnabled: true,
    saucenaoEnabled: true,
    traceMoeEnabled: true,
    googleLensEnabled: true,
    bingEnabled: true,
    tineyeEnabled: true,
    yandexEnabled: true,
    baiduEnabled: true,
    externalLinksEnabled: false,
    saucenaoApiKey: "",
    traceMoeApiKey: "",
    minSimilarity: 35,
    resultLimit: 12
  };

  const EXTERNAL_PLATFORMS = [
    { name: "Google Lens", url: "https://lens.google.com/upload" },
    { name: "Bing 视觉搜索", url: "https://www.bing.com/images/search?view=detailv2&iss=sbiupload" },
    { name: "TinEye", url: "https://tineye.com/search" },
    { name: "Yandex Images", url: "https://yandex.com/images/search" },
    { name: "百度识图", url: "https://graph.baidu.com/pcpage/index" },
    { name: "trace.moe 网页版", url: "https://trace.moe/" }
  ];

  async function readOptions() {
    return new Promise((resolve) => {
      const chromeApi = globalThis.chrome;
      if (chromeApi?.storage?.sync) {
        chromeApi.storage.sync.get(DEFAULT_OPTIONS, (items) => resolve(normalizeOptions(items)));
        return;
      }
      resolve(normalizeOptions(readLocalOptions()));
    });
  }

  function normalizeOptions(items) {
    const merged = {
      ...DEFAULT_OPTIONS,
      ...items
    };
    if ("externalAutoOpenEnabled" in merged && !("externalLinksEnabled" in items)) {
      merged.externalLinksEnabled = Boolean(merged.externalAutoOpenEnabled);
    }
    return {
      ...merged,
      minSimilarity: clampNumber(Number(merged.minSimilarity), 0, 100),
      resultLimit: clampNumber(Number(merged.resultLimit), 1, 30)
    };
  }

  function readLocalOptions() {
    try {
      return JSON.parse(localStorage.getItem("imageSearchOptions") || "{}");
    } catch {
      return {};
    }
  }

  function getProviders(file, options, context = {}) {
    return [
      {
        id: "iqdb",
        name: "IQDB",
        enabled: options.iqdbEnabled,
        run: () => searchIqdb(file, options, context)
      },
      {
        id: "ascii2d",
        name: "ascii2d",
        enabled: options.ascii2dEnabled,
        hideOnError: true,
        hideWhenEmpty: true,
        run: () => searchAscii2d(file, options, context)
      },
      {
        id: "saucenao",
        name: "SauceNAO",
        enabled: options.saucenaoEnabled,
        hideOnError: true,
        hideWhenEmpty: true,
        run: () => searchSauceNao(file, options, context)
      },
      {
        id: "traceMoe",
        name: "trace.moe API",
        enabled: options.traceMoeEnabled,
        run: () => searchTraceMoe(file, options, context)
      },
      {
        id: "googleLens",
        name: "Google Lens",
        enabled: options.googleLensEnabled,
        fragile: true,
        hideOnError: true,
        hideWhenEmpty: true,
        run: () => searchGoogleLens(file, options, context)
      },
      {
        id: "bing",
        name: "Bing 视觉搜索",
        enabled: options.bingEnabled,
        fragile: true,
        hideOnError: true,
        hideWhenEmpty: true,
        run: () => searchBing(file, options, context)
      },
      {
        id: "tineye",
        name: "TinEye",
        enabled: options.tineyeEnabled,
        fragile: true,
        hideOnError: true,
        hideWhenEmpty: true,
        run: () => searchTinEye(file, options, context)
      },
      {
        id: "yandex",
        name: "Yandex Images",
        enabled: options.yandexEnabled,
        fragile: true,
        hideOnError: true,
        hideWhenEmpty: true,
        run: () => searchYandex(file, options, context)
      },
      {
        id: "baidu",
        name: "百度识图",
        enabled: options.baiduEnabled,
        fragile: true,
        hideOnError: true,
        hideWhenEmpty: true,
        run: () => searchBaidu(file, options, context)
      }
    ].filter((provider) => provider.enabled);
  }

  async function runSearch(file, options, handlers = {}) {
    const context = await prepareSearchContext(file, options);
    const providers = getProviders(file, options, context);
    const stableProviders = providers.filter((provider) => !provider.fragile);
    const fragileProviders = providers.filter((provider) => provider.fragile);
    const settled = await Promise.all(stableProviders.map((provider) => runProvider(provider, handlers)));
    for (const provider of fragileProviders) {
      settled.push(await runProvider(provider, handlers));
      await delay(350);
    }
    const results = settled.flatMap((item) => item.results);
    const ranked = rankResults(results, options.minSimilarity);
    return {
      providers: settled.filter((item) => !item.hidden),
      results: ranked,
      errors: settled.filter((item) => item.error && !item.hidden)
    };
  }

  async function runProvider(provider, handlers) {
    handlers.onProviderStart?.(provider);
    try {
      const results = await provider.run();
      const payload = {
        id: provider.id,
        name: provider.name,
        results,
        error: "",
        hidden: provider.hideWhenEmpty && !results.length
      };
      handlers.onProviderDone?.(payload);
      return payload;
    } catch (error) {
      const payload = {
        id: provider.id,
        name: provider.name,
        results: [],
        error: error.message || "请求失败",
        hidden: Boolean(provider.hideOnError)
      };
      handlers.onProviderDone?.(payload);
      return payload;
    }
  }

  async function prepareSearchContext(file, options) {
    const needsPublicUrl = options.traceMoeEnabled || options.googleLensEnabled || options.bingEnabled || options.tineyeEnabled || options.yandexEnabled || options.baiduEnabled;
    if (!options.iqdbEnabled && !needsPublicUrl) {
      return {};
    }
    try {
      const iqdb = await uploadIqdb(file);
      return {
        iqdbHtml: iqdb.html,
        publicImageUrl: iqdb.publicImageUrl
      };
    } catch {
      return {};
    }
  }

  async function uploadIqdb(file) {
    const supportedTypes = new Set(["image/jpeg", "image/png", "image/gif"]);
    if (!supportedTypes.has(file.type)) {
      throw new Error("仅支持 JPG、PNG、GIF");
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new Error("图片不能超过 8MB");
    }

    const formData = new FormData();
    ["1", "2", "3", "4", "5", "6", "11", "13"].forEach((service) => {
      formData.append("service[]", service);
    });
    formData.append("file", file, file.name || "image");

    const response = await fetchWithRetry("https://www.iqdb.org/", {
      method: "POST",
      body: formData
    });
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return {
      html,
      publicImageUrl: extractIqdbPublicImageUrl(html)
    };
  }

  async function searchIqdb(file, options, context = {}) {
    const iqdb = context.iqdbHtml ? context : await uploadIqdb(file);
    return parseIqdbHtml(iqdb.iqdbHtml || iqdb.html).slice(0, options.resultLimit);
  }

  async function searchAscii2d(file, options, context = {}) {
    const colorSearch = await requestAscii2d(file, context);
    const results = parseAscii2dHtml(colorSearch.html, colorSearch.url, "色合検索");
    const featureUrl = colorSearch.url.includes("/color/") ? colorSearch.url.replace("/color/", "/bovw/") : "";

    if (featureUrl) {
      try {
        const featureResponse = await fetchWithRetry(featureUrl, {
          credentials: "include"
        });
        const featureHtml = await featureResponse.text();
        if (featureResponse.ok) {
          results.push(...parseAscii2dHtml(featureHtml, featureResponse.url, "特徴検索"));
        }
      } catch {
        // Color-search results are still useful if feature search is unavailable.
      }
    }

    return uniqueResults(results).slice(0, options.resultLimit);
  }

  async function requestAscii2d(file, context = {}) {
    if (context.publicImageUrl) {
      try {
        return await postAscii2dUrl(context.publicImageUrl);
      } catch {
        // Fall back to direct file upload below.
      }
    }
    return postAscii2dFile(file);
  }

  async function postAscii2dUrl(imageUrl) {
    const formData = new FormData();
    formData.append("uri", imageUrl);
    const response = await fetchWithRetry("https://ascii2d.net/search/uri", {
      method: "POST",
      body: formData,
      credentials: "include"
    });
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return { html, url: response.url };
  }

  async function postAscii2dFile(file) {
    const formData = new FormData();
    formData.append("file", file, file.name || "image");
    const response = await fetchWithRetry("https://ascii2d.net/search/file", {
      method: "POST",
      body: formData,
      credentials: "include"
    });
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return { html, url: response.url };
  }

  async function searchSauceNao(file, options, context = {}) {
    if (options.saucenaoApiKey) {
      try {
        return await searchSauceNaoApi(file, options);
      } catch {
        // The public web search is a useful fallback when the JSON API is rate-limited or rejects a key.
      }
    }
    return searchSauceNaoWeb(file, options, context);
  }

  async function searchSauceNaoApi(file, options) {
    const formData = new FormData();
    formData.append("output_type", "2");
    formData.append("db", "999");
    formData.append("numres", String(options.resultLimit));
    formData.append("file", file, file.name || "image");
    formData.append("api_key", options.saucenaoApiKey);

    const response = await fetchWithRetry("https://saucenao.com/search.php", {
      method: "POST",
      body: formData
    });
    const payload = await parseJsonResponse(response);

    if (payload.header && Number(payload.header.status) < 0) {
      throw new Error(payload.header.message || "SauceNAO 拒绝了请求");
    }

    const items = Array.isArray(payload.results) ? payload.results : [];
    return items.map((item, index) => normalizeSauceNaoResult(item, index)).filter(Boolean);
  }

  async function searchSauceNaoWeb(file, options, context = {}) {
    try {
      return await postSauceNaoWeb(createSauceNaoWebForm({
        file,
        limit: options.resultLimit
      }), options.resultLimit);
    } catch (error) {
      if (!context.publicImageUrl) {
        throw error;
      }
      return postSauceNaoWeb(createSauceNaoWebForm({
        imageUrl: context.publicImageUrl,
        limit: options.resultLimit
      }), options.resultLimit);
    }
  }

  function createSauceNaoWebForm({ file, imageUrl, limit }) {
    const formData = new FormData();
    formData.append("db", "999");
    formData.append("numres", String(limit));
    if (imageUrl) {
      formData.append("url", imageUrl);
    } else if (file) {
      formData.append("file", file, file.name || "image");
    }
    return formData;
  }

  async function postSauceNaoWeb(formData, limit) {
    const response = await fetchWithRetry("https://saucenao.com/search.php", {
      method: "POST",
      body: formData,
      credentials: "include"
    });
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return parseSauceNaoHtml(html, limit);
  }

  async function searchTraceMoe(file, options, context = {}) {
    const headers = {};
    if (options.traceMoeApiKey) {
      headers["x-trace-key"] = options.traceMoeApiKey;
    }

    const url = new URL("https://api.trace.moe/search");
    url.searchParams.set("cutBorders", "true");
    if (context.publicImageUrl) {
      url.searchParams.set("url", context.publicImageUrl);
      try {
        const response = await fetchWithRetry(url.toString(), {
          method: "GET",
          headers
        });
        const payload = await parseJsonResponse(response);
        if (payload.error) {
          throw new Error(payload.error);
        }
        const items = Array.isArray(payload.result) ? payload.result : [];
        if (items.length) {
          return items.slice(0, options.resultLimit).map((item, index) => normalizeTraceMoeResult(item, index)).filter(Boolean);
        }
      } catch {
        url.searchParams.delete("url");
      }
    }

    const formData = new FormData();
    formData.append("file", file, file.name || "image");

    const response = await fetchWithRetry(url.toString(), {
      method: "POST",
      body: formData,
      headers
    });
    const payload = await parseJsonResponse(response);
    if (payload.error) {
      throw new Error(payload.error);
    }

    const items = Array.isArray(payload.result) ? payload.result : [];
    return items.slice(0, options.resultLimit).map((item, index) => normalizeTraceMoeResult(item, index)).filter(Boolean);
  }

  async function searchGoogleLens(file, options, context = {}) {
    if (context.publicImageUrl) {
      try {
        const url = `https://lens.google.com/uploadbyurl?hl=zh-CN&url=${encodeURIComponent(context.publicImageUrl)}`;
        const response = await fetchWithRetry(url, {
          method: "GET",
          credentials: "include"
        });
        const html = await response.text();
        if (response.ok) {
          const results = parseGoogleLensHtml(html, response.url).slice(0, options.resultLimit);
          if (results.length) {
            return results;
          }
        }
      } catch {
        // Fall back to direct upload below.
      }
    }

    const formData = new FormData();
    formData.append("encoded_image", file, file.name || "image");

    const response = await fetchWithRetry("https://lens.google.com/v3/upload?hl=zh-CN", {
      method: "POST",
      body: formData,
      credentials: "include"
    });
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return parseGoogleLensHtml(html, response.url).slice(0, options.resultLimit);
  }

  async function searchBing(file, options, context = {}) {
    if (context.publicImageUrl) {
      try {
        const payload = await getBingKnowledgeByImageUrl(context.publicImageUrl);
        const results = normalizeBingKnowledge(payload, options.resultLimit);
        if (results.length) {
          return results;
        }
      } catch {
        // Fall back to direct upload below.
      }
    }

    const base64 = await fileToBase64(file);
    const uploadForm = new FormData();
    uploadForm.append("cbir", "sbi");
    uploadForm.append("imageBin", base64);

    const uploadResponse = await fetchWithRetry("https://www.bing.com/images/search?view=detailv2&iss=sbiupload", {
      method: "POST",
      body: uploadForm,
      credentials: "include"
    });
    const uploadHtml = await uploadResponse.text();
    if (!uploadResponse.ok) {
      throw new Error(`HTTP ${uploadResponse.status}`);
    }

    const bcid = uploadHtml.match(/(bcid_[A-Za-z0-9-.]+)/)?.[1];
    if (!bcid) {
      return parseBingHtml(uploadHtml).slice(0, options.resultLimit);
    }

    const params = new URLSearchParams({
      rshighlight: "true",
      textDecorations: "true",
      internalFeatures: "similarproducts,share",
      nbl: "1",
      FORM: "SBIHMP",
      safeSearch: "off",
      mkt: "zh-CN",
      setLang: "zh-CN",
      iss: "sbi",
      IID: "idpins",
      SFX: "1",
      insightsToken: bcid
    });
    const knowledgeForm = new FormData();
    knowledgeForm.append("knowledgeRequest", JSON.stringify({
      imageInfo: {
        imageInsightsToken: bcid,
        source: "Gallery"
      }
    }));
    const response = await fetchWithRetry(`https://www.bing.com/images/api/custom/knowledge?${params}`, {
      method: "POST",
      body: knowledgeForm,
      credentials: "include",
      referrer: `https://www.bing.com/images/search?insightsToken=${encodeURIComponent(bcid)}`
    });
    const payload = await parseJsonResponse(response);
    return normalizeBingKnowledge(payload, options.resultLimit);
  }

  async function searchTinEye(file, options, context = {}) {
    const formData = new FormData();
    formData.append("sort", "score");
    formData.append("order", "desc");
    formData.append("page", "1");
    if (context.publicImageUrl) {
      formData.append("url", context.publicImageUrl);
    } else {
      formData.append("image", file, file.name || "image");
    }

    const response = await fetchWithRetry("https://tineye.com/api/v1/result_json/", {
      method: "POST",
      body: formData,
      credentials: "include"
    });
    const payload = await parseJsonResponse(response);
    const items = Array.isArray(payload.matches) ? payload.matches : [];
    return items.slice(0, options.resultLimit).map((item, index) => normalizeTinEyeResult(item, index)).filter(Boolean);
  }

  async function searchYandex(file, options, context = {}) {
    if (context.publicImageUrl) {
      try {
        const url = `https://yandex.com/images/search?rpt=imageview&cbir_page=sites&url=${encodeURIComponent(context.publicImageUrl)}`;
        const response = await fetchWithRetry(url, {
          method: "GET",
          credentials: "include"
        });
        const html = await response.text();
        if (response.ok) {
          const results = parseYandexHtml(html).slice(0, options.resultLimit);
          if (results.length) {
            return results;
          }
        }
      } catch {
        // Fall back to direct upload below.
      }
    }

    const formData = new FormData();
    formData.append("prg", "1");
    formData.append("upfile", file, file.name || "image");

    const response = await fetchWithRetry("https://yandex.com/images/search?rpt=imageview&cbir_page=sites", {
      method: "POST",
      body: formData,
      credentials: "include"
    });
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return parseYandexHtml(html).slice(0, options.resultLimit);
  }

  async function searchBaidu(file, options, context = {}) {
    const formData = new FormData();
    formData.append("from", "pc");
    if (context.publicImageUrl) {
      formData.append("image_url", context.publicImageUrl);
    }
    formData.append("image", file, file.name || "image");

    const uploadResponse = await fetchWithRetry("https://graph.baidu.com/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
      headers: {
        "Acs-Token": ""
      },
      referrer: "https://graph.baidu.com/pcpage/index"
    });
    const uploadPayload = await parseJsonResponse(uploadResponse);
    const resultUrl = uploadPayload?.data?.url;
    if (!resultUrl) {
      throw new Error(uploadPayload?.msg || "百度识图未返回结果地址");
    }

    const pageResponse = await fetchWithRetry(resultUrl, {
      credentials: "include"
    });
    const html = await pageResponse.text();
    if (!pageResponse.ok) {
      throw new Error(`HTTP ${pageResponse.status}`);
    }
    return parseBaiduHtml(html, resultUrl, options.resultLimit);
  }

  async function getBingKnowledgeByImageUrl(imageUrl) {
    const params = new URLSearchParams({
      rshighlight: "true",
      textDecorations: "true",
      internalFeatures: "similarproducts,share",
      nbl: "1",
      FORM: "SBIHMP",
      safeSearch: "off",
      mkt: "zh-CN",
      setLang: "zh-CN",
      iss: "sbi",
      IID: "idpins",
      SFX: "1"
    });
    const referer = `https://www.bing.com/images/search?view=detailv2&iss=sbi&FORM=SBIHMP&sbisrc=UrlPaste&q=imgurl:${encodeURIComponent(imageUrl)}&idpbck=1`;
    const formData = new FormData();
    formData.append("knowledgeRequest", JSON.stringify({
      imageInfo: {
        url: imageUrl,
        source: "Url"
      }
    }));
    const response = await fetchWithRetry(`https://www.bing.com/images/api/custom/knowledge?${params}`, {
      method: "POST",
      body: formData,
      credentials: "include",
      referrer: referer
    });
    return parseJsonResponse(response);
  }

  async function parseJsonResponse(response) {
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(response.ok ? "返回内容不是 JSON" : `HTTP ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
    }
    return payload;
  }

  function parseSauceNaoHtml(html, limit) {
    const document = new DOMParser().parseFromString(html, "text/html");
    return [...document.querySelectorAll(".resulttable")]
      .map((table, index) => normalizeSauceNaoHtmlResult(table, index))
      .filter(Boolean)
      .slice(0, limit);
  }

  function normalizeSauceNaoHtmlResult(table, index) {
    const similarityText = table.querySelector(".resultsimilarityinfo")?.textContent || "";
    const similarity = clampNumber(Number.parseFloat(similarityText), 0, 100);
    if (!similarity) {
      return null;
    }

    const links = [...table.querySelectorAll(".resultcontent a[href], .resultmiscinfo a[href]")]
      .map((link) => ({
        href: normalizePixivUrl(normalizeUrl(link.getAttribute("href") || "", "https://saucenao.com")),
        text: cleanWhitespace(link.textContent || "")
      }))
      .filter((link) => link.href && !isSauceNaoUtilityUrl(link.href));
    const sourceLink = pickSauceNaoHtmlSourceLink(links);
    const authorLink = links.find((link) => link.href !== sourceLink?.href && /pixiv\.net\/(?:en\/)?users\/|twitter\.com\/|x\.com\//i.test(link.href));
    const image = table.querySelector(".resultimage img");
    const imageTitle = cleanWhitespace(image?.getAttribute("title") || "");
    const thumbnail = normalizeUrl(image?.getAttribute("data-src") || image?.getAttribute("data-src2") || image?.getAttribute("src") || "", "https://saucenao.com");
    const titleText = cleanWhitespace(table.querySelector(".resulttitle")?.textContent || "").replace(/^Creator:\s*/i, "");
    const title = titleText || sourceLink?.text || imageTitle || `SauceNAO 结果 ${index + 1}`;
    const sourceUrl = sourceLink?.href || "";

    return {
      id: `saucenao-web-${index}-${sourceUrl || title}`,
      provider: "SauceNAO",
      title,
      url: sourceUrl,
      source: readableSource(sourceUrl) || "SauceNAO",
      thumbnail,
      similarity,
      meta: [imageTitle, authorLink?.text].filter(Boolean).join(" · ")
    };
  }

  function pickSauceNaoHtmlSourceLink(links) {
    return links.find((link) => /pixiv\.net\/(?:en\/)?artworks\/\d+/i.test(link.href))
      || links.find((link) => !/pixiv\.net\/(?:en\/)?users\//i.test(link.href))
      || links[0]
      || null;
  }

  function isSauceNaoUtilityUrl(value) {
    try {
      const url = new URL(value);
      return url.hostname.replace(/^www\./, "") === "saucenao.com" && /\/(?:info|search)\.php$/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function normalizeSauceNaoResult(item, index) {
    const header = item.header || {};
    const data = item.data || {};
    const similarity = clampNumber(Number.parseFloat(header.similarity), 0, 100);
    const sourceUrl = buildSauceNaoSourceUrl(data);
    const title = firstValue([
      data.title,
      data.source,
      data.material,
      data.member_name,
      data.creator,
      header.index_name
    ]) || `SauceNAO 结果 ${index + 1}`;
    const author = firstValue([data.creator, data.author_name, data.member_name, data.author]);
    const authorUrl = buildSauceNaoAuthorUrl(data);
    const meta = [header.index_name, author, readableSource(authorUrl)].filter(Boolean).join(" · ");

    return {
      id: `saucenao-${index}-${sourceUrl || title}`,
      provider: "SauceNAO",
      title,
      url: sourceUrl,
      source: readableSource(sourceUrl) || data.source || header.index_name || "SauceNAO",
      thumbnail: normalizeUrl(header.thumbnail, "https://saucenao.com"),
      similarity,
      meta
    };
  }

  function buildSauceNaoSourceUrl(data) {
    if (data.pixiv_id) {
      return `https://www.pixiv.net/artworks/${data.pixiv_id}`;
    }
    if (data.pawoo_id && data.pawoo_user_acct) {
      return `https://pawoo.net/@${data.pawoo_user_acct}/${data.pawoo_id}`;
    }
    if (data.getchu_id) {
      return `https://www.getchu.com/soft.phtml?id=${data.getchu_id}`;
    }
    return firstValue(data.ext_urls) || data.source || "";
  }

  function buildSauceNaoAuthorUrl(data) {
    if (data.pixiv_id && data.member_id) {
      return `https://www.pixiv.net/users/${data.member_id}`;
    }
    if (data.tweet_id && data.twitter_user_id) {
      return `https://twitter.com/intent/user?user_id=${data.twitter_user_id}`;
    }
    if (data.pawoo_user_acct) {
      return `https://pawoo.net/@${data.pawoo_user_acct}`;
    }
    return data.author_url || "";
  }

  function normalizeTraceMoeResult(item, index) {
    const anilist = item.anilist || {};
    const titleInfo = anilist.title || {};
    const title = firstValue([titleInfo.english, titleInfo.romaji, titleInfo.native, item.filename]) || `trace.moe 结果 ${index + 1}`;
    const id = typeof anilist === "number" ? anilist : anilist.id;
    const sourceUrl = id ? `https://anilist.co/anime/${id}` : "";
    const similarity = clampNumber(Number(item.similarity) * 100, 0, 100);
    const episode = Array.isArray(item.episode) ? item.episode.join(", ") : item.episode;
    const meta = [
      episode ? `第 ${episode} 集` : "",
      Number.isFinite(item.at) ? formatTime(item.at) : ""
    ].filter(Boolean).join(" · ");

    return {
      id: `trace-${index}-${sourceUrl || item.filename || title}`,
      provider: "trace.moe API",
      title,
      url: sourceUrl,
      source: sourceUrl ? "AniList" : "trace.moe",
      thumbnail: item.image || "",
      similarity,
      meta
    };
  }

  function parseAscii2dHtml(html, pageUrl, mode) {
    const document = new DOMParser().parseFromString(html, "text/html");
    return [...document.querySelectorAll("div.row.item-box")]
      .map((item, index) => normalizeAscii2dResult(item, index, pageUrl, mode))
      .filter(Boolean);
  }

  function normalizeAscii2dResult(item, index, pageUrl, mode) {
    const detailBox = item.querySelector("div.detail-box.gray-link") || item.querySelector("div.detail-box") || item;
    const links = [...detailBox.querySelectorAll("a[href]")]
      .map((link) => ({
        href: normalizeUrl(link.getAttribute("href") || "", "https://ascii2d.net"),
        text: cleanWhitespace(link.textContent || "")
      }))
      .filter((link) => link.href);
    const externalLinks = links.filter((link) => !isAscii2dUrl(link.href));
    const sourceLink = pickAscii2dSourceLink(externalLinks);
    const authorLink = externalLinks.find((link) => link.href !== sourceLink?.href && /pixiv\.net\/(?:en\/)?users\/|twitter\.com\/|x\.com\/|fanbox\.cc|fantia\.jp/i.test(link.href));
    const titleLink = sourceLink || externalLinks[0] || links[0];
    const hash = cleanWhitespace(item.querySelector("div.hash")?.textContent || "");
    const detail = cleanWhitespace(item.querySelector("small")?.textContent || "");
    const sourceMark = pickAscii2dSourceMark(detailBox);
    const title = titleLink?.text || cleanWhitespace(detailBox.querySelector("h6")?.textContent || "") || sourceMark || `ascii2d 结果 ${index + 1}`;
    const thumbnail = normalizeUrl(item.querySelector("img")?.getAttribute("src") || "", "https://ascii2d.net");
    const url = sourceLink?.href || externalLinks[0]?.href || pageUrl;

    if (!url && !thumbnail) {
      return null;
    }

    return normalizeExternalResult({
      provider: "ascii2d",
      index,
      title,
      url,
      thumbnail,
      source: readableSource(url) || sourceMark || "ascii2d",
      meta: [mode, sourceMark, authorLink?.text, detail, hash].filter(Boolean).join(" · ")
    });
  }

  function pickAscii2dSourceLink(links) {
    return links.find((link) => /pixiv\.net\/(?:en\/)?artworks\/\d+|pixiv\.net\/i\/\d+/i.test(link.href))
      || links.find((link) => !/pixiv\.net\/(?:en\/)?users\//i.test(link.href))
      || links[0]
      || null;
  }

  function pickAscii2dSourceMark(element) {
    const text = cleanWhitespace(element.textContent || "");
    return ["pixiv", "twitter", "x.com", "fanbox", "fantia", "misskey", "ニコニコ静画", "ニジエ"].find((mark) => text.toLowerCase().includes(mark.toLowerCase())) || "";
  }

  function normalizeBingKnowledge(payload, limit) {
    const actions = (payload.tags || []).flatMap((tag) => tag.actions || []);
    const values = [];
    for (const action of actions) {
      if (!["PagesIncluding", "VisualSearch"].includes(action.actionType)) {
        continue;
      }
      const data = action.data?.value;
      if (Array.isArray(data)) {
        values.push(...data);
      }
    }
    return values.slice(0, limit).map((item, index) => normalizeExternalResult({
      provider: "Bing 视觉搜索",
      index,
      title: item.name || item.hostPageDisplayUrl || `Bing 结果 ${index + 1}`,
      url: item.hostPageUrl || item.webSearchUrl || item.contentUrl || "",
      thumbnail: item.thumbnailUrl || item.contentUrl || "",
      source: readableSource(item.hostPageUrl || item.contentUrl) || "Bing",
      meta: item.hostPageDisplayUrl || readableSource(item.hostPageUrl)
    }));
  }

  function normalizeTinEyeResult(item, index) {
    const backlink = Array.isArray(item.backlinks) ? item.backlinks[0] : null;
    return normalizeExternalResult({
      provider: "TinEye",
      index,
      title: backlink?.backlink || item.domain || `TinEye 结果 ${index + 1}`,
      url: backlink?.backlink || backlink?.url || "",
      thumbnail: item.image_url || backlink?.url || "",
      source: item.domain || readableSource(backlink?.backlink) || "TinEye",
      meta: [item.width && item.height ? `${item.width}x${item.height}` : "", backlink?.crawl_date].filter(Boolean).join(" · ")
    });
  }

  function parseGoogleLensHtml(html, pageUrl) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const imageMaps = extractGoogleImageMaps(document);
    const items = [...document.querySelectorAll(".vEWxFf.RCxtQc.my5z3d, .YxbOwd")];
    return items.map((item, index) => {
      const link = item.querySelector("a.LBcIee[href], a.ngTNl[href], a[href^='http']");
      const title = cleanWhitespace(item.querySelector(".Yt787, .ZhosBf")?.textContent || link?.textContent || `Google Lens 结果 ${index + 1}`);
      const image = item.querySelector("img");
      const thumbnail = extractImageUrl(image, imageMaps) || "";
      const url = normalizeGoogleUrl(link?.getAttribute("href") || "", pageUrl);
      return normalizeExternalResult({
        provider: "Google Lens",
        index,
        title,
        url,
        thumbnail,
        source: cleanWhitespace(item.querySelector(".R8BTeb, .xuPcX")?.textContent) || readableSource(url) || "Google Lens",
        meta: readableSource(url)
      });
    }).filter((item) => item.url || item.thumbnail);
  }

  function parseBingHtml(html) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const items = [];
    for (const element of document.querySelectorAll(".iusc[m], [m*='murl']")) {
      const raw = element.getAttribute("m");
      if (!raw) {
        continue;
      }
      try {
        const data = JSON.parse(raw);
        items.push(normalizeExternalResult({
          provider: "Bing 视觉搜索",
          index: items.length,
          title: data.t || data.desc || `Bing 结果 ${items.length + 1}`,
          url: data.purl || data.p || data.murl || "",
          thumbnail: data.turl || data.murl || "",
          source: readableSource(data.purl || data.murl) || "Bing",
          meta: readableSource(data.murl)
        }));
      } catch {
        // Ignore individual malformed Bing result payloads.
      }
    }
    return items;
  }

  function parseYandexHtml(html) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const root = document.querySelector('div.Root[id^="ImagesApp-"][data-state]');
    const state = root?.getAttribute("data-state");
    if (!state) {
      throw new Error("Yandex 未返回可解析结果");
    }
    const payload = JSON.parse(state);
    const sites = payload?.initialState?.cbirSites?.sites;
    if (!Array.isArray(sites)) {
      return [];
    }
    return sites.map((site, index) => normalizeExternalResult({
      provider: "Yandex Images",
      index,
      title: site.title || `Yandex 结果 ${index + 1}`,
      url: site.url || "",
      thumbnail: normalizeUrl(site.thumb?.url || "", "https://yandex.com"),
      source: site.domain || readableSource(site.url) || "Yandex",
      meta: [site.originalImage?.width && site.originalImage?.height ? `${site.originalImage.width}x${site.originalImage.height}` : "", site.description].filter(Boolean).join(" · ")
    }));
  }

  async function parseBaiduHtml(html, pageUrl, limit) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const script = [...document.querySelectorAll("script")].map((item) => item.textContent || "").find((text) => text.includes("window.cardData"));
    if (!script) {
      return [];
    }
    const start = script.indexOf("[");
    const end = script.lastIndexOf("]") + 1;
    if (start < 0 || end <= start) {
      return [];
    }
    const cards = JSON.parse(script.slice(start, end));
    const sameCard = cards.find((card) => card.cardName === "same");
    const simCard = cards.find((card) => card.cardName === "simipic");
    let dataList = sameCard?.tplData?.list || [];

    if (simCard?.tplData?.firstUrl) {
      try {
        const response = await fetch(simCard.tplData.firstUrl);
        const payload = await parseJsonResponse(response);
        dataList = dataList.concat(payload?.data?.list || []);
      } catch {
        // Same-card results are still useful if the paged similar-image endpoint fails.
      }
    }

    return dataList.slice(0, limit).map((item, index) => normalizeExternalResult({
      provider: "百度识图",
      index,
      title: firstValue(item.title) || item.fromPageTitle || `百度识图结果 ${index + 1}`,
      url: item.url || item.fromUrl || pageUrl || "",
      thumbnail: item.image_src || item.thumbUrl || "",
      source: readableSource(item.url || item.fromUrl) || "百度识图",
      meta: item.fromPageTitle || readableSource(item.fromUrl)
    }));
  }

  function normalizeExternalResult({ provider, index, title, url, thumbnail, source, meta }) {
    return {
      id: `${provider}-${index}-${url || title}`,
      provider,
      title: title || `${provider} 结果 ${index + 1}`,
      url: normalizeUrl(url || "", location.href),
      source: source || provider,
      thumbnail: normalizeUrl(thumbnail || "", location.href),
      similarity: scoreByRank(index),
      scoreLabel: "平台排序",
      meta: meta || "该平台未返回百分比相似度"
    };
  }

  function extractIqdbPublicImageUrl(html) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const ownImage = document.querySelector("#pages > div:first-child td.image img");
    const src = ownImage?.getAttribute("src") || "";
    return normalizeUrl(src, "https://www.iqdb.org/");
  }

  function parseIqdbHtml(html) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const tables = [...document.querySelectorAll("#pages > div > table")];
    const results = [];

    for (const [index, table] of tables.entries()) {
      const text = table.textContent || "";
      const similarityMatch = text.match(/(\d+(?:\.\d+)?)%\s+similarity/i);
      if (!similarityMatch) {
        continue;
      }

      const link = table.querySelector("td.image a[href]");
      const image = table.querySelector("td.image img");
      const sourceCell = [...table.querySelectorAll("td")].find((cell) => cell.querySelector("img.service-icon"));
      const source = cleanWhitespace(sourceCell?.textContent || "IQDB");
      const title = cleanWhitespace(image?.getAttribute("title") || image?.getAttribute("alt") || source || `IQDB 结果 ${index + 1}`);
      const metaCell = [...table.querySelectorAll("td")].find((cell) => /\d+\s*[×x]\s*\d+/.test(cell.textContent || ""));

      results.push({
        id: `iqdb-${index}-${link?.getAttribute("href") || title}`,
        provider: "IQDB",
        title: title === "[IMG]" ? `${source} 匹配结果` : title,
        url: normalizeUrl(link?.getAttribute("href") || "", "https://www.iqdb.org/"),
        source,
        thumbnail: normalizeUrl(image?.getAttribute("src") || "", "https://www.iqdb.org/"),
        similarity: clampNumber(Number.parseFloat(similarityMatch[1]), 0, 100),
        meta: cleanWhitespace(metaCell?.textContent || "")
      });
    }

    return results;
  }

  function rankResults(results, minSimilarity) {
    const seen = new Set();
    return results
      .filter((result) => result.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .filter((result) => {
        const key = `${result.provider}:${result.url || result.title}`.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  function uniqueResults(results) {
    const seen = new Set();
    return results.filter((result) => {
      const key = `${result.provider}:${result.url || result.title}`.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  async function fetchWithRetry(url, init = {}, options = {}) {
    const retries = options.retries ?? 2;
    const timeoutMs = options.timeoutMs ?? 18000;
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          cache: "no-store",
          ...init,
          signal: controller.signal
        });
        window.clearTimeout(timeout);
        if (!shouldRetryResponse(response) || attempt === retries) {
          return response;
        }
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        window.clearTimeout(timeout);
        lastError = error;
        if (attempt === retries) {
          throw error;
        }
      }
      await delay(500 * (attempt + 1));
    }

    throw lastError || new Error("请求失败");
  }

  function shouldRetryResponse(response) {
    return response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function fileToBase64(file) {
    const buffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }

  function scoreByRank(index) {
    return Math.max(35, 70 - index);
  }

  function extractGoogleImageMaps(document) {
    const imageUrlMap = new Map();
    const base64ImageMap = new Map();
    for (const script of document.querySelectorAll("script")) {
      const text = script.textContent || "";
      const ldiMatch = text.match(/google\.ldi\s*=\s*({[^}]+})/);
      if (ldiMatch) {
        try {
          const jsonText = ldiMatch[1]
            .replace(/'/g, "\"")
            .replace(/\\u003d/g, "=")
            .replace(/\\u0026/g, "&");
          const payload = JSON.parse(jsonText);
          for (const [key, value] of Object.entries(payload)) {
            imageUrlMap.set(key, String(value));
          }
        } catch {
          // Google inlines this object in several formats; fall through to src parsing.
        }
      }

      if (text.includes("_setImagesSrc")) {
        const ids = text.match(/var ii=\[([^\]]*)]/)?.[1];
        const dataUrl = text.match(/var s='(data:image\/[^;]+;base64,[^']+)'/)?.[1];
        if (ids && dataUrl) {
          for (const id of ids.split(",").map((item) => item.trim().replace(/^'|'$/g, "")).filter(Boolean)) {
            base64ImageMap.set(id, dataUrl);
          }
        }
      }
    }
    return { imageUrlMap, base64ImageMap };
  }

  function extractImageUrl(image, maps) {
    if (!image) {
      return "";
    }
    const id = image.getAttribute("data-iid") || image.id || "";
    if (id && maps.imageUrlMap.has(id)) {
      return maps.imageUrlMap.get(id);
    }
    if (id && maps.base64ImageMap.has(id)) {
      return maps.base64ImageMap.get(id);
    }
    return image.getAttribute("data-src") || image.currentSrc || image.src || image.getAttribute("src") || "";
  }

  function normalizeGoogleUrl(value, base) {
    if (!value) {
      return "";
    }
    if (value.startsWith("/")) {
      return normalizeUrl(value, "https://www.google.com");
    }
    return normalizeUrl(value, base || "https://lens.google.com");
  }

  function firstValue(value) {
    if (Array.isArray(value)) {
      return value.find((item) => typeof item === "string" && item.trim()) || "";
    }
    return typeof value === "string" && value.trim() ? value : "";
  }

  function normalizeUrl(value, base) {
    if (!value) {
      return "";
    }
    if (value.startsWith("//")) {
      return `https:${value}`;
    }
    try {
      return new URL(value, base).toString();
    } catch {
      return "";
    }
  }

  function normalizePixivUrl(value) {
    if (!value) {
      return "";
    }
    try {
      const url = new URL(value);
      if (!/pixiv\.net$/i.test(url.hostname.replace(/^www\./, ""))) {
        return value;
      }
      const illustId = url.searchParams.get("illust_id");
      if (illustId) {
        return `https://www.pixiv.net/artworks/${illustId}`;
      }
      const memberId = url.searchParams.get("id");
      if (memberId && /\/member\.php$/i.test(url.pathname)) {
        return `https://www.pixiv.net/users/${memberId}`;
      }
      return value;
    } catch {
      return value;
    }
  }

  function readableSource(value) {
    if (!value || !/^https?:\/\//i.test(value)) {
      return "";
    }
    try {
      return new URL(value).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function isAscii2dUrl(value) {
    try {
      return new URL(value).hostname.replace(/^www\./, "") === "ascii2d.net";
    } catch {
      return false;
    }
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    const rest = String(total % 60).padStart(2, "0");
    return `${minutes}:${rest}`;
  }

  function clampNumber(value, min, max) {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(max, Math.max(min, value));
  }

  function cleanWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  globalThis.ImageSearchCore = {
    DEFAULT_OPTIONS,
    EXTERNAL_PLATFORMS,
    getProviders,
    readOptions,
    runSearch
  };
})();
