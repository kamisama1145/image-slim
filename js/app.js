/* ============================================================
 * 图降降 ImageSlim - 核心逻辑
 * ------------------------------------------------------------
 * 原理一句话：把图片画到一块更小的画布（canvas）上，再从
 * 这块小画布导出新图片。整个过程都在浏览器本地完成，
 * 图片不会离开你的电脑。
 *
 * 本文件按"先工具函数、再事件绑定、再核心处理"的顺序组织，
 * 适合边读边学。
 * ============================================================ */

"use strict";

/* ========== 1. 全局状态 ========== */

// 用户选中的原始文件列表
let pendingFiles = [];
// 处理完成的结果列表，每一项是 { blob, previewUrl, ... }（见 processOne）
let results = [];
// 是否正在处理中（防止重复点击）
let isProcessing = false;

// 当前处理设置（与页面上的控件一一对应）
const settings = {
  mode: "percent",   // percent=按比例 | width=指定宽度
  percent: 50,       // 默认缩小到 50%
  width: 1920,       // 指定宽度模式的默认目标宽度
  format: "keep",    // keep=保持原格式 | jpeg | webp | png
  quality: 80        // JPEG/WebP 质量，范围 10-100
};

/* ========== 2. 页面元素引用 ========== */

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const modeSeg = document.getElementById("modeSeg");
const percentGroup = document.getElementById("percentGroup");
const presetRow = document.getElementById("presetRow");
const customPercentWrap = document.getElementById("customPercentWrap");
const customPercent = document.getElementById("customPercent");
const widthGroup = document.getElementById("widthGroup");
const targetWidth = document.getElementById("targetWidth");
const formatSelect = document.getElementById("formatSelect");
const qualityRange = document.getElementById("qualityRange");
const qualityValue = document.getElementById("qualityValue");
const processBtn = document.getElementById("processBtn");
const clearBtn = document.getElementById("clearBtn");
const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const resultCount = document.getElementById("resultCount");
const resultsEmpty = document.getElementById("resultsEmpty");
const resultsGrid = document.getElementById("resultsGrid");
const resultsActions = document.getElementById("resultsActions");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const toastWrap = document.getElementById("toastWrap");

/* ========== 3. 工具函数 ========== */

/** 把字节数格式化成人类可读的大小，如 1.5 MB */
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return (i === 0 ? value.toFixed(0) : value.toFixed(1)) + " " + units[i];
}

/** 计算节省百分比，如 62.5% */
function calcSavedPct(origSize, newSize) {
  if (!origSize || !newSize) return 0;
  return Math.max(0, Math.round((1 - newSize / origSize) * 1000) / 10);
}

/** 轻提示：右上角/顶部弹一条消息 */
function toast(message, type) {
  const el = document.createElement("div");
  el.className = "toast" + (type === "error" ? " error" : "");
  el.textContent = message;
  toastWrap.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 350);
  }, 2600);
}

/** 触发浏览器下载一个 Blob */
function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 稍后释放临时地址，避免内存占用
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * 把图片文件读成 <img> 对象（这样才能知道它的原始尺寸，并画到画布上）
 * 返回 Promise，resolve 出 { img, url }
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("浏览器无法读取该图片（可能格式不支持或文件损坏）"));
    };
    img.src = url;
  });
}

/**
 * 根据设置计算目标尺寸。
 * 规则：只缩小、不放大 —— 若算出的目标大于原图，就保持原尺寸。
 */
function calcTargetSize(origW, origH) {
  let targetW, targetH;
  if (settings.mode === "percent") {
    const pct = settings.percent / 100;
    targetW = Math.max(1, Math.round(origW * pct));
    targetH = Math.max(1, Math.round(origH * pct));
  } else {
    // 指定宽度：高度按原图比例自动换算
    targetW = settings.width;
    targetH = Math.max(1, Math.round(origH * (settings.width / origW)));
  }
  // 目标不小于原图 => 不放大，原样输出
  if (targetW >= origW && targetH >= origH) {
    return { w: origW, h: origH, unchanged: true };
  }
  return { w: targetW, h: targetH, unchanged: false };
}

/** 确定输出 MIME 类型 */
function resolveMime(file) {
  if (settings.format !== "keep") {
    return { "jpeg": "image/jpeg", "webp": "image/webp", "png": "image/png" }[settings.format];
  }
  // 保持原格式：只保留浏览器画布能稳定导出的三种
  const t = file.type;
  if (t === "image/jpeg" || t === "image/png" || t === "image/webp") return t;
  return "image/png"; // GIF / BMP 等统一转 PNG（会失去动画，属正常行为）
}

/** 根据 MIME 得到文件扩展名 */
function extOf(mime) {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mime] || "png";
}

/** 生成新文件名：原名去掉扩展名 + "_slim.新扩展名" */
function makeNewName(origName, mime) {
  const base = origName.replace(/\.[^.]+$/, "") || "image";
  return base + "_slim." + extOf(mime);
}

