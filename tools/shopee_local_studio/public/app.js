let stores = [];
let tasks = [];
let selectedTask = null;
let pendingParsedTask = null;
let storeFrameStatus = null;
let productCodeMappings = [];
let imageResults = [];

const taskForm = document.querySelector("#taskForm");
const productCodeMapForm = document.querySelector("#productCodeMapForm");
const storeChecks = document.querySelector("#storeChecks");
const taskSelect = document.querySelector("#taskSelect");
const taskSearch = document.querySelector("#taskSearch");
const showArchived = document.querySelector("#showArchived");
const taskView = document.querySelector("#taskView");
const emptyState = document.querySelector("#emptyState");
const listingEditors = document.querySelector("#listingEditors");
const imageGrid = document.querySelector("#imageGrid");
const logs = document.querySelector("#logs");
const quickTaskText = document.querySelector("#quickTaskText");
const imagePicker = document.querySelector("#imagePicker");
const pickImagesBtn = document.querySelector("#pickImagesBtn");
const imageDropZone = document.querySelector("#imageDropZone");
const productCodeMapList = document.querySelector("#productCodeMapList");
const imageResultSearch = document.querySelector("#imageResultSearch");
const showArchivedResults = document.querySelector("#showArchivedResults");
const imageResultsEl = document.querySelector("#imageResults");

document.querySelector("#refreshBtn").addEventListener("click", refreshAll);
document.querySelector("#parseQuickBtn").addEventListener("click", parseQuickTask);
document.querySelector("#createRunBtn").addEventListener("click", createAndRunTask);
document.querySelector("#reloadProductCodeMapBtn").addEventListener("click", loadProductCodeMap);
document.querySelector("#deleteProductCodeMapBtn").addEventListener("click", deleteProductCodeMap);
document.querySelector("#reloadImageResultsBtn").addEventListener("click", () => loadImageResults(true));
document.querySelector("#reloadImagesBtn").addEventListener("click", loadImages);
document.querySelector("#reloadLogsBtn").addEventListener("click", loadLogs);
document.querySelector("#runAllBtn").addEventListener("click", () => postTaskAction("run-all"));
document.querySelector("#writeImageConfigBtn").addEventListener("click", () => postTaskAction("image2-config"));
document.querySelector("#generateBtn").addEventListener("click", () => postTaskAction("generate"));
document.querySelector("#regenerateImagesBtn").addEventListener("click", () => postTaskAction("regenerate-images"));
document.querySelector("#writeBigsellerBtn").addEventListener("click", () => postTaskAction("bigseller-config"));
document.querySelector("#discoverBtn").addEventListener("click", () => postTaskAction("discover"));
document.querySelector("#saveBtn").addEventListener("click", () => postTaskAction("save"));
document.querySelector("#regenerateListingsBtn").addEventListener("click", () => postTaskAction("regenerate-listings"));
document.querySelector("#saveListingsBtn").addEventListener("click", saveListings);
document.querySelector("#archiveBtn").addEventListener("click", archiveSelectedTask);
document.querySelector("#deleteTaskBtn").addEventListener("click", deleteSelectedTask);
document.querySelector("#downloadTaskBtn").addEventListener("click", downloadSelectedTask);

pickImagesBtn.addEventListener("click", () => imagePicker.click());
imagePicker.addEventListener("change", async () => {
  await uploadAndAppendImages([...imagePicker.files]);
  imagePicker.value = "";
});
taskForm.elements.sourceImages.addEventListener("paste", handleImagePaste);
quickTaskText.addEventListener("paste", handleImagePaste);
imageDropZone.addEventListener("paste", handleImagePaste);
imageDropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  imageDropZone.classList.add("dragging");
});
imageDropZone.addEventListener("dragleave", () => imageDropZone.classList.remove("dragging"));
imageDropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  imageDropZone.classList.remove("dragging");
  await uploadAndAppendImages([...event.dataTransfer.files]);
});

