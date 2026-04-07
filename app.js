const OUTPUT_SIZES = [16, 24, 32, 40, 48, 64, 96, 128, 256];

const iconFileInput = document.getElementById("iconFile");
const buildBtn = document.getElementById("buildBtn");
const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");

let selectedFile = null;

iconFileInput.addEventListener("change", () => {
  selectedFile = iconFileInput.files?.[0] ?? null;
  buildBtn.disabled = !selectedFile;
  statusEl.textContent = selectedFile
    ? `已選擇：${selectedFile.name}`
    : "請先選擇 .ico 檔案";
});

buildBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  try {
    setStatus("正在讀取來源圖示...");
    const source = await loadImageFromFile(selectedFile);

    setStatus("正在生成各尺寸 PNG...");
    const pngBuffers = await Promise.all(
      OUTPUT_SIZES.map((size) => renderPngFromSource(source, size))
    );

    setStatus("正在封裝 Multi-size.ico...");
    const icoBytes = buildIcoFile(
      OUTPUT_SIZES.map((size, index) => ({
        size,
        pngData: pngBuffers[index],
      }))
    );

    renderPreview(pngBuffers);
    downloadIco(icoBytes, "Multi-size.ico");
    setStatus("完成：已下載 Multi-size.ico");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`失敗：${message}`);
  }
});

function setStatus(message) {
  statusEl.textContent = message;
}

async function loadImageFromFile(file) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = new Image();
    img.decoding = "async";
    img.src = objectUrl;

    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("瀏覽器無法解碼此 .ico 檔案"));
    });

    return img;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function renderPngFromSource(source, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("無法建立 Canvas 2D context");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(source, 0, 0, size, size);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error("PNG 轉檔失敗"));
          return;
        }
        resolve(result);
      },
      "image/png",
      1
    );
  });

  return new Uint8Array(await blob.arrayBuffer());
}

function buildIcoFile(items) {
  const headerSize = 6;
  const entrySize = 16;
  const directorySize = headerSize + entrySize * items.length;

  const totalSize =
    directorySize + items.reduce((sum, item) => sum + item.pngData.byteLength, 0);

  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, items.length, true);

  let dataOffset = directorySize;

  items.forEach((item, index) => {
    const entryOffset = headerSize + index * entrySize;
    const wh = item.size >= 256 ? 0 : item.size;

    view.setUint8(entryOffset + 0, wh);
    view.setUint8(entryOffset + 1, wh);
    view.setUint8(entryOffset + 2, 0);
    view.setUint8(entryOffset + 3, 0);
    view.setUint16(entryOffset + 4, 1, true);
    view.setUint16(entryOffset + 6, 32, true);
    view.setUint32(entryOffset + 8, item.pngData.byteLength, true);
    view.setUint32(entryOffset + 12, dataOffset, true);

    out.set(item.pngData, dataOffset);
    dataOffset += item.pngData.byteLength;
  });

  return out;
}

function downloadIco(bytes, fileName) {
  const blob = new Blob([bytes], { type: "image/x-icon" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function renderPreview(pngBuffers) {
  previewEl.textContent = "";

  pngBuffers.forEach((buffer, i) => {
    const size = OUTPUT_SIZES[i];
    const blob = new Blob([buffer], { type: "image/png" });
    const url = URL.createObjectURL(blob);

    const tile = document.createElement("div");
    tile.className = "tile";

    const img = document.createElement("img");
    img.src = url;
    img.alt = `${size}x${size}`;
    img.onload = () => URL.revokeObjectURL(url);

    const label = document.createElement("div");
    label.textContent = `${size}x${size}`;

    tile.appendChild(img);
    tile.appendChild(label);
    previewEl.appendChild(tile);
  });
}