/**
 * 把 canvas 导出成 Blob。
 * 小坑：老版本浏览器可能不支持 WebP 编码，此时 toBlob 返回 null，
 * 我们会自动回退成 PNG 并提醒用户。
 */
function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) return resolve(blob);
        if (mime !== "image/png") {
          canvas.toBlob(
            (pngBlob) => (pngBlob ? resolve(pngBlob) : reject(new Error("图片导出失败"))),
            "image/png"
          );
        } else {
          reject(new Error("图片导出失败"));
        }
      },
      mime,
      quality
    );
  });
}

/* ========== 4. 上传交互 ========== */

/** 校验并暂存用户选择的文件 */
function acceptFiles(fileList) {
  if (!fileList || !fileList.length) return;
  const accepted = [];
  const imageExt = /\.(jpe?g|png|webp|gif|bmp)$/i;

  for (const f of fileList) {
    const looksImage = (f.type && f.type.startsWith("image/")) || imageExt.test(f.name);
    if (looksImage) {
      accepted.push(f);
    } else {
      toast("已跳过非图片文件：" + f.name, "error");
    }
  }

  if (!accepted.length) {
    toast("没有可处理的图片，请选择 JPG / PNG / WebP / GIF / BMP 文件", "error");
    return;
  }

  pendingFiles = pendingFiles.concat(accepted);
  toast("已添加 " + accepted.length + " 张图片，共 " + pendingFiles.length + " 张待处理");
}

// 点击上传区 -> 弹出文件选择
dropzone.addEventListener("click", () => fileInput.click());
// 键盘可访问：按回车或空格也能选择文件
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

// 拖拽：必须阻止浏览器默认行为，否则会直接打开图片
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  acceptFiles(e.dataTransfer.files);
});

// 文件选择框
fileInput.addEventListener("change", (e) => {
  acceptFiles(e.target.files);
  fileInput.value = ""; // 清空，这样再次选择同一文件也能触发 change
});

/* ========== 5. 设置面板交互 ========== */

// 模式切换：按比例 / 指定宽度
modeSeg.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-mode]");
  if (!btn) return;
  settings.mode = btn.dataset.mode;
  modeSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
  percentGroup.hidden = settings.mode !== "percent";
  widthGroup.hidden = settings.mode !== "width";
});

// 比例预设按钮（25% / 50% / 75% / 自定义）
presetRow.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-percent]");
  if (!btn) return;
  presetRow.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
  const isCustom = btn.dataset.percent === "custom";
  customPercentWrap.hidden = !isCustom;
  if (!isCustom) {
    settings.percent = parseInt(btn.dataset.percent, 10);
  } else {
    settings.percent = clampInt(customPercent.value, 1, 100, 60);
  }
});

// 自定义比例输入
customPercent.addEventListener("input", () => {
  settings.percent = clampInt(customPercent.value, 1, 100, 60);
});

// 目标宽度输入
targetWidth.addEventListener("input", () => {
  settings.width = clampInt(targetWidth.value, 1, 10000, 1920);
});

// 输出格式
formatSelect.addEventListener("change", () => {
  settings.format = formatSelect.value;
});

// 质量滑块：同步显示数值
qualityRange.addEventListener("input", () => {
  settings.quality = parseInt(qualityRange.value, 10);
  qualityValue.textContent = settings.quality;
});

/** 把输入值限制在 [min, max]，非法时返回 fallback */
function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/* ========== 6. 核心：单张图片处理 ========== */

/**
 * 处理一张图片，返回结果对象：
 * {
 *   blob, newName, previewUrl,
 *   origW, origH, w, h,
 *   origSize, newSize, savedPct
 * }
 */
async function processOne(file) {
  const { img, url } = await loadImage(file);

  const origW = img.naturalWidth;
  const origH = img.naturalHeight;
  if (!origW || !origH) {
    URL.revokeObjectURL(url);
    throw new Error("无法读取图片尺寸");
  }

  const target = calcTargetSize(origW, origH);
  const mime = resolveMime(file);

  // 创建目标尺寸的画布
  const canvas = document.createElement("canvas");
  canvas.width = target.w;
  canvas.height = target.h;

  // 高质量缩放：开启平滑 + 高质量
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 把原图画到小画布上（画布越小，图片就越"瘦"）
  ctx.drawImage(img, 0, 0, target.w, target.h);
  URL.revokeObjectURL(url); // 原图地址用完即释放

  // 导出新图片
  const blob = await canvasToBlob(canvas, mime, settings.quality / 100);
  const actualMime = blob.type || mime;
  const newName = makeNewName(file.name, actualMime);

  return {
    blob,
    newName,
    previewUrl: URL.createObjectURL(blob),
    origW,
    origH,
    w: target.w,
    h: target.h,
    origSize: file.size,
    newSize: blob.size,
    savedPct: calcSavedPct(file.size, blob.size)
  };
}