taskSelect.addEventListener("change", async () => {
  selectedTask = tasks.find((task) => task.id === taskSelect.value) || null;
  if (selectedTask) pendingParsedTask = null;
  await renderTask();
});
taskSearch.addEventListener("input", async () => refreshTasks(selectedTask?.id, false));
showArchived.addEventListener("change", async () => refreshTasks(selectedTask?.id, false));
imageResultSearch.addEventListener("input", () => loadImageResults(false));
showArchivedResults.addEventListener("change", () => loadImageResults(false));

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createTaskFromForm(false);
});
productCodeMapForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveProductCodeMap();
});

await refreshAll();
setInterval(async () => {
  if (selectedTask) {
    await refreshTasks(selectedTask.id, false);
    await loadLogs();
    await loadImages();
    await loadImageResults(false);
  }
}, 5000);

async function handleImagePaste(event) {
  const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  event.preventDefault();
  await uploadAndAppendImages(files);
}

async function uploadAndAppendImages(files) {
  const images = files.filter((file) => file.type.startsWith("image/"));
  if (!images.length) return;
  toast("\u6b63\u5728\u4fdd\u5b58\u56fe\u7247...");
  const payloadFiles = await Promise.all(images.map(async (file) => ({
    name: file.name || "clipboard.png",
    type: file.type,
    dataUrl: await readDataUrl(file)
  })));
  const data = await api("/api/uploads", {
    method: "POST",
    body: JSON.stringify({ files: payloadFiles })
  });
  appendSourceImagePaths(data.files.map((file) => file.path));
  toast(`\u5df2\u6dfb\u52a0 ${data.files.length} \u5f20\u56fe\u7247`);
}

