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
  let originalHtmlText = "";

  // 解析结果
  let imageMap = {};      // key -> dataURL（或原始 data:image 串），key 为资源路径或原始 dataURL
  let overrideMap = {};   // key -> 新 dataURL
  let parseMode = null;   // 'zipPk' | 'adapterZip' | 'inline' | null

  // ZIP 相关状态
  let zipVarName = null;      // "__zip" / "__adapter_zip__" / ...
  let zipAssignStart = null;  // HTML 中 zip 赋值段起始 index
  let zipAssignEnd = null;    // HTML 中 zip 赋值段结束 index
  let zipJszip = null;        // JSZip 实例（仅 zipPk 模式）

  const htmlFileInput = document.getElementById("htmlFileInput");
  const parseButton = document.getElementById("parseButton");
  const parseStatus = document.getElementById("parseStatus");
  const imageListDiv = document.getElementById("imageList");
  const buildButton = document.getElementById("buildButton");
  const buildStatus = document.getElementById("buildStatus");
  const storeUrlInput = document.getElementById("storeUrlInput");

  function setParseStatus(msg) { parseStatus.textContent = msg || ""; }
  function setBuildStatus(msg) { buildStatus.textContent = msg || ""; }

  // 读取上传 HTML
  htmlFileInput.addEventListener("change", function () {
    const file = htmlFileInput.files[0];
    if (!file) {
      originalHtmlText = "";
      parseButton.disabled = true;
      imageMap = {};
      overrideMap = {};
      parseMode = null;
      zipVarName = null;
      zipAssignStart = zipAssignEnd = null;
      zipJszip = null;
      imageListDiv.innerHTML = '<div class="small">请先上传 playable HTML 文件。</div>';
      setParseStatus("");
      setBuildStatus("");
      buildButton.disabled = true;
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      originalHtmlText = e.target.result;
      parseButton.disabled = false;
      imageMap = {};
      overrideMap = {};
      parseMode = null;
      zipVarName = null;
      zipAssignStart = zipAssignEnd = null;
      zipJszip = null;
      buildButton.disabled = true;
      setBuildStatus("");
      imageListDiv.innerHTML = '<div class="small">文件已加载，点击“解析 HTML / 提取图片列表”。</div>';
      setParseStatus("已加载 HTML 文件。");
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

  // 提取 zip 赋值段：支持 = / +=，单双引号，多段拼接
  function extractZipStringWithRange(html, zipVarName) {
    const re = new RegExp(
      "window\\." + zipVarName + "\\s*(?:=|\\+=)\\s*([\"'])(.*?)\\1",
      "gs"
    );
    let match;
    const collected = [];
    let firstIndex = null;
    let lastEnd = null;

    while ((match = re.exec(html)) !== null) {
      if (firstIndex === null) firstIndex = match.index;
      lastEnd = re.lastIndex;
      collected.push(match[2]);
    }

    if (!collected.length) {
      return null;
    }

    return {
      base64: collected.join(""),
      start: firstIndex,
      end: lastEnd
    };
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

  // ========== 解析 2：ZIP PK（window.__zip = "UEsDB..."） ==========
  async function parseZipPkResourceMapFromBytes(bytes) {
    if (!window.JSZip) {
      throw new Error("JSZip 未加载，请确认 jszip.min.js 已正确引入。");
    }
    const zip = await JSZip.loadAsync(bytes);
    zipJszip = zip;

    const map = {};
    const tasks = [];

    zip.forEach((relPath, file) => {
      if (!/\.(png|jpg|jpeg|webp|gif)$/i.test(relPath)) return;
      const mime = guessMimeFromPath(relPath);
      const p = file.async("base64").then((b64) => {
        map[relPath] = "data:" + mime + ";base64," + b64;
      });
      tasks.push(p);
    });

    await Promise.all(tasks);
    return map;
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

    const keys = Object.keys(imageMap);
    if (!keys.length) {
      imageListDiv.innerHTML = '<div class="small">未找到任何可替换的 PNG/JPG 资源。</div>';
      return;
    }

    let inlineIndex = 0;
    let globalIndex = 0;

    keys.forEach((key) => {
      globalIndex++;
      const itemDiv = document.createElement("div");
      itemDiv.className = "image-item";

      const imgOld = document.createElement("img");
      imgOld.src = imageMap[key];
      imgOld.title = "原始";

      const imgNew = document.createElement("img");
      imgNew.src = overrideMap[key] || "";
      imgNew.title = "替换后（如有）";

      const infoDiv = document.createElement("div");
      infoDiv.className = "image-info";

      let label = key;
      if (/^data:image\//.test(key)) {
        inlineIndex++;
        label = "[内联图 #" + inlineIndex + "]";
      }

      infoDiv.innerHTML =
        '<span class="tag tag-old">原图</span>' +
        (overrideMap[key] ? '<span class="tag tag-new">已替换</span>' : "") +
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
          overrideMap[key] = dataUrl;
          imgNew.src = dataUrl;
          renderImageList();
        };
        r.readAsDataURL(file);
      });

      const downloadBtn = document.createElement("button");
      downloadBtn.textContent = "下载原图";
      downloadBtn.addEventListener("click", function () {
        const dataUrl = imageMap[key];
        const ext = guessExtFromDataUrl(dataUrl);
        let baseName;
        if (/^data:image\//.test(key)) {
          baseName = "inline_" + String(globalIndex).padStart(3, "0");
        } else {
          const parts = key.split("/");
          baseName = parts[parts.length - 1] || "image_" + String(globalIndex).padStart(3, "0");
        }
        const filename = baseName.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
        downloadDataUrlAsFile(dataUrl, filename);
      });

      itemDiv.appendChild(imgOld);
      itemDiv.appendChild(imgNew);
      itemDiv.appendChild(infoDiv);
      itemDiv.appendChild(input);
      itemDiv.appendChild(downloadBtn);

      imageListDiv.appendChild(itemDiv);
    });
  }

  // ========== 解析入口：点击“解析 HTML / 提取图片列表” ==========
  parseButton.addEventListener("click", async function () {
    if (!originalHtmlText) {
      setParseStatus("请先选择 HTML 文件。");
      return;
    }
    setParseStatus("正在解析 playable 资源，请稍候...");
    imageMap = {};
    overrideMap = {};
    parseMode = null;
    zipVarName = null;
    zipAssignStart = zipAssignEnd = null;
    zipJszip = null;
    buildButton.disabled = true;
    setBuildStatus("");

    try {
      // 1) 优先尝试 zip 变量（__zip / __adapter_zip__ 等）
      let varName = detectZipVariable(originalHtmlText);
      if (varName) {
        const info = extractZipStringWithRange(originalHtmlText, varName);
        if (!info) {
          throw new Error("检测到 " + varName + "，但没有字符串赋值内容。");
        }
        zipVarName = varName;
        zipAssignStart = info.start;
        zipAssignEnd = info.end;

        const bytes = base64ToBytes(info.base64);

        if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
          // PK 开头 → ZIP 包
          parseMode = "zipPk";
          const resMap = await parseZipPkResourceMapFromBytes(bytes);
          const count = Object.keys(resMap).length;
          if (!count) {
            setParseStatus("解析为 ZIP 包成功，但其中没有 PNG/JPG 资源。");
          } else {
            imageMap = resMap;
            setParseStatus("解析完成（ZIP 包：" + varName + "），找到 " + count + " 张图片。");
            renderImageList();
          }
          buildButton.disabled = false;
          return;
        } else {
          // 非 PK → 尝试 adapterZip JSON
          let resMapJSON = null;
          try {
            resMapJSON = parseAdapterZipResourceMapFromBytes(bytes);
          } catch (e) {
            console.warn("adapterZip 解析失败，尝试 inline data:image：", e);
          }
          if (resMapJSON && typeof resMapJSON === "object") {
            parseMode = "adapterZip";
            let count = 0;
            for (const [resPath, content] of Object.entries(resMapJSON)) {
              if (!/\.(png|jpg|jpeg|webp|gif)$/i.test(resPath)) continue;
              const m = /^data:.*?;base64,.+$/s.exec(content);
              if (!m) continue;
              imageMap[resPath] = content;
              count++;
            }
            setParseStatus("解析完成（adapterZip：" + varName + "），找到 " + count + " 张图片。");
            renderImageList();
            buildButton.disabled = false;
            return;
          }
        }
      }

      // 2) 如果不是 zip / adapterZip，就尝试 inline data:image playable
      const inlineMap = parseInlineImageMap(originalHtmlText);
      const inlineKeys = Object.keys(inlineMap);
      if (inlineKeys.length) {
        parseMode = "inline";
        imageMap = inlineMap;
        setParseStatus("解析完成（内联 data:image 模式），找到 " + inlineKeys.length + " 张图片。");
        renderImageList();
        buildButton.disabled = false;
        return;
      }

      // 3) 都不是
      throw new Error("未检测到 __zip / __adapter_zip__ 或内联 data:image 图片资源。");

    } catch (e) {
      console.error(e);
      setParseStatus("解析失败：" + (e && e.message ? e.message : String(e)));
      imageListDiv.innerHTML = '<div class="small">解析失败，请检查控制台错误信息。</div>';
      // 仍允许只注入跳转
      buildButton.disabled = false;
    }
  });

  // ========== 构造 adapterZip override 脚本 ==========
  function buildAdapterOverrideScript() {
    if (parseMode !== "adapterZip") return "";
    const entries = Object.entries(overrideMap);
    if (!entries.length) return "";

    const lines = [];
    lines.push("/* === OVERRIDE RESOURCES BEGIN (UI Tool) === */");
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
    lines.push("/* === OVERRIDE RESOURCES END (UI Tool) === */");

    return "<script>\n" + lines.join("\n") + "\n</script>\n";
  }

  // ========== 构造 mraid 跳转脚本 ==========
  function buildMraidScript(storeUrl) {
    const safeUrl = storeUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
    lines.push('  const STORE_URL = "' + safeUrl + '";');
    lines.push("  function openStore(){");
    lines.push("    try {");
    lines.push("      if (window.mraid && typeof mraid.open === 'function') {");
    lines.push("        mraid.open(STORE_URL);");
    lines.push("      } else {");
    lines.push("        window.open(STORE_URL, '_blank');");
    lines.push("      }");
    lines.push("    } catch (err) {");
    lines.push("      window.open(STORE_URL, '_blank');");
    lines.push("    }");
    lines.push("  }");
    lines.push("  window.super_html = window.super_html || {};");
    lines.push("  window.super_html.download = openStore;");
    aliases.forEach((name) => {
      lines.push("  window['" + name + "'] = openStore;");
    });
    lines.push("})();");
    return "<script>\n" + lines.join("\n") + "\n</script>\n";
  }

  // ========== 直接改 HTML 里原始跳转链接 ==========
  function rewriteStoreUrlInHtml(html, storeUrl) {
    if (!storeUrl) return html;
    let result = html;

    // 1) 先改 mraid.open("xxx") 这种直接调用
    result = result.replace(
      /mraid\.open\((["'])(https?:\/\/[^"']+)\1\)/g,
      function (match, quote, oldUrl) {
        return 'mraid.open(' + quote + storeUrl + quote + ')';
      }
    );

    // 2) 常见变量形式：STORE_URL / storeUrl / clickTag / window.location.href
    const varPatterns = [
      /(STORE_URL\s*=\s*)(["'])(https?:\/\/[^"']+)\2/g,
      /(storeUrl\s*=\s*)(["'])(https?:\/\/[^"']+)\2/g,
      /(clickTag\s*=\s*)(["'])(https?:\/\/[^"']+)\2/g,
      /(window\.location\.href\s*=\s*)(["'])(https?:\/\/[^"']+)\2/g,
    ];

    varPatterns.forEach(function (p) {
      result = result.replace(p, function (match, prefix, quote, oldUrl) {
        return prefix + quote + storeUrl + quote;
      });
    });

    // 3) 兜底：凡是 App Store 链接（itunes.apple.com / apps.apple.com），全部替换成新的
    const appStoreRe =
      /https?:\/\/(?:itunes\.apple\.com|apps\.apple\.com)\/[^\s"'<>]+/g;

    result = result.replace(appStoreRe, function () {
      return storeUrl;
    });

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

  // ========== 生成 playable_modified.html ==========
  buildButton.addEventListener("click", async function () {
    if (!originalHtmlText) {
      setBuildStatus("请先选择并解析 HTML。");
      return;
    }
    const storeUrl = storeUrlInput.value.trim();
    if (!storeUrl) {
      setBuildStatus("请先填写跳转链接（STORE_URL）。");
      return;
    }

    setBuildStatus("正在生成新的 playable HTML...");

    let newHtml = originalHtmlText;

    try {
      // 1) 按不同模式替换图片
      if (parseMode === "zipPk" && zipVarName && zipAssignStart != null && zipAssignEnd != null && zipJszip) {
        // ZIP 模式：真正修改 ZIP 包里的 PNG/JPG
        const entries = Object.entries(overrideMap);
        if (entries.length) {
          entries.forEach(([path, dataUrl]) => {
            const base64 = dataUrl.split(",")[1] || "";
            zipJszip.file(path, base64, { base64: true });
          });
        }

        const newBytes = await zipJszip.generateAsync({ type: "uint8array" });
        const newB64 = bytesToBase64(newBytes);
        const newAssign = 'window.' + zipVarName + '="' + newB64 + '";';

        newHtml =
          originalHtmlText.slice(0, zipAssignStart) +
          newAssign +
          originalHtmlText.slice(zipAssignEnd);
      } else if (parseMode === "inline") {
        // inline data:image：直接替换 HTML 里的 dataURL
        const entries = Object.entries(overrideMap);
        if (entries.length) {
          entries.forEach(([origDataUrl, newDataUrl]) => {
            if (!origDataUrl || !newDataUrl) return;
            newHtml = newHtml.split(origDataUrl).join(newDataUrl);
          });
        }
      } else if (parseMode === "adapterZip") {
        // adapterZip 的图片替换是在运行时通过 overrideScript 实现，不改 zip 数据本身
        // 此处不修改 newHtml 的 zip 部分
      }

      // 2) 无论哪种模式，都先在 HTML 里强制改跳转链接
      newHtml = rewriteStoreUrlInHtml(newHtml, storeUrl);

      // 3) 如果是 adapterZip，再注入 overrideScript
      if (parseMode === "adapterZip") {
        const overrideScript = buildAdapterOverrideScript();
        newHtml = insertBeforeBodyEnd(newHtml, overrideScript);
      }

      // 4) 最后统一注入 mraid 脚本兜底
      const mraidScript = buildMraidScript(storeUrl);
      newHtml = insertBeforeBodyEnd(newHtml, mraidScript);

      // 5) 下载
      downloadTextFile("playable_modified.html", newHtml);
      setBuildStatus("已生成 playable_modified.html。");

    } catch (e) {
      console.error(e);
      setBuildStatus("生成失败：" + (e && e.message ? e.message : String(e)));
    }
  });

})();