/* ========== 7. 批量处理与结果展示 ========== */

/** 生成一张结果卡片（DOM） */
function renderResultCard(item) {
  const card = document.createElement("div");
  card.className = "result-card";

  const img = document.createElement("img");
  img.className = "result-thumb";
  img.src = item.previewUrl;
  img.alt = item.newName;

  const body = document.createElement("div");
  body.className = "result-body";

  const name = document.createElement("div");
  name.className = "result-name";
  name.title = item.newName;
  name.textContent = item.newName;

  const stats = document.createElement("div");
  stats.className = "result-stats";
  const dimChanged = item.origW !== item.w || item.origH !== item.h;
  stats.innerHTML =
    "尺寸：" + item.origW + "×" + item.origH + " → <b>" + item.w + "×" + item.h + "</b><br>" +
    "体积：" + formatBytes(item.origSize) + " → <b>" + formatBytes(item.newSize) + "</b>" +
    (dimChanged ? "" : "（已达原尺寸）");

  const save = document.createElement("span");
  save.className = "result-save";
  save.textContent = "节省 " + item.savedPct + "%";

  const dl = document.createElement("button");
  dl.type = "button";
  dl.className = "result-dl";
  dl.textContent = "下载";
  dl.addEventListener("click", () => triggerDownload(item.blob, item.newName));

  body.appendChild(name);
  body.appendChild(stats);
  body.appendChild(save);
  body.appendChild(dl);
  card.appendChild(img);
  card.appendChild(body);
  resultsGrid.appendChild(card);
}

/** 清空结果列表（同时释放所有临时地址，防止内存泄漏） */
function clearResultsView() {
  results.forEach((r) => URL.revokeObjectURL(r.previewUrl));
  results = [];
  resultsGrid.innerHTML = "";
  resultCount.textContent = "0 张";
  resultsEmpty.hidden = false;
  resultsActions.hidden = true;
}

/** 更新进度条 */
function setProgress(done, total) {
  progressBar.style.width = total ? (done / total) * 100 + "%" : "0%";
  progressText.textContent = "正在处理 " + done + " / " + total;
}

/** 开始处理所有待处理图片 */
async function processAll() {
  if (!pendingFiles.length) {
    toast("请先添加图片", "error");
    return;
  }
  if (isProcessing) return;
  isProcessing = true;

  processBtn.disabled = true;
  clearBtn.disabled = true;
  clearResultsView();
  progressWrap.hidden = false;
  setProgress(0, pendingFiles.length);

  const files = pendingFiles.slice(); // 拷贝，防止处理中状态被清空按钮干扰
  let done = 0;

  for (const file of files) {
    done += 1;
    setProgress(done, files.length);
    try {
      const item = await processOne(file);
      results.push(item);
      renderResultCard(item);
    } catch (err) {
      toast("「" + file.name + "」处理失败：" + err.message, "error");
    }
  }

  // 处理结束：收尾
  progressWrap.hidden = true;
  isProcessing = false;
  processBtn.disabled = false;
  clearBtn.disabled = false;

  const n = results.length;
  resultCount.textContent = n + " 张";
  resultsEmpty.hidden = n > 0;
  resultsActions.hidden = n === 0;

  if (n) {
    toast("处理完成：" + n + " 张，共节省 " + formatBytes(files.reduce((s, f) => s + f.size, 0) - results.reduce((s, r) => s + r.newSize, 0)));
  }
}

/* ========== 8. 下载 ========== */

// 全部打包下载：优先用 JSZip 打包成 zip；组件没加载出来就逐个下载
downloadAllBtn.addEventListener("click", async () => {
  if (!results.length) return;
  if (typeof JSZip === "undefined") {
    toast("ZIP 组件未加载，改为逐个下载");
    results.forEach((r) => triggerDownload(r.blob, r.newName));
    return;
  }
  downloadAllBtn.disabled = true;
  downloadAllBtn.textContent = "正在打包…";
  try {
    const zip = new JSZip();
    results.forEach((r) => zip.file(r.newName, r.blob));
    const zipBlob = await zip.generateAsync({ type: "blob" });
    triggerDownload(zipBlob, "图降降-处理结果.zip");
    toast("已打包 " + results.length + " 张图片");
  } catch (err) {
    toast("打包失败：" + err.message, "error");
  } finally {
    downloadAllBtn.disabled = false;
    downloadAllBtn.textContent = "全部打包下载（ZIP）";
  }
});

/* ========== 9. 开始处理 & 清空 ========== */

// 点击"开始处理"执行批量处理
processBtn.addEventListener("click", processAll);

clearBtn.addEventListener("click", () => {
  pendingFiles = [];
  clearResultsView();
  toast("已清空");
});

/* ========== 10. 事件绑定汇总（已在上方各自完成，此处仅说明） ========== */
// 说明：为了可读性，每个控件的事件都在对应小节绑定好了。