function appendSourceImagePaths(paths) {
  const field = taskForm.elements.sourceImages;
  const existing = field.value.trim();
  field.value = [existing, ...paths].filter(Boolean).join("\n");
  field.focus();
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function parseQuickTask() {
  const data = await api("/api/parse-task-text", {
    method: "POST",
    body: JSON.stringify({ text: quickTaskText.value })
  });
  fillTaskForm(data.task);
  pendingParsedTask = readTaskForm();
  selectedTask = null;
  renderTaskSelect();
  await renderTask();
  toast("\u5df2\u89e3\u6790\u5230\u5de6\u4fa7\u8868\u5355\uff0c\u8bf7\u70b9\u51fb\u521b\u5efa\u5e76\u4e00\u952e\u5168\u6d41\u7a0b");
}

async function createAndRunTask() {
  if (quickTaskText.value.trim()) {
    await parseQuickTask();
  }
  await createTaskFromForm(true);
}

async function createTaskFromForm(runAll) {
  const payload = readTaskForm();
  const data = await api("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
  selectedTask = data.task;
  pendingParsedTask = null;
  taskForm.reset();
  renderStores();
  await refreshTasks(selectedTask.id);
  toast(runAll ? "\u4efb\u52a1\u5df2\u521b\u5efa\uff0c\u51c6\u5907\u540e\u53f0\u5168\u6d41\u7a0b" : "\u4efb\u52a1\u5df2\u521b\u5efa");
  if (runAll) await postTaskAction("run-all");
}

function readTaskForm() {
  const form = new FormData(taskForm);
  return {
    productName: form.get("productName"),
    skuGroup: form.get("skuGroup"),
    targetStores: selectedTargetStores(),
    sourceImages: form.get("sourceImages"),
    notes: form.get("notes")
  };
}

function selectedTargetStores() {
  return [...taskForm.querySelectorAll("input[name=targetStores]:checked")].map((input) => input.value);
}

function fillTaskForm(task) {
  if (task.productName) taskForm.elements.productName.value = task.productName;
  if (task.skuGroup?.length) taskForm.elements.skuGroup.value = task.skuGroup.join(" ");
  // Store checkboxes are authoritative; pasted task text no longer overrides them.
  if (task.sourceImages) taskForm.elements.sourceImages.value = task.sourceImages;
  if (task.notes) taskForm.elements.notes.value = task.notes;
}

async function refreshAll() {
  const [storeData, frameData, mapData] = await Promise.all([
    api("/api/stores"),
    api("/api/store-frames").catch(() => null),
    api("/api/product-code-map").catch(() => ({ mappings: [] }))
  ]);
  stores = storeData.stores;
  storeFrameStatus = frameData;
  productCodeMappings = mapData.mappings || [];
  renderStores();
  renderProductCodeMap();
  await refreshTasks(selectedTask?.id ?? (pendingParsedTask ? null : undefined));
  await loadImageResults(false);
}

async function refreshTasks(preferredId, notify = true) {
  const data = await api(taskListUrl());
  tasks = data.tasks;
  if (preferredId === null && pendingParsedTask && !selectedTask) {
    selectedTask = null;
  } else {
    selectedTask = tasks.find((task) => task.id === preferredId) || tasks[0] || null;
  }
  renderTaskSelect();
  await renderTask();
  if (notify) toast("\u5df2\u5237\u65b0");
}

async function loadImageResults(notify = false) {
  const params = new URLSearchParams();
  const query = imageResultSearch.value.trim();
  if (query) params.set("q", query);
  if (showArchivedResults.checked) params.set("includeArchived", "1");
  const suffix = params.toString();
  const data = await api(`/api/image-results${suffix ? `?${suffix}` : ""}`);
  imageResults = data.results || [];
  renderImageResults();
  if (notify) toast("\u56fe\u7247\u7ed3\u679c\u5df2\u5237\u65b0");
}

function taskListUrl() {
  const params = new URLSearchParams();
  const query = taskSearch.value.trim();
  if (query) params.set("q", query);
  if (showArchived.checked) params.set("includeArchived", "1");
  const suffix = params.toString();
  return `/api/tasks${suffix ? `?${suffix}` : ""}`;
}

function renderStores() {
  storeChecks.innerHTML = stores.map((store) => `
    <label class="store-check">
      <input type="checkbox" name="targetStores" value="${store.id}" checked>
      ${escapeHtml(store.label)}
    </label>
  `).join("");
}

async function loadProductCodeMap() {
  const data = await api("/api/product-code-map");
  productCodeMappings = data.mappings || [];
  renderProductCodeMap();
  toast("\u6620\u5c04\u5df2\u5237\u65b0");
}

function renderProductCodeMap() {
  if (!productCodeMapList) return;
  productCodeMapList.innerHTML = productCodeMappings.length ? productCodeMappings.map((mapping) => `
    <button class="map-row" type="button" data-code="${escapeHtml(mapping.productCode)}">
      <strong>${escapeHtml(mapping.productCode)}</strong>
      <span>${escapeHtml((mapping.skus || []).join(" "))}</span>
    </button>
  `).join("") : '<div class="empty small">\u6682\u65e0\u6620\u5c04</div>';
  productCodeMapList.querySelectorAll(".map-row").forEach((button) => {
    button.addEventListener("click", () => {
      const mapping = productCodeMappings.find((item) => item.productCode === button.dataset.code);
      if (!mapping) return;
      productCodeMapForm.elements.productCode.value = mapping.productCode;
      productCodeMapForm.elements.skuGroup.value = mapping.skus.join(" ");
    });
  });
}

async function saveProductCodeMap() {
  const productCode = productCodeMapForm.elements.productCode.value.trim();
  const skuGroup = productCodeMapForm.elements.skuGroup.value.trim();
  const data = await api(`/api/product-code-map/${encodeURIComponent(productCode)}`, {
    method: "PUT",
    body: JSON.stringify({ skuGroup })
  });
  productCodeMappings = data.mappings || [];
  renderProductCodeMap();
  toast("\u6620\u5c04\u5df2\u4fdd\u5b58");
}

async function deleteProductCodeMap() {
  const productCode = productCodeMapForm.elements.productCode.value.trim();
  if (!productCode) return toast("\u8bf7\u5148\u586b\u5199\u5546\u54c1\u7f16\u7801");
  const data = await api(`/api/product-code-map/${encodeURIComponent(productCode)}`, { method: "DELETE" });
  productCodeMappings = data.mappings || [];
  productCodeMapForm.reset();
  renderProductCodeMap();
  toast("\u6620\u5c04\u5df2\u5220\u9664");
}

function renderTaskSelect() {
  const placeholder = selectedTask ? "" : `
    <option value="" selected>
      ${pendingParsedTask ? "\u5df2\u89e3\u6790\u8868\u5355\uff0c\u7b49\u5f85\u521b\u5efa\u4efb\u52a1" : "\u8bf7\u9009\u62e9\u4efb\u52a1"}
    </option>
  `;
  taskSelect.innerHTML = placeholder + tasks.map((task) => `
    <option value="${task.id}" ${task.id === selectedTask?.id ? "selected" : ""}>
      ${task.archived ? "[\u5df2\u5f52\u6863] " : ""}${escapeHtml(task.productName)} &middot; ${escapeHtml(taskIdentifierText(task))} &middot; ${escapeHtml(task.status)}
    </option>
  `).join("");
}

function renderImageResults() {
  if (!imageResultsEl) return;
  if (!imageResults.length) {
    imageResultsEl.innerHTML = '<div class="empty small">\u6682\u65e0\u751f\u6210\u56fe\u7ed3\u679c</div>';
    return;
  }
  imageResultsEl.innerHTML = imageResults.map((result) => `
    <article class="result-card" data-task-id="${escapeHtml(result.id)}">
      <div class="result-main">
        <div>
          <strong>${escapeHtml(result.productName || result.identifierText)}</strong>
          <span>${escapeHtml(result.identifierText)} &middot; ${escapeHtml(result.status)} &middot; ${escapeHtml(formatDateTime(result.updatedAt || result.createdAt))}</span>
        </div>
        <div class="result-actions">
          <button type="button" data-action="select">\u6253\u5f00</button>
          <button type="button" data-action="download">\u4e0b\u8f7d</button>
          <button type="button" data-action="archive">${result.archived ? "\u6062\u590d" : "\u5f52\u6863"}</button>
        </div>
      </div>
      <div class="result-counts">${(result.storeImageCounts || []).map((item) => `
        <span>${escapeHtml(item.storeLabel || item.store)}: ${Number(item.count || 0)}</span>
      `).join("")}</div>
      <div class="result-previews">${(result.previewImages || []).map((image) => `
        <img src="${image.url}&t=${Date.now()}" alt="${escapeHtml(image.file)}">
      `).join("")}</div>
    </article>
  `).join("");
  imageResultsEl.querySelectorAll(".result-card").forEach((card) => {
    card.querySelector("[data-action=select]")?.addEventListener("click", () => selectImageResultTask(card.dataset.taskId));
    card.querySelector("[data-action=download]")?.addEventListener("click", () => {
      window.location.href = `/api/tasks/${card.dataset.taskId}/download`;
    });
    card.querySelector("[data-action=archive]")?.addEventListener("click", () => archiveImageResultTask(card.dataset.taskId));
  });
}

async function renderTask() {
  const displayTask = selectedTask || pendingDisplayTask();
  emptyState.hidden = Boolean(displayTask);
  taskView.hidden = !displayTask;
  setTaskActionButtonsDisabled(!selectedTask);
  if (!displayTask) {
    emptyState.textContent = "\u6682\u65e0\u4efb\u52a1";
    return;
  }

  document.querySelector("#taskProduct").textContent = displayTask.productName;
  document.querySelector("#taskSkus").textContent = taskIdentifierText(displayTask);
  document.querySelector("#taskStatus").textContent = displayTask.status;
  document.querySelector("#taskArchived").textContent = selectedTask ? (displayTask.archived ? "\u5df2\u5f52\u6863" : "\u6d3b\u8dc3") : "\u672a\u521b\u5efa";
  document.querySelector("#archiveBtn").textContent = displayTask.archived ? "\u53d6\u6d88\u5f52\u6863" : "\u5f52\u6863\u4efb\u52a1";
  renderStoreFrameStatus(displayTask);
  await renderPreflight();
  await renderSourceReview(displayTask);
  renderListings(displayTask);
  if (selectedTask) {
    await loadImages();
    await loadLogs();
  } else {
    imageGrid.innerHTML = '<div class="empty">\u521b\u5efa\u4efb\u52a1\u540e\u751f\u6210\u56fe\u7247</div>';
    logs.textContent = "\u5df2\u89e3\u6790\u5230\u5de6\u4fa7\u8868\u5355\u3002\u8bf7\u70b9\u51fb\u201c\u521b\u5efa\u5e76\u4e00\u952e\u5168\u6d41\u7a0b\u201d\uff0c\u624d\u4f1a\u771f\u6b63\u751f\u6210\u56fe\u7247\u5e76\u5904\u7406 BigSeller \u8349\u7a3f\u3002";
  }
}

async function renderPreflight() {
  const panel = document.querySelector("#preflightPanel");
  if (!panel) return;
  if (!selectedTask) {
    panel.innerHTML = "";
    return;
  }
  const data = await api(`/api/tasks/${selectedTask.id}/preflight`).catch((error) => ({
    preflight: {
      status: "blocked",
      blockers: [{ id: "preflight_error", label: "\u603b\u68c0\u67e5\u5931\u8d25", message: error.message }],
      warnings: [],
      checks: []
    }
  }));
  const preflight = data.preflight || {};
  const blockers = preflight.blockers || [];
  const warnings = preflight.warnings || [];
  const items = [...blockers, ...warnings];
  panel.innerHTML = `
    <div class="preflight-head">
      <strong>\u751f\u6210\u524d\u603b\u68c0\u67e5</strong>
      <span class="preflight-state ${escapeHtml(preflight.status || "blocked")}">${escapeHtml(preflightLabel(preflight.status))}</span>
    </div>
    <div class="preflight-items">${items.length ? items.map((item) => `
      <div class="preflight-item ${escapeHtml(item.level || "warning")}">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.message)}</span>
      </div>
    `).join("") : '<div class="preflight-item ok"><strong>\u53ef\u751f\u6210</strong><span>\u6ca1\u6709\u963b\u65ad\u9879\u6216\u9ad8\u98ce\u9669\u63d0\u793a\u3002</span></div>'}</div>
  `;
}

