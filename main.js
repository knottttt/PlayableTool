// main.js - ZIP + adapterZip + inline 综合版本（含“下载原图”和强制改跳转链接）
//
// 支持：
// 1) window.__zip = "UEsDB..." / "+=" → PK ZIP 包（火车 / 鲨鱼 / 木乃伊 / 龙宝盆 等竞品）
//    - 用 JSZip 解包
//    - 列出其中的 PNG/JPG/WebP/GIF
//    - 允许用户替换后，再打回 ZIP，并写回 window.__zip
// 2) window.__adapter_zip__ zlib + JSON 资源表（FaCai / 发财鼓）
//    - 用 pako.inflate 解 JSON
//    - 列出 value 为 dataURL 的图片
//    - 用 adapter_override 脚本覆盖，不改原 JSON
// 3) 纯 inline data:image/...;base64 的 playable（聚宝盆开头 / 转盘）
//    - 直接在 HTML 字符串里替换 base64 串
//
// 附加：
// - 每张图追加“下载原图”按钮
// - 统一注入 mraid.open(STORE_URL)，并把多种常见跳转函数名都绑到 openStore 上
// - 直接在 HTML 里字符串级强制替换原有跳转链接（mraid.open("...") / storeUrl / clickTag / 商店 URL）

(function () {
  const state = createInitialState();

  const elements = {
    htmlFileInput: document.getElementById("htmlFileInput"),
    parseStatus: document.getElementById("parseStatus"),
    imageListDiv: document.getElementById("imageList"),
    batchImageInput: document.getElementById("batchImageInput"),
    batchReplaceStatus: document.getElementById("batchReplaceStatus"),
    buildButton: document.getElementById("buildButton"),
    downloadButton: document.getElementById("downloadButton"),
    buildStatus: document.getElementById("buildStatus"),
    appleStoreUrlInput: document.getElementById("appleStoreUrlInput"),
    googlePlayUrlInput: document.getElementById("googlePlayUrlInput"),
    previewFrameWrap: document.getElementById("previewFrameWrap"),
    previewStage: document.getElementById("previewStage"),
    previewFrame: document.getElementById("previewFrame"),
    previewEmpty: document.getElementById("previewEmpty"),
    refreshPreviewButton: document.getElementById("refreshPreviewButton"),
    downloadPreviewButton: document.getElementById("downloadPreviewButton"),
    devicePresetSelect: document.getElementById("devicePresetSelect"),
    orientationPortraitButton: document.getElementById("orientationPortraitButton"),
    orientationLandscapeButton: document.getElementById("orientationLandscapeButton")
  };

  const {
    htmlFileInput,
    parseStatus,
    imageListDiv,
    batchImageInput,
    batchReplaceStatus,
    buildButton,
    downloadButton,
    buildStatus,
    appleStoreUrlInput,
    googlePlayUrlInput,
    previewFrameWrap,
    previewStage,
    previewFrame,
    previewEmpty,
    refreshPreviewButton,
    downloadPreviewButton,
    devicePresetSelect,
    orientationPortraitButton,
    orientationLandscapeButton
  } = elements;

  const DEVICE_PRESETS = {
    "iphone-se": { width: 375, height: 667, family: "phone" },
    "iphone-xr": { width: 414, height: 896, family: "phone" },
    "iphone-12-pro": { width: 390, height: 844, family: "phone" },
    "iphone-14-pro-max": { width: 430, height: 932, family: "phone" },
    "pixel-7": { width: 412, height: 915, family: "phone" },
    "galaxy-s8-plus": { width: 360, height: 740, family: "phone" },
    "galaxy-s20-ultra": { width: 412, height: 915, family: "phone" },
    "ipad-mini": { width: 744, height: 1133, family: "tablet" },
    "ipad-air": { width: 820, height: 1180, family: "tablet" },
    "ipad-pro": { width: 1024, height: 1366, family: "tablet" }
  };

  function createInitialState() {
    return {
      baseHtmlText: "",
      originalHtmlText: "",
      lastBuiltHtmlText: "",
      previewObjectUrl: "",
      previewDevicePreset: "iphone-12-pro",
      previewOrientation: "portrait",
      imageMap: {},      // key -> dataURL����ԭʼ data:image ������key Ϊ��Դ·����ԭʼ dataURL
      overrideMap: {},   // key -> �� dataURL
      parseMode: null,   // 'superHtmlZip' | 'superHtmlResMap' | 'adapterZip' | 'inline' | null
      zipVarName: null,      // "__zip" / "__adapter_zip__" / ...
      zipSourceLabel: "",    // 用于 UI 展示 zip 来源
      zipAssignStart: null,  // HTML �� zip ��ֵ����ʼ index
      zipAssignEnd: null,    // HTML �� zip ��ֵ�ν��� index
      zipAssignType: null,
      zipBase64: "",
      zipSourceBytes: null,
      zipAllEntries: [],
      zipJszip: null,        // JSZip ʵ������ zipPk ģʽ��
      zipInlineImageMeta: {} // syntheticKey -> { zipPath, originalDataUrl, displayName }
    };
  }

  function resetParsedState() {
    state.imageMap = {};
    state.overrideMap = {};
    state.parseMode = null;
    state.zipVarName = null;
    state.zipSourceLabel = "";
    state.zipAssignStart = null;
    state.zipAssignEnd = null;
    state.zipAssignType = null;
    state.zipBase64 = "";
    state.zipSourceBytes = null;
    state.zipAllEntries = [];
    state.zipJszip = null;
    state.zipInlineImageMeta = {};
  }

  function resetAllState() {
    state.baseHtmlText = "";
    state.originalHtmlText = "";
    state.lastBuiltHtmlText = "";
    clearPreview();
    resetParsedState();
  }

  // 解析结果

  // ZIP 相关状态

  function setParseStatus(msg) { parseStatus.textContent = msg || ""; }
  function setBuildStatus(msg) { buildStatus.textContent = msg || ""; }
  function setBatchReplaceStatus(msg, isError) {
    batchReplaceStatus.textContent = msg || "";
    batchReplaceStatus.classList.toggle("error", !!isError);
  }

  function updateDownloadAvailability() {
    const enabled = !!state.lastBuiltHtmlText;
    if (downloadButton) downloadButton.disabled = !enabled;
    if (downloadPreviewButton) downloadPreviewButton.disabled = !enabled;
    if (refreshPreviewButton) refreshPreviewButton.disabled = !enabled;
  }

  function clearPreview() {
    if (state.previewObjectUrl) {
      URL.revokeObjectURL(state.previewObjectUrl);
      state.previewObjectUrl = "";
    }
    if (previewStage) {
      previewStage.classList.add("is-hidden");
    }
    if (previewFrame) {
      previewFrame.removeAttribute("src");
      previewFrame.style.display = "none";
    }
    if (previewEmpty) {
      previewEmpty.style.display = "flex";
    }
    updateDownloadAvailability();
  }

  function showPreviewFromHtml(html) {
    clearPreview();
    state.previewObjectUrl = URL.createObjectURL(
      new Blob([html], { type: "text/html;charset=utf-8" })
    );
    if (previewStage) {
      previewStage.classList.remove("is-hidden");
    }
    if (previewFrame) {
      previewFrame.src = state.previewObjectUrl;
      previewFrame.style.display = "block";
    }
    if (previewEmpty) {
      previewEmpty.style.display = "none";
    }
    updateDownloadAvailability();
  }

  function downloadLastBuiltHtml() {
    if (!state.lastBuiltHtmlText) {
      setBuildStatus("请先生成预览，再下载 HTML。");
      return;
    }
    downloadTextFile("playable_modified.html", state.lastBuiltHtmlText);
    setBuildStatus("已下载 playable_modified.html。");
  }

  function applyPreviewMode() {
    if (!previewStage) return;
    const preset = DEVICE_PRESETS[state.previewDevicePreset] || DEVICE_PRESETS["iphone-12-pro"];
    const isLandscape = state.previewOrientation === "landscape";
    const renderWidth = isLandscape ? preset.height : preset.width;
    const renderHeight = isLandscape ? preset.width : preset.height;
    let scale = 1;

    if (previewFrameWrap) {
      const availableWidth = Math.max(previewFrameWrap.clientWidth - 32, 1);
      const availableHeight = Math.max(previewFrameWrap.clientHeight - 32, 1);
      scale = Math.min(availableWidth / renderWidth, availableHeight / renderHeight, 1);
    }

    previewStage.style.setProperty("--device-width", String(preset.width));
    previewStage.style.setProperty("--device-height", String(preset.height));
    previewStage.style.setProperty("--device-render-width", String(renderWidth));
    previewStage.style.setProperty("--device-render-height", String(renderHeight));
    previewStage.style.setProperty("--device-scale", String(scale));
    previewStage.classList.toggle("preview-tablet", preset.family === "tablet");
    previewStage.classList.toggle("preview-landscape", isLandscape);

    if (devicePresetSelect) {
      devicePresetSelect.value = state.previewDevicePreset;
    }
    if (orientationPortraitButton) {
      orientationPortraitButton.classList.toggle("active", state.previewOrientation === "portrait");
    }
    if (orientationLandscapeButton) {
      orientationLandscapeButton.classList.toggle("active", state.previewOrientation === "landscape");
    }
  }

  const INJECT_MARKERS = {
    overrideBegin: "<!-- PLAYABLE_TOOL_OVERRIDE_BEGIN -->",
    overrideEnd: "<!-- PLAYABLE_TOOL_OVERRIDE_END -->",
    mraidBegin: "<!-- PLAYABLE_TOOL_MRAID_BEGIN -->",
    mraidEnd: "<!-- PLAYABLE_TOOL_MRAID_END -->"
  };

  function isBatchReplaceSupported() {
    return (
      state.parseMode === "superHtmlZip" ||
      state.parseMode === "superHtmlResMap" ||
      state.parseMode === "adapterZip"
    );
  }

  function updateBatchReplaceAvailability() {
    if (!batchImageInput) return;
    const hasImages = Object.keys(state.imageMap).length > 0;
    const supported = isBatchReplaceSupported();
    batchImageInput.disabled = !hasImages || !supported;

    if (!hasImages) {
      setBatchReplaceStatus("解析完成后可按文件名批量替换图片。");
      return;
    }
    if (!supported) {
      setBatchReplaceStatus("当前模式不支持按文件名批量替换，仅支持单张替换。", true);
      return;
    }
    setBatchReplaceStatus("支持批量替换：按文件名自动匹配资源。");
  }

  // 读取上传 HTML
  htmlFileInput.addEventListener("change", function () {
    const file = htmlFileInput.files[0];
    if (!file) {
      resetAllState();
      imageListDiv.innerHTML = '<div class="small">请先上传 playable HTML 文件。</div>';
      setParseStatus("");
      setBuildStatus("");
      setBatchReplaceStatus("请先上传并解析 playable HTML。");
      buildButton.disabled = true;
      updateDownloadAvailability();
      updateBatchReplaceAvailability();
      return;
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
      state.baseHtmlText = e.target.result;
      state.originalHtmlText = e.target.result;
      state.lastBuiltHtmlText = "";
      clearPreview();
      resetParsedState();
      buildButton.disabled = true;
      setBuildStatus("");
      setBatchReplaceStatus("文件已加载，正在自动解析资源...");
      imageListDiv.innerHTML = '<div class="small">文件已加载，正在自动解析图片资源，请稍候。</div>';
      setParseStatus("已加载 HTML 文件，正在自动解析...");
      updateBatchReplaceAvailability();
      try {
        await parseCurrentHtml();
      } catch (error) {
        console.error(error);
      }
    };
    reader.readAsText(file, "utf-8");
  });

  // ========== 通用工具 ==========
  const ZIP_VAR_CANDIDATES = [
    "__adapter_zip__",
    "__zip",
    "CC_ZIP",
    "__game_zip__",
    "ZIP",
    "ZIP_PNG",
    "__Z"
  ];

  function detectZipVariable(html) {
    for (let name of ZIP_VAR_CANDIDATES) {
      const re = new RegExp("window\\." + name);
      if (re.test(html)) return name;
    }
    return null;
  }

  function skipWhitespace(html, index) {
    let cursor = index;
    while (cursor < html.length && /\s/.test(html.charAt(cursor))) {
      cursor++;
    }
    return cursor;
  }

  function consumeJsStringLiteral(html, startIndex) {
    const quote = html.charAt(startIndex);
    if (quote !== '"' && quote !== "'") {
      return null;
    }

    let cursor = startIndex + 1;
    let value = "";

    while (cursor < html.length) {
      const ch = html.charAt(cursor);
      if (ch === "\\") {
        if (cursor + 1 >= html.length) {
          return null;
        }
        value += ch + html.charAt(cursor + 1);
        cursor += 2;
        continue;
      }
      if (ch === quote) {
        return {
          value: value,
          end: cursor + 1
        };
      }
      value += ch;
      cursor++;
    }

    return null;
  }

  function extractZipAssignment(htmlText) {
    const candidates = ZIP_VAR_CANDIDATES.slice(0);
    candidates.sort(function (a, b) {
      if (a === "__zip") return -1;
      if (b === "__zip") return 1;
      return 0;
    });

    let bestMatch = null;

    candidates.forEach(function (varName) {
      const token = "window." + varName;
      let searchIndex = 0;

      while (searchIndex < htmlText.length) {
        const start = htmlText.indexOf(token, searchIndex);
        if (start === -1) break;

        let cursor = skipWhitespace(htmlText, start + token.length);
        let operator = null;
        if (htmlText.slice(cursor, cursor + 2) === "+=") {
          operator = "+=";
          cursor += 2;
        } else if (htmlText.charAt(cursor) === "=") {
          operator = "=";
          cursor += 1;
        }

        if (!operator) {
          searchIndex = start + token.length;
          continue;
        }

        // 只从首个 "=" 开始拼接；单独出现的 "+=" 不视为完整入口
        if (operator !== "=") {
          searchIndex = start + token.length;
          continue;
        }

        cursor = skipWhitespace(htmlText, cursor);
        const literal = consumeJsStringLiteral(htmlText, cursor);
        if (!literal) {
          searchIndex = start + token.length;
          continue;
        }

        const segments = [literal.value];
        const segmentStart = start;
        let segmentEnd = literal.end;
        let assignType = "single";
        let nextSearchIndex = literal.end;

        while (nextSearchIndex < htmlText.length) {
          const nextStart = htmlText.indexOf(token, nextSearchIndex);
          if (nextStart === -1) break;

          let nextCursor = skipWhitespace(htmlText, nextStart + token.length);
          if (htmlText.slice(nextCursor, nextCursor + 2) !== "+=") {
            nextSearchIndex = nextStart + token.length;
            continue;
          }
          nextCursor += 2;
          nextCursor = skipWhitespace(htmlText, nextCursor);
          const nextLiteral = consumeJsStringLiteral(htmlText, nextCursor);
          if (!nextLiteral) {
            nextSearchIndex = nextStart + token.length;
            continue;
          }

          segments.push(nextLiteral.value);
          segmentEnd = nextLiteral.end;
          assignType = "concat";
          nextSearchIndex = nextLiteral.end;
        }

        const match = {
          varName: varName,
          fullBase64: segments.join(""),
          assignStart: segmentStart,
          assignEnd: segmentEnd,
          assignType: assignType
        };

        if (!bestMatch || match.fullBase64.length > bestMatch.fullBase64.length) {
          bestMatch = match;
        }

        searchIndex = segmentEnd;
      }
    });

    const scriptRe = /<script\b[^>]*\btype=(["'])text\/base64\1[^>]*>([\s\S]*?)<\/script>/gi;
    let scriptMatch;
    while ((scriptMatch = scriptRe.exec(htmlText)) !== null) {
      const fullMatch = scriptMatch[0];
      const rawContent = scriptMatch[2] || "";
      const fullBase64 = rawContent.replace(/\s+/g, "");
      if (!fullBase64) continue;

      const contentIndexInMatch = fullMatch.indexOf(rawContent);
      const contentStart = scriptMatch.index + contentIndexInMatch;
      const contentEnd = contentStart + rawContent.length;

      const match = {
        varName: null,
        fullBase64: fullBase64,
        assignStart: contentStart,
        assignEnd: contentEnd,
        assignType: "scriptTag",
        sourceLabel: "script[type=text/base64]"
      };

      if (!bestMatch || match.fullBase64.length > bestMatch.fullBase64.length) {
        bestMatch = match;
      }
    }

    if (bestMatch && !bestMatch.sourceLabel) {
      bestMatch.sourceLabel = bestMatch.varName ? ("window." + bestMatch.varName) : "zip";
    }

    return bestMatch;
  }

  function base64ToBytes(b64) {
    const pad = (4 - (b64.length % 4)) % 4;
    if (pad) b64 += "=".repeat(pad);
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function guessMimeFromPath(path) {
    const lower = path.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    return "image/png";
  }

  function guessExtFromDataUrl(dataUrl) {
    if (!/^data:image\//.test(dataUrl)) return "png";
    if (dataUrl.indexOf("image/png") >= 0) return "png";
    if (dataUrl.indexOf("image/jpeg") >= 0 || dataUrl.indexOf("image/jpg") >= 0) return "jpg";
    if (dataUrl.indexOf("image/webp") >= 0) return "webp";
    if (dataUrl.indexOf("image/gif") >= 0) return "gif";
    return "png";
  }

  function downloadDataUrlAsFile(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function insertBeforeBodyEnd(html, snippet) {
    if (!snippet) return html;
    const marker = "</body>";
    const idx = html.lastIndexOf(marker);
    if (idx === -1) {
      return html + "\n" + snippet + "\n";
    }
    return html.slice(0, idx) + "\n" + snippet + html.slice(idx);
  }

  function removeInjectedBlock(html, beginMarker, endMarker) {
    let result = html;
    while (true) {
      const start = result.indexOf(beginMarker);
      if (start === -1) break;
      const end = result.indexOf(endMarker, start + beginMarker.length);
      if (end === -1) {
        result = result.slice(0, start);
        break;
      }
      result = result.slice(0, start) + result.slice(end + endMarker.length);
    }
    return result.replace(/\n{3,}/g, "\n\n");
  }

  function removeOverrideBlocks(html) {
    return removeInjectedBlock(html, INJECT_MARKERS.overrideBegin, INJECT_MARKERS.overrideEnd);
  }

  function removeMraidBlocks(html) {
    return removeInjectedBlock(html, INJECT_MARKERS.mraidBegin, INJECT_MARKERS.mraidEnd);
  }

  function getFilenameFromResourceKey(key) {
    const normalized = key.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return parts[parts.length - 1] || normalized;
  }

  function isZipInlineImageKey(key) {
    return !!state.zipInlineImageMeta[key];
  }

  function getZipInlineImageMeta(key) {
    return state.zipInlineImageMeta[key] || null;
  }

  function buildZipInlineImageKey(zipPath, index, dataUrl) {
    const ext = guessExtFromDataUrl(dataUrl) || "png";
    return zipPath + "/__inline__/inline_" + String(index).padStart(3, "0") + "." + ext;
  }

  function isZipTextEntry(path) {
    return /\.(?:js|json|txt|atlas|plist|xml|css|html|htm|fnt|mjs|cjs)$/i.test(path);
  }

  function parseInlineImageMapFromText(text) {
    const items = [];
    const re = /data:image\/(png|jpeg|jpg|webp|gif)[^"')\s]*base64,[A-Za-z0-9+/=]+/gi;
    let match;
    while ((match = re.exec(text)) !== null) {
      items.push(match[0]);
    }
    return items;
  }

  function stripExtension(filename) {
    return filename.replace(/\.[^.]+$/, "");
  }

  function normalizeFilename(filename) {
    return filename.trim().toLowerCase();
  }

  function findBestImageMatch(filename, imageKeys) {
    const exactName = filename;
    const normalizedName = normalizeFilename(filename);
    const baseName = stripExtension(filename);
    const normalizedBaseName = normalizeFilename(baseName);

    for (let i = 0; i < imageKeys.length; i++) {
      const keyFilename = getFilenameFromResourceKey(imageKeys[i]);
      if (keyFilename === exactName) return imageKeys[i];
    }

    for (let i = 0; i < imageKeys.length; i++) {
      const keyFilename = getFilenameFromResourceKey(imageKeys[i]);
      if (stripExtension(keyFilename) === baseName) return imageKeys[i];
    }

    for (let i = 0; i < imageKeys.length; i++) {
      const keyFilename = getFilenameFromResourceKey(imageKeys[i]);
      if (normalizeFilename(keyFilename) === normalizedName) return imageKeys[i];
    }

    for (let i = 0; i < imageKeys.length; i++) {
      const keyFilename = getFilenameFromResourceKey(imageKeys[i]);
      if (normalizeFilename(stripExtension(keyFilename)) === normalizedBaseName) return imageKeys[i];
    }

    return null;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        resolve(e.target.result);
      };
      reader.onerror = function () {
        reject(reader.error || new Error("读取图片失败"));
      };
      reader.readAsDataURL(file);
    });
  }

  async function batchReplaceImages(files) {
    if (!isBatchReplaceSupported()) {
      setBatchReplaceStatus("当前模式不支持按文件名批量替换，仅支持单张替换。", true);
      return;
    }

    const imageKeys = Object.keys(state.imageMap);
    if (!imageKeys.length) {
      setBatchReplaceStatus("当前没有可替换的图片资源。", true);
      return;
    }

    const fileList = Array.from(files || []);
    if (!fileList.length) {
      setBatchReplaceStatus("请选择至少一张图片。", true);
      return;
    }

    setBatchReplaceStatus("正在批量匹配并读取图片...");

    const matchedFiles = [];
    const unmatchedFiles = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const matchedKey = findBestImageMatch(file.name, imageKeys);
      if (!matchedKey) {
        unmatchedFiles.push(file.name);
        continue;
      }
      matchedFiles.push({ file, key: matchedKey });
    }

    for (let i = 0; i < matchedFiles.length; i++) {
      const item = matchedFiles[i];
      state.overrideMap[item.key] = await readFileAsDataUrl(item.file);
    }

    renderImageList();

    let message = "已匹配替换：" + matchedFiles.length + "，未匹配：" + unmatchedFiles.length + "。";
    if (unmatchedFiles.length) {
      message += " 未匹配文件：" + unmatchedFiles.slice(0, 5).join("、");
      if (unmatchedFiles.length > 5) {
        message += " 等 " + unmatchedFiles.length + " 个";
      }
    }
    setBatchReplaceStatus(message, unmatchedFiles.length > 0 && matchedFiles.length === 0);
  }

  // ========== 解析 1：adapterZip（zlib + JSON） ==========
  function parseAdapterZipResourceMapFromBytes(bytes) {
    if (!window.pako || !window.pako.inflate) {
      throw new Error("pako.inflate 不可用，请确认 pako_inflate.min.js 已正确加载。");
    }
    let text;
    try {
      text = window.pako.inflate(bytes, { to: "string" });
    } catch (e) {
      throw new Error("尝试按 zlib+JSON 解压失败（pako.inflate 出错）。");
    }

    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      throw new Error("zlib 解压成功，但 JSON.parse 失败，可能不是 adapterZip 结构。");
    }

    if (obj && typeof obj === "object") {
      if (obj.files && typeof obj.files === "object") {
        return obj.files;
      }
    }
    return obj;
  }

  // ========== 解析 2：super-html ZIP（window.__zip = "UEsDB..."） ==========
  async function parseSuperHtmlZip(base64Zip) {
    if (!window.JSZip) {
      throw new Error("JSZip 未加载，请确认 jszip.min.js 已正确引入。");
    }

    const bytes = base64ToBytes(base64Zip);
    const zip = await JSZip.loadAsync(bytes);

    const map = {};
    const allEntries = [];
    const tasks = [];
    const inlineImageMeta = {};

    zip.forEach((relPath, file) => {
      allEntries.push(relPath);
      if (/\.(png|jpg|jpeg|webp|gif)$/i.test(relPath)) {
        const mime = guessMimeFromPath(relPath);
        const p = file.async("base64").then((b64) => {
          map[relPath] = "data:" + mime + ";base64," + b64;
        });
        tasks.push(p);
        return;
      }
      if (!isZipTextEntry(relPath)) return;
      const p = file.async("string").then((text) => {
        const inlineImages = parseInlineImageMapFromText(text);
        inlineImages.forEach((dataUrl, index) => {
          const key = buildZipInlineImageKey(relPath, index + 1, dataUrl);
          if (map[key]) return;
          map[key] = dataUrl;
          inlineImageMeta[key] = {
            zipPath: relPath,
            originalDataUrl: dataUrl,
            displayName: relPath + " [内嵌图 #" + (index + 1) + "]"
          };
        });
      });
      tasks.push(p);
    });

    await Promise.all(tasks);
    return {
      imageMap: map,
      allEntries: allEntries,
      zipMeta: {
        zipBase64: base64Zip,
        zipSourceBytes: bytes.slice(0),
        zipObject: zip,
        inlineImageMeta: inlineImageMeta
      }
    };
  }

  async function rebuildSuperHtmlZip(zipObject, overrideMap, inlineImageMeta) {
    if (!zipObject) {
      throw new Error("缺少 zipObject，无法重打包 superHtmlZip。");
    }

    const entries = Object.entries(overrideMap || {});
    const textEntryReplacements = {};
    entries.forEach(function (entry) {
      const path = entry[0];
      const dataUrl = entry[1];
      const inlineMeta = inlineImageMeta && inlineImageMeta[path];
      if (inlineMeta) {
        if (!textEntryReplacements[inlineMeta.zipPath]) {
          textEntryReplacements[inlineMeta.zipPath] = [];
        }
        textEntryReplacements[inlineMeta.zipPath].push({
          originalDataUrl: inlineMeta.originalDataUrl,
          newDataUrl: dataUrl
        });
        return;
      }
      const base64 = (dataUrl.split(",")[1] || "").trim();
      zipObject.file(path, base64, { base64: true });
    });

    const textPaths = Object.keys(textEntryReplacements);
    for (let i = 0; i < textPaths.length; i++) {
      const zipPath = textPaths[i];
      const file = zipObject.file(zipPath);
      if (!file) continue;
      let text = await file.async("string");
      textEntryReplacements[zipPath].forEach(function (item) {
        if (!item.originalDataUrl || !item.newDataUrl) return;
        text = text.split(item.originalDataUrl).join(item.newDataUrl);
      });
      zipObject.file(zipPath, text);
    }

    const newBytes = await zipObject.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 9 }
    });
    return bytesToBase64(newBytes);
  }

  function parseStaticResImageMapFromHtml(html) {
    const imageMap = {};
    const pathToOriginal = {};
    const re = /"((?:assets|cocos-js|src)\/[^"\n\r]+\.(?:png|jpg|jpeg|webp|gif))":"(data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+)"/gi;
    let match;

    while ((match = re.exec(html)) !== null) {
      const resPath = match[1];
      const dataUrl = match[2];
      if (!imageMap[resPath]) {
        imageMap[resPath] = dataUrl;
        pathToOriginal[resPath] = dataUrl;
      }
    }

    return {
      imageMap: imageMap,
      pathToOriginal: pathToOriginal
    };
  }

  // ========== 解析 3：inline data:image ==========
  function parseInlineImageMap(html) {
    const map = {};
    const re = /data:image\/(png|jpeg|jpg|webp|gif)[^"')]*base64,[A-Za-z0-9+/=]+/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const full = m[0];
      if (!map[full]) {
        map[full] = full;
      }
    }
    return map;
  }

  // ========== UI：渲染图片列表（含下载按钮） ==========
  function renderImageList() {
    imageListDiv.innerHTML = "";

    const keys = Object.keys(state.imageMap);
    if (!keys.length) {
      imageListDiv.innerHTML = '<div class="small">未找到任何可替换的 PNG/JPG 资源。</div>';
      updateBatchReplaceAvailability();
      return;
    }

    let inlineIndex = 0;
    let globalIndex = 0;
    const fragment = document.createDocumentFragment();

    keys.forEach((key) => {
      globalIndex++;
      const itemDiv = document.createElement("div");
      itemDiv.className = "image-item";

      const imgOld = document.createElement("img");
      imgOld.src = state.imageMap[key];
      imgOld.title = "原始";

      const imgNew = document.createElement("img");
      imgNew.src = state.overrideMap[key] || "";
      imgNew.title = "替换后（如有）";
      if (!state.overrideMap[key]) {
        imgNew.style.display = "none";
      } else {
        itemDiv.classList.add("has-replacement");
      }

      const infoDiv = document.createElement("div");
      infoDiv.className = "image-info";

      let label = key;
      if (isZipInlineImageKey(key)) {
        const inlineMeta = getZipInlineImageMeta(key);
        label = inlineMeta && inlineMeta.displayName ? inlineMeta.displayName : getFilenameFromResourceKey(key);
      } else if (/^data:image\//.test(key)) {
        inlineIndex++;
        label = "[内联图 #" + inlineIndex + "]";
      }

      infoDiv.innerHTML =
        '<span class="tag tag-old">原图</span>' +
        (state.overrideMap[key] ? '<span class="tag tag-new">已替换</span>' : "") +
        "<div>" + label + "</div>";

      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp,image/gif";
      input.addEventListener("change", function () {
        const file = input.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = function (e) {
          const dataUrl = e.target.result;
          state.overrideMap[key] = dataUrl;
          imgNew.src = dataUrl;
          imgNew.style.display = "block";
          renderImageList();
        };
        r.readAsDataURL(file);
      });

      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn";
      downloadBtn.textContent = "下载原图";
      downloadBtn.addEventListener("click", function () {
        const dataUrl = state.imageMap[key];
        const ext = guessExtFromDataUrl(dataUrl);
        let baseName;
        if (isZipInlineImageKey(key)) {
          baseName = getFilenameFromResourceKey(key);
        } else if (/^data:image\//.test(key)) {
          baseName = "inline_" + String(globalIndex).padStart(3, "0");
        } else {
          const parts = key.split("/");
          baseName = parts[parts.length - 1] || "image_" + String(globalIndex).padStart(3, "0");
        }
        const filename = baseName.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
        downloadDataUrlAsFile(dataUrl, filename);
      });

      const actionDiv = document.createElement("div");
      actionDiv.className = "image-actions";
      actionDiv.appendChild(input);
      actionDiv.appendChild(downloadBtn);

      itemDiv.appendChild(imgOld);
      itemDiv.appendChild(imgNew);
      itemDiv.appendChild(infoDiv);
      itemDiv.appendChild(actionDiv);

      fragment.appendChild(itemDiv);
    });

    imageListDiv.appendChild(fragment);
    updateBatchReplaceAvailability();
  }

  async function parseCurrentHtml() {
    if (!state.originalHtmlText) {
      setParseStatus("请先选择 HTML 文件。");
      return false;
    }
    setParseStatus("正在解析 playable 资源，请稍候...");
    resetParsedState();
    state.lastBuiltHtmlText = "";
    clearPreview();
    buildButton.disabled = true;
    setBuildStatus("");
    setBatchReplaceStatus("正在分析资源模式...");

    try {
      // 1) 优先尝试 zip 变量（__zip / __adapter_zip__ 等）
      const info = extractZipAssignment(state.originalHtmlText);
      if (info) {
        const varName = info.varName;
        state.zipVarName = varName;
        state.zipSourceLabel = info.sourceLabel || (varName ? ("window." + varName) : "zip");
        state.zipAssignStart = info.assignStart;
        state.zipAssignEnd = info.assignEnd;
        state.zipAssignType = info.assignType;
        state.zipBase64 = info.fullBase64;

        const bytes = base64ToBytes(info.fullBase64);

        if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
          // PK 开头 → super-html ZIP 包
          const zipInfo = await parseSuperHtmlZip(info.fullBase64);
          const count = Object.keys(zipInfo.imageMap).length;
          state.zipSourceBytes = zipInfo.zipMeta.zipSourceBytes;
          state.zipJszip = zipInfo.zipMeta.zipObject;
          state.zipAllEntries = zipInfo.allEntries.slice(0);
          state.zipInlineImageMeta = zipInfo.zipMeta.inlineImageMeta || {};

          if (count) {
            state.parseMode = "superHtmlZip";
            state.imageMap = zipInfo.imageMap;
            setParseStatus(
              "解析完成（superHtmlZip：" + state.zipSourceLabel + "，" + info.assignType + "），找到 " +
              count + " 张图片。"
            );
            renderImageList();
            buildButton.disabled = false;
            return true;
          }

          const resInfo = parseStaticResImageMapFromHtml(state.originalHtmlText);
          const resCount = Object.keys(resInfo.imageMap).length;
          if (resCount) {
            state.parseMode = "superHtmlResMap";
            state.imageMap = resInfo.imageMap;
            setParseStatus(
              "解析完成（superHtmlResMap：" + state.zipSourceLabel + "），从 window.__res 找到 " +
              resCount + " 张图片。"
            );
          } else {
            state.parseMode = "superHtmlZip";
            state.imageMap = zipInfo.imageMap;
            setParseStatus("解析 superHtmlZip 成功，但 zip 和 window.__res 中都没有可替换图片。");
          }
          renderImageList();
          buildButton.disabled = false;
          return true;
        } else {
          // 非 PK → 尝试 adapterZip JSON
          let resMapJSON = null;
          try {
            resMapJSON = parseAdapterZipResourceMapFromBytes(bytes);
          } catch (e) {
            console.warn("adapterZip 解析失败，尝试 inline data:image：", e);
          }
          if (resMapJSON && typeof resMapJSON === "object") {
            state.parseMode = "adapterZip";
            state.zipSourceBytes = bytes.slice(0);
            let count = 0;
            for (const [resPath, content] of Object.entries(resMapJSON)) {
              if (!/\.(png|jpg|jpeg|webp|gif)$/i.test(resPath)) continue;
              const m = /^data:.*?;base64,.+$/s.exec(content);
              if (!m) continue;
              state.imageMap[resPath] = content;
              count++;
            }
            setParseStatus("解析完成（adapterZip：" + varName + "），找到 " + count + " 张图片。");
            renderImageList();
            buildButton.disabled = false;
            return true;
          }
        }
      }

      // 2) 如果不是 zip / adapterZip，就尝试 inline data:image playable
      const inlineMap = parseInlineImageMap(state.originalHtmlText);
      const inlineKeys = Object.keys(inlineMap);
      if (inlineKeys.length) {
        state.parseMode = "inline";
        state.imageMap = inlineMap;
        setParseStatus("解析完成（内联 data:image 模式），找到 " + inlineKeys.length + " 张图片。");
        renderImageList();
        buildButton.disabled = false;
        return true;
      }

      // 3) 都不是
      throw new Error("未检测到可解析的 __zip / __adapter_zip__ 或内联 data:image 图片资源。");

    } catch (e) {
      console.error(e);
      setParseStatus("解析失败：" + (e && e.message ? e.message : String(e)));
      imageListDiv.innerHTML = '<div class="small">解析失败，请检查控制台错误信息。</div>';
      updateBatchReplaceAvailability();
      // 仍允许只注入跳转
      buildButton.disabled = false;
      return false;
    }
  }

  // ========== 构造 adapterZip override 脚本 ==========
  function buildAdapterOverrideScript() {
    if (state.parseMode !== "adapterZip") return "";
    const entries = Object.entries(state.overrideMap);
    if (!entries.length) return "";

    const lines = [];
    lines.push("window.__adapter_override__ = window.__adapter_override__ || {};");

    entries.forEach(([key, dataUrl]) => {
      const safeKey = key.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const safeData = dataUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      lines.push('window.__adapter_override__["' + safeKey + '"] = "' + safeData + '";');
    });

    lines.push("(function(){");
    lines.push("  function applyOverrides(){");
    lines.push("    if (!window.__adapter_resource__ || !window.__adapter_override__) return false;");
    lines.push("    for (var k in window.__adapter_override__) {");
    lines.push("      if (Object.prototype.hasOwnProperty.call(window.__adapter_override__, k)) {");
    lines.push("        window.__adapter_resource__[k] = window.__adapter_override__[k];");
    lines.push("      }");
    lines.push("    }");
    lines.push("    return true;");
    lines.push("  }");
    lines.push("  if (!applyOverrides()) {");
    lines.push("    var iv = setInterval(function(){");
    lines.push("      if (applyOverrides()) clearInterval(iv);");
    lines.push("    }, 50);");
    lines.push("  }");
    lines.push("})();");
    return [
      INJECT_MARKERS.overrideBegin,
      "<script>",
      lines.join("\n"),
      "</script>",
      INJECT_MARKERS.overrideEnd,
      ""
    ].join("\n");
  }

  // ========== 构造 mraid 跳转脚本 ==========
  function buildMraidScript(appleStoreUrl, googlePlayUrl) {
    const safeAppleUrl = (appleStoreUrl || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const safeGoogleUrl = (googlePlayUrl || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const aliases = [
      "download",
      "openStore",
      "clickDownload",
      "goApp",
      "jump",
      "clickJump",
      "nativeOpen",
      "onPay",
      "gotoStore"
    ];
    const lines = [];
    lines.push("(function(){");
    lines.push('  const APPLE_STORE_URL = "' + safeAppleUrl + '";');
    lines.push('  const GOOGLE_PLAY_URL = "' + safeGoogleUrl + '";');
    lines.push("  function getStoreUrl(){");
    lines.push("    var ua = (navigator.userAgent || '').toLowerCase();");
    lines.push("    if (/android/.test(ua) && GOOGLE_PLAY_URL) return GOOGLE_PLAY_URL;");
    lines.push("    if (/(iphone|ipad|ipod|ios)/.test(ua) && APPLE_STORE_URL) return APPLE_STORE_URL;");
    lines.push("    return APPLE_STORE_URL || GOOGLE_PLAY_URL || '';");
    lines.push("  }");
    lines.push("  function openStore(){");
    lines.push("    try {");
    lines.push("      var targetUrl = getStoreUrl();");
    lines.push("      if (!targetUrl) return;");
    lines.push("      if (window.mraid && typeof mraid.open === 'function') {");
    lines.push("        mraid.open(targetUrl);");
    lines.push("      } else {");
    lines.push("        window.open(targetUrl, '_blank');");
    lines.push("      }");
    lines.push("    } catch (err) {");
    lines.push("      var targetUrl = getStoreUrl();");
    lines.push("      if (targetUrl) window.open(targetUrl, '_blank');");
    lines.push("    }");
    lines.push("  }");
    lines.push("  window.super_html = window.super_html || {};");
    lines.push("  window.super_html.download = openStore;");
    aliases.forEach((name) => {
      lines.push("  window['" + name + "'] = openStore;");
    });
    lines.push("})();");
    return [
      INJECT_MARKERS.mraidBegin,
      "<script>",
      lines.join("\n"),
      "</script>",
      INJECT_MARKERS.mraidEnd,
      ""
    ].join("\n");
  }

  // ========== 直接改 HTML 里原始跳转链接 ==========
  function rewriteStoreUrlInHtml(html, appleStoreUrl, googlePlayUrl) {
    const primaryStoreUrl = appleStoreUrl || googlePlayUrl || "";
    if (!primaryStoreUrl && !appleStoreUrl && !googlePlayUrl) return html;
    let result = html;

    // 1) 先改 mraid.open("xxx") 这种直接调用
    if (primaryStoreUrl) {
      result = result.replace(
        /mraid\.open\((["'])(https?:\/\/[^"']+)\1\)/g,
        function (match, quote) {
          return 'mraid.open(' + quote + primaryStoreUrl + quote + ')';
        }
      );
    }

    // 2) 常见变量形式：STORE_URL / storeUrl / clickTag / window.location.href
    const varPatterns = [
      /(STORE_URL\s*=\s*)(["'])(https?:\/\/[^"']+)\2/g,
      /(storeUrl\s*=\s*)(["'])(https?:\/\/[^"']+)\2/g,
      /(clickTag\s*=\s*)(["'])(https?:\/\/[^"']+)\2/g,
      /(window\.location\.href\s*=\s*)(["'])(https?:\/\/[^"']+)\2/g,
    ];

    if (primaryStoreUrl) {
      varPatterns.forEach(function (p) {
        result = result.replace(p, function (match, prefix, quote) {
          return prefix + quote + primaryStoreUrl + quote;
        });
      });
    }

    // 3) 兜底：按商店域名分别替换
    if (appleStoreUrl) {
      const appleStoreRe = /https?:\/\/(?:itunes\.apple\.com|apps\.apple\.com)\/[^\s"'<>]+/g;
      result = result.replace(appleStoreRe, function () {
        return appleStoreUrl;
      });
    }

    if (googlePlayUrl) {
      const googlePlayRe = /https?:\/\/play\.google\.com\/store\/apps\/[^\s"'<>]+/g;
      result = result.replace(googlePlayRe, function () {
        return googlePlayUrl;
      });
    }

    return result;
  }


  // ========== 触发浏览器下载 HTML ==========
  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  batchImageInput.addEventListener("change", async function () {
    const files = batchImageInput.files;
    if (!files || !files.length) return;

    try {
      await batchReplaceImages(files);
    } catch (e) {
      console.error(e);
      setBatchReplaceStatus("批量替换失败：" + (e && e.message ? e.message : String(e)), true);
    } finally {
      batchImageInput.value = "";
    }
  });

  if (downloadButton) {
    downloadButton.addEventListener("click", downloadLastBuiltHtml);
  }

  if (downloadPreviewButton) {
    downloadPreviewButton.addEventListener("click", downloadLastBuiltHtml);
  }

  if (refreshPreviewButton) {
    refreshPreviewButton.addEventListener("click", function () {
      if (!state.lastBuiltHtmlText) {
        setBuildStatus("请先生成预览。");
        return;
      }
      showPreviewFromHtml(state.lastBuiltHtmlText);
      setBuildStatus("已刷新预览。");
    });
  }

  if (devicePresetSelect) {
    devicePresetSelect.addEventListener("change", function () {
      state.previewDevicePreset = devicePresetSelect.value;
      applyPreviewMode();
    });
  }

  if (orientationPortraitButton) {
    orientationPortraitButton.addEventListener("click", function () {
      state.previewOrientation = "portrait";
      applyPreviewMode();
    });
  }

  if (orientationLandscapeButton) {
    orientationLandscapeButton.addEventListener("click", function () {
      state.previewOrientation = "landscape";
      applyPreviewMode();
    });
  }

  window.addEventListener("resize", applyPreviewMode);

  // ========== 生成 playable_modified.html ==========
  buildButton.addEventListener("click", async function () {
    if (!state.baseHtmlText) {
      setBuildStatus("请先选择并解析 HTML。");
      return;
    }
    const appleStoreUrl = appleStoreUrlInput ? appleStoreUrlInput.value.trim() : "";
    const googlePlayUrl = googlePlayUrlInput ? googlePlayUrlInput.value.trim() : "";
    if (!appleStoreUrl && !googlePlayUrl) {
      setBuildStatus("请至少填写一个商店链接（App Store 或 Google Play）。");
      return;
    }

    setBuildStatus("正在生成新的 playable HTML...");
    state.lastBuiltHtmlText = "";
    clearPreview();

    let newHtml = state.baseHtmlText;

    try {
      // 1) 按不同模式替换图片
      if (state.parseMode === "superHtmlZip" && state.zipAssignStart != null && state.zipAssignEnd != null && state.zipSourceBytes) {
        const zip = await JSZip.loadAsync(state.zipSourceBytes.slice(0));
        const newB64 = await rebuildSuperHtmlZip(zip, state.overrideMap, state.zipInlineImageMeta);
        const newAssign = state.zipAssignType === "scriptTag"
          ? newB64
          : ('window.' + state.zipVarName + ' = "' + newB64 + '";');

        newHtml =
          state.baseHtmlText.slice(0, state.zipAssignStart) +
          newAssign +
          state.baseHtmlText.slice(state.zipAssignEnd);
      } else if (state.parseMode === "superHtmlResMap") {
        const entries = Object.entries(state.overrideMap);
        if (entries.length) {
          entries.forEach(function (entry) {
            const path = entry[0];
            const newDataUrl = entry[1];
            const oldDataUrl = state.imageMap[path];
            if (!oldDataUrl || !newDataUrl) return;
            newHtml = newHtml.split(oldDataUrl).join(newDataUrl);
          });
        }
      } else if (state.parseMode === "inline") {
        // inline data:image：直接替换 HTML 里的 dataURL
        const entries = Object.entries(state.overrideMap);
        if (entries.length) {
          entries.forEach(([origDataUrl, newDataUrl]) => {
            if (!origDataUrl || !newDataUrl) return;
            newHtml = newHtml.split(origDataUrl).join(newDataUrl);
          });
        }
      } else if (state.parseMode === "adapterZip") {
        // adapterZip 的图片替换是在运行时通过 overrideScript 实现，不改 zip 数据本身
        // 此处不修改 newHtml 的 zip 部分
      }

      // 2) 无论哪种模式，都先在 HTML 里强制改跳转链接
      newHtml = rewriteStoreUrlInHtml(newHtml, appleStoreUrl, googlePlayUrl);

      // 3) 先清理历史注入块，避免连续调试时重复堆叠
      newHtml = removeOverrideBlocks(newHtml);
      newHtml = removeMraidBlocks(newHtml);

      // 4) 如果是 adapterZip，再注入 overrideScript
      if (state.parseMode === "adapterZip") {
        const overrideScript = buildAdapterOverrideScript();
        newHtml = insertBeforeBodyEnd(newHtml, overrideScript);
      }

      // 5) 最后统一注入 mraid 脚本兜底
      const mraidScript = buildMraidScript(appleStoreUrl, googlePlayUrl);
      newHtml = insertBeforeBodyEnd(newHtml, mraidScript);

      // 6) 更新预览与下载状态
      state.lastBuiltHtmlText = newHtml;
      showPreviewFromHtml(newHtml);
      setBuildStatus("已生成并更新预览，可继续下载 HTML。");

    } catch (e) {
      console.error(e);
      setBuildStatus("生成失败：" + (e && e.message ? e.message : String(e)));
    }
  });

  setBatchReplaceStatus("请先上传并解析 playable HTML。");
  applyPreviewMode();
  updateDownloadAvailability();

})();