function preflightLabel(status) {
  if (status === "ready") return "\u53ef\u751f\u6210";
  if (status === "needs_confirmation") return "\u9700\u786e\u8ba4";
  if (status === "high_risk") return "\u9ad8\u98ce\u9669";
  return "\u4e0d\u53ef\u751f\u6210";
}

async function renderSourceReview(displayTask) {
  const panel = document.querySelector("#sourceReviewPanel");
  if (!panel) return;
  if (!selectedTask) {
    panel.innerHTML = "";
    return;
  }
  const data = await api(`/api/tasks/${selectedTask.id}/source-images`).catch(() => ({
    images: [],
    review: {
      status: selectedTask.sourceReviewRequired ? "pending" : "not_required",
      imageCount: selectedTask.sourceImages?.length || 0,
      title: selectedTask.sourceTitle || "",
      editUrl: selectedTask.sourceEditUrl || ""
    }
  }));
  const review = data.review || {};
  const statusLabel = sourceReviewLabel(review.status);
  const risk = review.matchRisk || { level: "none", matchedSkus: [], message: "" };
  const images = data.images || [];
  panel.innerHTML = `
    <div class="source-review-head">
      <div>
        <strong>1\u5e97\u6765\u6e90\u786e\u8ba4</strong>
        <span class="source-state ${escapeHtml(review.status || "not_required")}">${escapeHtml(statusLabel)}</span>
        <span class="source-risk ${escapeHtml(risk.level || "none")}">${escapeHtml(sourceRiskLabel(risk.level))}</span>
      </div>
      <div class="source-actions">
        <button id="sourceCheckBtn" type="button">\u68c0\u7d22 1\u5e97\u5546\u54c1</button>
        <button id="confirmSourceBtn" type="button" ${images.length ? "" : "disabled"}>\u786e\u8ba4\u4f7f\u7528</button>
        <button id="rejectSourceBtn" class="danger" type="button" ${images.length ? "" : "disabled"}>\u4e0d\u5bf9</button>
      </div>
    </div>
    <div class="source-meta">
      <div><span>\u5546\u54C1\u7F16\u7801/SKU</span><strong>${escapeHtml(taskIdentifierText(displayTask))}</strong></div>
      <div><span>1\u5e97\u6807\u9898</span><strong>${escapeHtml(review.title || selectedTask.sourceTitle || "\u5c1a\u672a\u68c0\u7d22")}</strong></div>
      <div><span>\u7f16\u8f91\u94fe\u63a5</span>${review.editUrl ? `<a href="${escapeHtml(review.editUrl)}" target="_blank" rel="noreferrer">\u6253\u5f00 1\u5e97\u5546\u54c1</a>` : "<strong>\u6682\u65e0</strong>"}</div>
    </div>
    <div class="source-risk-detail">
      <span>\u5339\u914d\u8bc1\u636e</span>
      <strong>${escapeHtml(risk.message || "\u5c1a\u65e0\u5339\u914d\u8bc1\u636e")}</strong>
      <em>${escapeHtml((risk.matchedSkus || []).length ? `\u5546\u54C1\u7F16\u7801/SKU: ${risk.matchedSkus.join(" ")}` : "\u672a\u5339\u914d\u5230\u5546\u54C1\u7F16\u7801/SKU")}</em>
    </div>
    <div class="source-image-grid">${images.length ? images.map((image) => `
      <div class="source-image-item">
        <img src="${image.url}&t=${Date.now()}" alt="${escapeHtml(image.file)}">
        <span>${escapeHtml(image.file)}</span>
      </div>
    `).join("") : '<div class="empty">\u5c1a\u672a\u83b7\u53d6 1\u5e97\u6765\u6e90\u56fe</div>'}</div>
  `;
  document.querySelector("#sourceCheckBtn")?.addEventListener("click", () => postTaskAction("source-check", "\u5df2\u63d0\u4ea4 1\u5e97\u68c0\u7d22"));
  document.querySelector("#confirmSourceBtn")?.addEventListener("click", () => postTaskAction("confirm-source", "\u5df2\u786e\u8ba4 1\u5e97\u6765\u6e90"));
  document.querySelector("#rejectSourceBtn")?.addEventListener("click", () => postTaskAction("reject-source", "\u5df2\u6807\u8bb0\u6765\u6e90\u4e0d\u5bf9"));
}

function sourceReviewLabel(status) {
  if (status === "confirmed") return "\u5df2\u786e\u8ba4";
  if (status === "pending") return "\u5f85\u786e\u8ba4";
  if (status === "rejected") return "\u5df2\u6807\u8bb0\u4e0d\u5bf9";
  return "\u672a\u68c0\u7d22";
}

function sourceRiskLabel(level) {
  if (level === "strong") return "\u5f3a\u5339\u914d";
  if (level === "normal") return "\u666e\u901a\u5339\u914d";
  if (level === "high") return "\u9ad8\u98ce\u9669";
  return "\u672a\u68c0\u67e5";
}

function taskIdentifierText(task) {
  const skuText = (task?.skuGroup || []).join(" ");
  const productCodeText = (task?.productCodes || []).join(" ");
  return productCodeText ? `${productCodeText} -> ${skuText}` : skuText;
}

function pendingDisplayTask() {
  if (!pendingParsedTask) return null;
  const skuText = pendingParsedTask.skuGroup?.join(" ") || "";
  const targetStores = selectedTargetStores();
  return {
    productName: pendingParsedTask.productName || skuText || "\u5f85\u4ece 1 \u5e97\u6293\u53d6",
    skuGroup: pendingParsedTask.skuGroup || [],
    targetStores,
    archived: false,
    status: "\u5f85\u521b\u5efa\uff0c\u5df2\u89e3\u6790",
    listings: Object.fromEntries(targetStores.map((storeId) => [storeId, {
      title: "\u521b\u5efa\u540e\u751f\u6210\u8be5\u5e97\u94fa\u7684 80-100 \u5b57\u7206\u6b3e\u6807\u9898",
      detail: "\u521b\u5efa\u540e\u751f\u6210\u8be5\u5e97\u94fa\u7684\u8d8a\u5357\u8bed\u8be6\u60c5\u3002\u54c1\u724c\u548c\u54c1\u540d\u4fdd\u7559\u82f1\u6587\uff0c\u529f\u6548\u5356\u70b9\u7528\u8d8a\u5357\u8bed\u3002"
    }]))
  };
}

function setTaskActionButtonsDisabled(disabled) {
  ["runAllBtn", "downloadTaskBtn", "archiveBtn", "deleteTaskBtn", "writeImageConfigBtn", "generateBtn", "regenerateImagesBtn", "writeBigsellerBtn", "discoverBtn", "saveBtn", "regenerateListingsBtn", "saveListingsBtn", "reloadImagesBtn", "reloadLogsBtn"].forEach((id) => {
    const button = document.querySelector(`#${id}`);
    if (button) button.disabled = disabled;
  });
}

function renderStoreFrameStatus(displayTask) {
  const statusEl = document.querySelector("#storeFrameStatus");
  if (!statusEl) return;
  const targetStores = displayTask.targetStores || [];
  if (!storeFrameStatus) {
    statusEl.innerHTML = '<span class="frame-pill missing">\u6c34\u5370\u72b6\u6001\u672a\u8bfb\u53d6</span>';
    return;
  }
  const currentTaskFrames = selectedTask?.storeFrames || {};
  const frames = storeFrameStatus.frames || {};
  const pills = targetStores.map((storeId) => {
    const store = stores.find((item) => item.id === String(storeId));
    const frame = currentTaskFrames[storeId] || frames[storeId];
    const fileName = frame?.fileName || frame?.path?.split(/[\\/]/).pop();
    return frame
      ? `<span class="frame-pill ok">${escapeHtml(store?.label || storeId)}: ${escapeHtml(fileName || "\u5df2\u5339\u914d")}</span>`
      : `<span class="frame-pill missing">${escapeHtml(store?.label || storeId)}: \u672a\u627e\u5230\u6c34\u5370</span>`;
  });
  statusEl.innerHTML = `
    <div class="frame-root">\u6c34\u5370\u76ee\u5f55: ${escapeHtml(storeFrameStatus.root || "")}</div>
    <div class="frame-pills">${pills.join("")}</div>
  `;
}

function renderListings(displayTask = selectedTask) {
  listingEditors.innerHTML = displayTask.targetStores.map((storeId) => {
    const store = stores.find((item) => item.id === storeId);
    const listing = displayTask.listings?.[storeId] || { title: "", detail: "" };
    return `
      <div class="listing-editor" data-store="${escapeHtml(storeId)}">
        <h4>${escapeHtml(store?.label || storeId)}</h4>
        <label>
          &#26631;&#39064;
          <textarea data-field="title" rows="3">${escapeHtml(listing.title)}</textarea>
        </label>
        <div class="count ${listing.title.length < 80 || listing.title.length > 100 ? "bad" : ""}">${listing.title.length}/100</div>
        <label>
          &#35814;&#24773;
          <textarea data-field="detail" rows="9">${escapeHtml(listing.detail)}</textarea>
        </label>
      </div>
    `;
  }).join("");

  listingEditors.querySelectorAll("textarea[data-field=title]").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const count = textarea.closest(".listing-editor").querySelector(".count");
      count.textContent = `${textarea.value.length}/100`;
      count.classList.toggle("bad", textarea.value.length < 80 || textarea.value.length > 100);
    });
  });
}

async function saveListings() {
  const listings = {};
  listingEditors.querySelectorAll(".listing-editor").forEach((editor) => {
    const storeId = editor.dataset.store;
    listings[storeId] = {
      title: editor.querySelector("textarea[data-field=title]").value,
      detail: editor.querySelector("textarea[data-field=detail]").value
    };
  });
  const data = await api(`/api/tasks/${selectedTask.id}/listings`, {
    method: "PUT",
    body: JSON.stringify({ listings })
  });
  selectedTask = data.task;
  await refreshTasks(selectedTask.id, false);
  toast("\u6587\u672c\u5df2\u4fdd\u5b58");
}

async function postTaskAction(action, message = "\u5df2\u63d0\u4ea4\u540e\u53f0\u4efb\u52a1") {
  if (!selectedTask) return;
  try {
    const data = await api(`/api/tasks/${selectedTask.id}/${action}`, { method: "POST" });
    selectedTask = data.task;
    await refreshTasks(selectedTask.id, false);
    await loadImageResults(false);
    toast(message);
  } catch (error) {
    toast(error.message);
  }
}

async function archiveSelectedTask() {
  if (!selectedTask) return;
  const action = selectedTask.archived ? "unarchive" : "archive";
  const data = await api(`/api/tasks/${selectedTask.id}/${action}`, { method: "POST" });
  selectedTask = data.task;
  await refreshTasks(selectedTask.id, false);
  await loadImageResults(false);
  toast(action === "archive" ? "\u4efb\u52a1\u5df2\u5f52\u6863" : "\u4efb\u52a1\u5df2\u6062\u590d");
}

async function selectImageResultTask(taskId) {
  const data = await api(`/api/tasks/${taskId}`);
  if (data.task?.archived) showArchived.checked = true;
  selectedTask = data.task;
  pendingParsedTask = null;
  await refreshTasks(taskId, false);
}

async function archiveImageResultTask(taskId) {
  const result = imageResults.find((item) => item.id === taskId);
  const action = result?.archived ? "unarchive" : "archive";
  const data = await api(`/api/tasks/${taskId}/${action}`, { method: "POST" });
  if (selectedTask?.id === taskId) selectedTask = data.task;
  await refreshTasks(selectedTask?.id, false);
  await loadImageResults(false);
  toast(action === "archive" ? "\u7ed3\u679c\u5df2\u5f52\u6863" : "\u7ed3\u679c\u5df2\u6062\u590d");
}

async function deleteSelectedTask() {
  if (!selectedTask) return;
  const message = `\u786e\u5b9a\u5220\u9664\u4efb\u52a1\uff1a${selectedTask.productName}\uff1f\n\n\u8fd9\u4f1a\u5220\u9664\u8be5\u4efb\u52a1\u76ee\u5f55\u4e0b\u7684\u56fe\u7247\u3001\u6587\u6848\u548c\u65e5\u5fd7\u3002`;
  if (!window.confirm(message)) return;
  const deletedId = selectedTask.id;
  await api(`/api/tasks/${deletedId}`, { method: "DELETE" });
  selectedTask = null;
  await refreshTasks(undefined, false);
  await loadImageResults(false);
  toast("\u4efb\u52a1\u5df2\u5220\u9664");
}

function downloadSelectedTask() {
  if (!selectedTask) return;
  window.location.href = `/api/tasks/${selectedTask.id}/download`;
}

async function loadImages() {
  if (!selectedTask) return;
  const data = await api(`/api/tasks/${selectedTask.id}/images`);
  if (!data.images.length) {
    imageGrid.innerHTML = '<div class="empty">&#26242;&#26080;&#22270;&#29255;</div>';
    return;
  }
  imageGrid.innerHTML = data.images.map((image) => `
    <div class="image-item">
      <img src="${image.url}&t=${Date.now()}" alt="${escapeHtml(image.file)}">
      <span>${escapeHtml(image.storeLabel)} &middot; ${escapeHtml(image.file)}</span>
    </div>
  `).join("");
}

async function loadLogs() {
  if (!selectedTask) return;
  const response = await fetch(`/api/tasks/${selectedTask.id}/logs`);
  logs.textContent = await response.text();
  logs.scrollTop = logs.scrollHeight;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function toast(message) {
  const toastEl = document.querySelector("#toast");
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastEl.timer);
  toastEl.timer = setTimeout(() => {
    toastEl.hidden = true;
  }, 2400);
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
