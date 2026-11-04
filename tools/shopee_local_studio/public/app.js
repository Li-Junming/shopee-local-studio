let stores = [];
let tasks = [];
let selectedTask = null;
let pendingParsedTask = null;
let storeFrameStatus = null;
let productCodeMappings = [];
let imageResults = [];
let taskImages = [];
let archivedTasks = [];
let apiRuntime = null;
let batchQueue = null;

const taskForm = document.querySelector("#taskForm");
const apiConfigForm = document.querySelector("#apiConfigForm");
const apiBaseUrl = document.querySelector("#apiBaseUrl");
const apiKey = document.querySelector("#apiKey");
const apiModel = document.querySelector("#apiModel");
const apiFallbackBaseUrl = document.querySelector("#apiFallbackBaseUrl");
const apiFallbackKey = document.querySelector("#apiFallbackKey");
const apiFallbackModel = document.querySelector("#apiFallbackModel");
const apiFallbackStatus = document.querySelector("#apiFallbackStatus");
const apiConfigStatus = document.querySelector("#apiConfigStatus");
const apiKeyStatus = document.querySelector("#apiKeyStatus");
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
const taskImageSearch = document.querySelector("#taskImageSearch");
const archivedTaskList = document.querySelector("#archivedTaskList");
const liveRefreshState = document.querySelector("#liveRefreshState");
const batchTaskText = document.querySelector("#batchTaskText");
const batchQueueStatus = document.querySelector("#batchQueueStatus");
const batchQueueSummary = document.querySelector("#batchQueueSummary");
const batchQueueItems = document.querySelector("#batchQueueItems");
const batchCreateStartBtn = document.querySelector("#batchCreateStartBtn");
const batchPauseBtn = document.querySelector("#batchPauseBtn");
const batchResumeBtn = document.querySelector("#batchResumeBtn");
const batchSkipBtn = document.querySelector("#batchSkipBtn");
let liveRefreshInFlight = false;
let batchQueueRefreshInFlight = false;

const taskActionButtonIds = [
  "runAllBtn",
  "downloadTaskBtn",
  "archiveBtn",
  "deleteTaskBtn",
  "writeImageConfigBtn",
  "generateBtn",
  "regenerateImagesBtn",
  "copySourceDraftsBtn",
  "writeBigsellerBtn",
  "discoverBtn",
  "saveBtn",
  "regenerateListingsBtn",
  "saveListingsBtn",
  "reloadImagesBtn",
  "reloadLogsBtn",
  "sourceCheckBtn",
  "confirmSourceBtn",
  "rejectSourceBtn"
];
const mutatingTaskActionButtonIds = [
  "runAllBtn",
  "archiveBtn",
  "deleteTaskBtn",
  "writeImageConfigBtn",
  "generateBtn",
  "regenerateImagesBtn",
  "copySourceDraftsBtn",
  "writeBigsellerBtn",
  "discoverBtn",
  "saveBtn",
  "regenerateListingsBtn",
  "saveListingsBtn",
  "sourceCheckBtn",
  "confirmSourceBtn",
  "rejectSourceBtn"
];

document.querySelector("#refreshBtn").addEventListener("click", refreshAll);
apiConfigForm.addEventListener("submit", saveApiConfig);
document.querySelector("#testApiConfigBtn").addEventListener("click", () => loadApiConfig(true));
document.querySelector("#clearApiConfigBtn").addEventListener("click", clearApiConfig);
document.querySelector("#parseQuickBtn").addEventListener("click", parseQuickTask);
document.querySelector("#createRunBtn").addEventListener("click", createAndRunTask);
batchCreateStartBtn.addEventListener("click", createAndStartBatchQueue);
batchPauseBtn.addEventListener("click", () => changeBatchQueue("pause", "已请求暂停队列"));
batchResumeBtn.addEventListener("click", () => changeBatchQueue("resume", "批量队列已继续"));
batchSkipBtn.addEventListener("click", () => changeBatchQueue("skip-current", "已跳过当前项"));
document.querySelector("#reloadProductCodeMapBtn").addEventListener("click", loadProductCodeMap);
document.querySelector("#deleteProductCodeMapBtn").addEventListener("click", deleteProductCodeMap);
document.querySelector("#reloadImageResultsBtn").addEventListener("click", () => loadImageResults(true));
document.querySelector("#reloadArchivedTasksBtn").addEventListener("click", () => loadArchivedTasks(true));
document.querySelector("#reloadImagesBtn").addEventListener("click", loadImages);
document.querySelector("#reloadLogsBtn").addEventListener("click", loadLogs);
document.querySelector("#runAllBtn").addEventListener("click", () => postTaskAction("run-all"));
document.querySelector("#writeImageConfigBtn").addEventListener("click", () => postTaskAction("image2-config"));
document.querySelector("#generateBtn").addEventListener("click", () => postTaskAction("generate"));
document.querySelector("#regenerateImagesBtn").addEventListener("click", () => postTaskAction("regenerate-images"));
document.querySelector("#copySourceDraftsBtn").addEventListener("click", () => postTaskAction("copy-source-drafts", "\u5df2\u63d0\u4ea4 1\u5e97\u590d\u5236\u5230\u76ee\u6807\u5e97\u8349\u7a3f\u7bb1"));
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
  taskImageSearch.value = "";
  await renderTask();
});
taskSearch.addEventListener("input", async () => refreshTasks(selectedTask?.id, false));
showArchived.addEventListener("change", async () => refreshTasks(selectedTask?.id, false));
imageResultSearch.addEventListener("input", () => loadImageResults(false));
showArchivedResults.addEventListener("change", () => loadImageResults(false));
taskImageSearch.addEventListener("input", renderTaskImages);

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createTaskFromForm(false);
});
productCodeMapForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveProductCodeMap();
});

await refreshAll();
setInterval(refreshLiveState, 2000);

async function refreshLiveState() {
  await Promise.all([
    refreshSelectedTaskLive(),
    loadBatchQueue(false)
  ]);
}

async function refreshSelectedTaskLive() {
  if (!selectedTask || liveRefreshInFlight) return;
  const taskId = selectedTask.id;
  const previousStatus = selectedTask.status;
  const previousUpdatedAt = selectedTask.updatedAt;
  liveRefreshInFlight = true;
  setLiveRefreshState("refreshing");
  try {
    const data = await api(`/api/tasks/${taskId}`);
    if (!selectedTask || selectedTask.id !== taskId) return;
    selectedTask = data.task;
    tasks = tasks.map((task) => task.id === taskId ? data.task : task);
    renderTaskSelect();
    renderTaskSummary(selectedTask);
    renderStoreFrameStatus(selectedTask);
    await renderPreflight();
    await renderSourceReview(selectedTask);
    await loadLogs();
    if (previousStatus !== selectedTask.status || previousUpdatedAt !== selectedTask.updatedAt) {
      await loadImages();
      await loadImageResults(false);
    }
    setLiveRefreshState("ready");
  } catch (error) {
    setLiveRefreshState("error");
  } finally {
    liveRefreshInFlight = false;
  }
}

function setLiveRefreshState(state) {
  if (!liveRefreshState) return;
  liveRefreshState.className = `live-refresh-state ${state}`;
  liveRefreshState.textContent = state === "error"
    ? "\u25cf \u81ea\u52a8\u5237\u65b0\u6682\u505c"
    : (state === "refreshing" ? "\u25cf \u6b63\u5728\u5237\u65b0" : "\u25cf \u81ea\u52a8\u5237\u65b0\uff1a2\u79d2");
}

async function loadBatchQueue(notify = false) {
  if (batchQueueRefreshInFlight) return;
  batchQueueRefreshInFlight = true;
  try {
    const data = await api("/api/batch-queue");
    batchQueue = data.queue;
    renderBatchQueue();
    if (notify) toast("批量队列已刷新");
  } catch (error) {
    if (notify) toast(error.message);
  } finally {
    batchQueueRefreshInFlight = false;
  }
}

async function createAndStartBatchQueue() {
  const text = batchTaskText.value.trim();
  const targetStores = selectedTargetStores();
  if (!text) {
    toast("请粘贴商品清单，每行一个 Item ID/SKU");
    batchTaskText.focus();
    return;
  }
  if (!targetStores.length) {
    toast("请先勾选至少一个目标店铺");
    storeChecks.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (batchQueue?.items?.length && !["empty", "done"].includes(batchQueue.status)) {
    if (!window.confirm("当前批量队列尚未完成，确定用新清单替换它吗？已有商品任务不会被删除。")) return;
  }
  batchCreateStartBtn.disabled = true;
  try {
    const data = await api("/api/batch-queue", {
      method: "POST",
      body: JSON.stringify({
        text,
        targetStores,
        notes: taskForm.elements.notes.value,
        start: true
      })
    });
    batchQueue = data.queue;
    renderBatchQueue();
    toast(`批量队列已开始，共 ${batchQueue.items.length} 个商品`);
  } catch (error) {
    toast(error.message);
  } finally {
    renderBatchQueue();
  }
}

async function changeBatchQueue(action, message) {
  const button = action === "pause" ? batchPauseBtn : (action === "resume" ? batchResumeBtn : batchSkipBtn);
  button.disabled = true;
  try {
    const data = await api(`/api/batch-queue/${action}`, { method: "POST" });
    batchQueue = data.queue;
    renderBatchQueue();
    toast(message);
  } catch (error) {
    toast(error.message);
    await loadBatchQueue(false);
  }
}

function renderBatchQueue() {
  if (!batchQueue) return;
  const status = batchQueue.status || "empty";
  const labels = {
    interrupted: "已中断，需确认后继续",
    empty: "未创建",
    ready: "待开始",
    running: "运行中",
    paused: "已暂停",
    done: "已完成"
  };
  batchQueueStatus.className = `batch-status ${escapeHtml(status)}`;
  batchQueueStatus.textContent = labels[status] || status;
  const counts = batchQueue.counts || {};
  batchQueueSummary.innerHTML = batchQueue.items?.length ? `
    <strong>${escapeHtml(batchQueue.lastMessage || "")}</strong>
    <span>共 ${Number(counts.total || 0)} 项 · 完成 ${Number(counts.done || 0)} · 等待 ${Number(counts.waiting || 0)} · 需处理 ${Number(counts.failed || 0)} · 跳过 ${Number(counts.skipped || 0)}</span>
  ` : "尚未创建批量队列。";
  batchQueueItems.innerHTML = (batchQueue.items || []).map((item) => `
    <button class="batch-item ${escapeHtml(item.status)}" type="button" data-task-id="${escapeHtml(item.taskId || "")}" ${item.taskId ? "" : "disabled"}>
      <span class="batch-item-index">${Number(item.index) + 1}</span>
      <span class="batch-item-main">
        <strong>${escapeHtml(item.input)}</strong>
        <small>${escapeHtml(batchItemStatusLabel(item.status))}${item.error ? ` · ${escapeHtml(item.error)}` : ""}</small>
      </span>
    </button>
  `).join("");
  batchQueueItems.querySelectorAll("[data-task-id]").forEach((button) => {
    if (!button.dataset.taskId) return;
    button.addEventListener("click", () => openBatchTask(button.dataset.taskId));
  });
  const runnerBusy = Boolean(batchQueue.runnerActive);
  const active = status === "running" || runnerBusy;
  batchCreateStartBtn.disabled = active;
  batchTaskText.disabled = active;
  batchPauseBtn.disabled = status !== "running";
  batchResumeBtn.disabled = !["paused", "ready"].includes(status) || runnerBusy;
  batchSkipBtn.disabled = status !== "paused" || runnerBusy || !batchQueue.items?.some((item) => !["done", "skipped"].includes(item.status));
}

function batchItemStatusLabel(status) {
  return ({
    waiting: "等待中",
    running: "正在处理",
    done: "已完成",
    failed: "失败，队列已暂停",
    needs_confirmation: "需要人工确认",
    skipped: "已跳过"
  })[status] || status;
}

async function openBatchTask(taskId) {
  taskSearch.value = "";
  await refreshTasks(taskId, false);
  document.querySelector(".work-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

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
  toast("\u5df2\u89e3\u6790\uff0c\u70b9\u4e00\u952e\u5f00\u59cb\u81ea\u52a8\u751f\u6210");
}

async function createAndRunTask() {
  if (isPipelineRunning(selectedTask)) return;
  if (quickTaskInputText()) {
    await parseQuickTask();
  } else if (!taskForm.elements.skuGroup.value.trim()) {
    toast("请先粘贴 Item ID/SKU");
    quickTaskText.focus();
    return;
  }
  await createTaskFromForm(true);
}

function quickTaskInputText() {
  return quickTaskText.value.trim();
}

async function createTaskFromForm(runAll) {
  const payload = readTaskForm();
  if (payload.targetStores.length === 0) {
    toast("请先勾选至少一个目标店铺");
    storeChecks.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const data = await api("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
  selectedTask = data.task;
  pendingParsedTask = null;
  taskForm.reset();
  renderStores();
  setPrimaryPipelineButtonState({ level: runAll ? "running" : "idle" });
  await refreshTasks(selectedTask.id);
  toast(runAll ? "\u4efb\u52a1\u5df2\u521b\u5efa\uff0c\u540e\u53f0\u5f00\u59cb\u81ea\u52a8\u6d41\u7a0b" : "\u4efb\u52a1\u5df2\u521b\u5efa");
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
  return [...storeChecks.querySelectorAll("input[name=targetStores]:checked")].map((input) => input.value);
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
  await loadApiConfig(false);
  stores = storeData.stores;
  storeFrameStatus = frameData;
  productCodeMappings = mapData.mappings || [];
  renderStores();
  renderProductCodeMap();
  await loadBatchQueue(false);
  await refreshTasks(selectedTask?.id ?? (pendingParsedTask ? null : undefined));
  await loadArchivedTasks(false);
  await loadImageResults(false);
}

async function loadApiConfig(notify = false) {
  const data = await api("/api/runtime-config").catch((error) => ({
    config: { baseUrl: "", apiKeySet: false, maskedApiKey: "" },
    runtime: { apiKeySet: false, baseUrl: "", configLoadError: true },
    error: error.message
  }));
  apiRuntime = data.runtime || null;
  renderApiConfig(data);
  if (selectedTask) await renderPreflight();
  if (notify) toast("\u5df2\u91cd\u65b0\u68c0\u6d4b API \u914d\u7f6e");
}

async function saveApiConfig(event) {
  event.preventDefault();
  const payload = {
    baseUrl: apiBaseUrl.value.trim(),
    apiKey: apiKey.value.trim(),
    model: apiModel.value.trim(),
    fallbackBaseUrl: apiFallbackBaseUrl.value.trim(),
    fallbackApiKey: apiFallbackKey.value.trim(),
    fallbackModel: apiFallbackModel.value.trim()
  };
  try {
    const data = await api("/api/runtime-config", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    apiKey.value = "";
    apiFallbackKey.value = "";
    apiRuntime = data.runtime || null;
    renderApiConfig(data);
    if (selectedTask) await renderPreflight();
    toast("API \u914d\u7f6e\u5df2\u4fdd\u5b58");
  } catch (error) {
    toast(error.message);
  }
}

async function clearApiConfig() {
  if (!window.confirm("\u786e\u5b9a\u6e05\u9664\u672c\u673a API \u914d\u7f6e\uff1f")) return;
  const data = await api("/api/runtime-config", { method: "DELETE" });
  apiKey.value = "";
  apiFallbackKey.value = "";
  apiRuntime = data.runtime || null;
  renderApiConfig(data);
  if (selectedTask) await renderPreflight();
  toast("API \u914d\u7f6e\u5df2\u6e05\u9664");
}

function renderApiConfig(data) {
  const config = data.config || {};
  const runtime = data.runtime || {};
  if (config.baseUrl) apiBaseUrl.value = config.baseUrl;
  apiModel.value = config.model || "gpt-image-2.5";
  apiFallbackBaseUrl.value = config.fallbackBaseUrl || "";
  apiFallbackModel.value = config.fallbackModel || config.model || "gpt-image-2.5";
  const state = apiConfigState(runtime);
  apiConfigStatus.className = `api-config-status ${state.className}`;
  apiConfigStatus.innerHTML = `
    <strong>${escapeHtml(state.label)}</strong>
    <span>${escapeHtml(state.message)}</span>
  `;
  if (config.apiKeySource === "environment") {
    apiKeyStatus.textContent = "\u5df2\u4ece\u7cfb\u7edf\u73af\u5883\u53d8\u91cf\u8bfb\u5230 API \u5bc6\u94a5\uff0c\u4e5f\u53ef\u4ee5\u5728\u8fd9\u91cc\u6539\u6210\u672c\u673a\u4fdd\u5b58\u3002";
  } else {
    apiKeyStatus.textContent = config.apiKeySet
      ? `\u5df2\u4fdd\u5b58\u5bc6\u94a5\uff1a${config.maskedApiKey || "****"}`
      : "\u672a\u4fdd\u5b58 API \u5bc6\u94a5\uff0c\u751f\u56fe\u524d\u9700\u8981\u5148\u586b\u5199\u3002";
  }
  if (apiFallbackStatus) {
    apiFallbackStatus.textContent = config.fallbackEnabled
      ? (config.fallbackApiKeySet
        ? `备用线路已启用：${config.fallbackBaseUrl} · ${config.fallbackModel}`
        : "备用中转站缺少 API 密钥，暂不会参与自动切换。")
      : "未启用备用中转站。";
  }
}

function apiConfigState(runtime = {}) {
  if (runtime.configLoadError) {
    return {
      className: "blocked",
      label: "无法读取 API 配置",
      message: "请确认本机网站已启动，然后刷新页面重试"
    };
  }
  if (runtime.invalidBaseUrl) {
    return {
      className: "blocked",
      label: "\u63a5\u53e3 URL \u4e0d\u6b63\u786e",
      message: runtime.baseUrl || "\u8bf7\u586b\u5199\u6b63\u786e\u7684 /v1 \u63a5\u53e3"
    };
  }
  if (!runtime.apiKeySet) {
    return {
      className: "blocked",
      label: "\u672a\u914d\u7f6e API \u5bc6\u94a5",
      message: "\u586b\u5199 URL \u548c API \u5bc6\u94a5\u540e\u70b9\u4fdd\u5b58\u914d\u7f6e"
    };
  }
  if (runtime.localProxyReachable === false) {
    return {
      className: "blocked",
      label: "\u672c\u5730\u4ee3\u7406\u672a\u542f\u52a8",
      message: `\u65e0\u6cd5\u8fde\u63a5 ${runtime.baseUrl}`
    };
  }
  if (runtime.localProxyReachable === true) {
    return {
      className: "ready",
      label: "\u672c\u5730\u4ee3\u7406\u53ef\u7528",
      message: runtime.baseUrl
    };
  }
  return {
    className: "ready",
    label: runtime.failoverEnabled ? "主备中转配置已保存" : "API 配置已保存",
    message: `${runtime.baseUrl || "已配置生图接口"} · ${runtime.model || "gpt-image-2.5"}（未验证实际生图上游）`
  };
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

async function loadArchivedTasks(notify = false) {
  const data = await api("/api/tasks?includeArchived=1");
  archivedTasks = (data.tasks || []).filter((task) => task.archived);
  renderArchivedTasks();
  if (notify) toast("\u5df2\u5237\u65b0\u5df2\u5f52\u6863\u4efb\u52a1");
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
      <input type="checkbox" name="targetStores" value="${store.id}" ${store.defaultSelected === false ? "" : "checked"}>
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
  if (!productCode) return toast("\u8bf7\u5148\u586b\u5199 Item ID");
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
          <button type="button" data-action="regenerate">\u91cd\u751f</button>
          <button type="button" data-action="download">\u4e0b\u8f7d</button>
          <button type="button" data-action="archive">${result.archived ? "\u6062\u590d" : "\u5f52\u6863"}</button>
        </div>
      </div>
      <div class="result-counts">${(result.storeImageCounts || []).map((item) => `
        <span>${escapeHtml(item.storeLabel || item.store)}: ${Number(item.count || 0)}</span>
      `).join("")}</div>
      <div class="result-review">
        <span class="review-state ${escapeHtml(result.imageReview?.status || "pending")}">${escapeHtml(imageReviewStatusLabel(result.imageReview?.status))}</span>
        ${(result.imageReview?.flags || []).map((flag) => `<span class="review-flag">${escapeHtml(imageReviewFlagLabel(flag))}</span>`).join("")}
        ${result.imageReview?.notes ? `<span class="review-note">${escapeHtml(result.imageReview.notes)}</span>` : ""}
      </div>
      <div class="review-actions">
        <button type="button" data-review-status="approved">\u53ef\u7528</button>
        <button type="button" data-review-status="needs_regeneration">\u5efa\u8bae\u91cd\u751f</button>
        <button type="button" data-review-status="delivered">\u5df2\u4ea4\u4ed8</button>
        <button type="button" data-review-flag="layout_similar">\u6784\u56fe\u592a\u50cf</button>
        <button type="button" data-review-flag="color_similar">\u989c\u8272\u592a\u50cf</button>
      </div>
      ${renderStorePreviewGroups(result)}
    </article>
  `).join("");
  imageResultsEl.querySelectorAll(".result-card").forEach((card) => {
    card.querySelector("[data-action=select]")?.addEventListener("click", () => selectImageResultTask(card.dataset.taskId));
    card.querySelector("[data-action=download]")?.addEventListener("click", () => {
      window.location.href = `/api/tasks/${card.dataset.taskId}/download`;
    });
    card.querySelector("[data-action=regenerate]")?.addEventListener("click", () => regenerateImageResultTask(card.dataset.taskId));
    card.querySelector("[data-action=archive]")?.addEventListener("click", () => archiveImageResultTask(card.dataset.taskId));
    card.querySelectorAll("[data-review-status]").forEach((button) => {
      button.addEventListener("click", () => updateImageReview(card.dataset.taskId, { status: button.dataset.reviewStatus, flags: [] }));
    });
    card.querySelectorAll("[data-review-flag]").forEach((button) => {
      button.addEventListener("click", () => updateImageReview(card.dataset.taskId, {
        status: "needs_regeneration",
        flags: [button.dataset.reviewFlag]
      }));
    });
  });
}

function renderStorePreviewGroups(result) {
  const groups = result.storePreviewGroups || [];
  if (groups.length) {
    return `
      <div class="store-preview-groups">${groups.map((group) => `
        <section class="store-preview-group">
          <div class="store-preview-title">
            <strong>${escapeHtml(group.storeLabel || group.store)}</strong>
            <span>${Number(group.count || 0)} \u5f20</span>
          </div>
          <div class="store-preview-images">${(group.previewImages || []).map((image) => `
            <a href="${image.url}" target="_blank" rel="noreferrer" title="${escapeHtml(image.file)}">
              <img src="${image.url}&t=${Date.now()}" alt="${escapeHtml(image.file)}">
            </a>
          `).join("")}</div>
        </section>
      `).join("")}</div>
    `;
  }
  return `
    <div class="result-previews">${(result.previewImages || []).map((image) => `
      <a href="${image.url}" target="_blank" rel="noreferrer" title="${escapeHtml(image.file)}">
        <img src="${image.url}&t=${Date.now()}" alt="${escapeHtml(image.file)}">
      </a>
    `).join("")}</div>
  `;
}

async function renderTask() {
  const displayTask = selectedTask || pendingDisplayTask();
  emptyState.hidden = Boolean(displayTask);
  taskView.hidden = !displayTask;
  setTaskActionButtonsDisabled(!selectedTask);
  setPrimaryPipelineButtonState();
  if (!displayTask) {
    emptyState.textContent = "\u6682\u65e0\u4efb\u52a1";
    return;
  }

  renderTaskSummary(displayTask);
  document.querySelector("#archiveBtn").textContent = displayTask.archived ? "\u53d6\u6d88\u5f52\u6863" : "\u5f52\u6863\u4efb\u52a1";
  renderStoreFrameStatus(displayTask);
  await renderPreflight();
  await renderSourceReview(displayTask);
  renderListings(displayTask);
  if (selectedTask) {
    await loadImages();
    await loadLogs();
  } else {
    taskImages = [];
    imageGrid.innerHTML = '<div class="empty">\u521b\u5efa\u4efb\u52a1\u540e\u751f\u6210\u56fe\u7247</div>';
    logs.textContent = "\u5df2\u89e3\u6790\u5230\u5de6\u4fa7\u8868\u5355\u3002\u8bf7\u70b9\u51fb\u201c\u521b\u5efa\u5e76\u4e00\u952e\u5168\u6d41\u7a0b\u201d\uff0c\u624d\u4f1a\u771f\u6b63\u751f\u6210\u56fe\u7247\u5e76\u5904\u7406 BigSeller \u8349\u7a3f\u3002";
  }
}

function renderTaskSummary(displayTask) {
  document.querySelector("#taskProduct").textContent = displayTask.productName;
  document.querySelector("#taskSkus").textContent = taskIdentifierText(displayTask);
  const taskStatus = document.querySelector("#taskStatus");
  taskStatus.textContent = taskStatusLabel(displayTask.status);
  taskStatus.className = `task-status ${taskStatusTone(displayTask.status)}`;
  document.querySelector("#taskArchived").textContent = selectedTask ? (displayTask.archived ? "\u5df2\u5f52\u6863" : "\u6d3b\u8dc3") : "\u672a\u521b\u5efa";
}

function taskStatusLabel(status) {
  const labels = {
    created: "\u5df2\u521b\u5efa",
    fetching_source_images: "\u6b63\u5728\u68c0\u7d22 1\u5e97\u6765\u6e90",
    source_config_ready: "\u5df2\u51c6\u5907\uff0c\u7b49\u5f85\u5f00\u59cb",
    source_review_required: "\u7b49\u5f85\u786e\u8ba4\u6765\u6e90",
    source_lookup_failed: "\u6765\u6e90\u68c0\u7d22\u5931\u8d25",
    source_confirmed: "\u6765\u6e90\u5df2\u786e\u8ba4",
    source_auto_confirmed: "\u6765\u6e90\u5df2\u81ea\u52a8\u786e\u8ba4",
    source_rejected: "\u6765\u6e90\u4e0d\u5339\u914d",
    image2_config_ready: "\u751f\u56fe\u914d\u7f6e\u5df2\u51c6\u5907",
    bigseller_config_ready: "BigSeller \u914d\u7f6e\u5df2\u51c6\u5907",
    bigseller_copy_config_ready: "\u590d\u5236\u8349\u7a3f\u5df2\u51c6\u5907",
    listings_updated: "\u6587\u6848\u5df2\u66f4\u65b0",
    listings_regenerated: "\u6587\u6848\u5df2\u91cd\u65b0\u751f\u6210",
    generating_images: "\u6b63\u5728\u751f\u6210\u56fe\u7247",
    regenerating_images: "\u6b63\u5728\u91cd\u65b0\u751f\u56fe",
    discovering_bigseller_drafts: "\u6b63\u5728\u67e5\u627e BigSeller \u8349\u7a3f",
    copying_source_to_bigseller_drafts: "\u6b63\u5728\u590d\u5236\u8349\u7a3f",
    saving_bigseller_drafts: "\u6b63\u5728\u4fdd\u5b58 BigSeller \u8349\u7a3f",
    pipeline_queued: "\u5df2\u8fdb\u5165\u5904\u7406\u961f\u5217",
    pipeline_copying_source_to_bigseller_drafts: "\u6b63\u5728\u590d\u5236\u8349\u7a3f",
    pipeline_generating_images: "\u6b63\u5728\u751f\u6210\u56fe\u7247",
    pipeline_discovering_bigseller_drafts: "\u6b63\u5728\u67e5\u627e BigSeller \u8349\u7a3f",
    pipeline_saving_bigseller_drafts: "\u6b63\u5728\u4fdd\u5b58 BigSeller \u8349\u7a3f",
    pipeline_done: "\u5168\u6d41\u7a0b\u5df2\u5b8c\u6210",
    pipeline_failed: "\u5168\u6d41\u7a0b\u5931\u8d25",
    preflight_blocked: "\u68c0\u67e5\u672a\u901a\u8fc7",
    image2_preflight_failed: "\u751f\u56fe\u68c0\u67e5\u5931\u8d25"
  };
  const value = String(status || "");
  if (labels[value]) return labels[value];
  if (value.endsWith("_done")) return "\u6b65\u9aa4\u5df2\u5b8c\u6210";
  if (value.endsWith("_failed")) return "\u6267\u884c\u5931\u8d25";
  return value ? value.replaceAll("_", " ") : "\u672a\u77e5";
}

function taskStatusTone(status) {
  const value = String(status || "");
  if (/failed|blocked|rejected|interrupted/.test(value)) return "error";
  if (/queued|fetching|generating|copying|discovering|saving/.test(value)) return "running";
  if (/done|confirmed|updated|ready/.test(value)) return "ready";
  return "neutral";
}

async function renderPreflight() {
  const panel = document.querySelector("#preflightPanel");
  const progressPanel = document.querySelector("#pipelineProgressPanel");
  if (!panel) return;
  if (!selectedTask) {
    panel.innerHTML = "";
    if (progressPanel) progressPanel.innerHTML = "";
    return;
  }
  const data = await api(`/api/tasks/${selectedTask.id}/preflight`).catch((error) => ({
    preflight: {
      status: "blocked",
      blockers: [{ id: "preflight_error", label: "\u603b\u68c0\u67e5\u5931\u8d25", message: error.message }],
      warnings: [],
      checks: []
    },
    progress: {
      stage: "blocked",
      level: "error",
      label: "\u72b6\u6001\u8bfb\u53d6\u5931\u8d25",
      message: error.message,
      nextAction: "\u5237\u65b0\u540e\u91cd\u8bd5\u3002"
    }
  }));
  const preflight = data.preflight || {};
  renderPipelineProgress(data.progress);
  setPrimaryPipelineButtonState(data.progress);
  setTaskActionButtonsDisabled(!selectedTask, data.progress);
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

function renderPipelineProgress(progress) {
  const panel = document.querySelector("#pipelineProgressPanel");
  if (!panel) return;
  if (!progress) {
    panel.innerHTML = "";
    return;
  }
  const metrics = pipelineMetrics(progress);
  const visibleStatus = pipelineVisibleStatus(progress);
  panel.innerHTML = `
    <div class="pipeline-progress-head">
      <div>
        <span>\u5f53\u524d\u6d41\u7a0b</span>
        <strong>${escapeHtml(visibleStatus.label)}</strong>
      </div>
      <span class="pipeline-progress-state ${escapeHtml(visibleStatus.level)}">${escapeHtml(visibleStatus.stageLabel)}</span>
    </div>
    <div class="pipeline-metrics">
      <div>
        <span>\u603b\u7528\u65f6</span>
        <strong>${escapeHtml(metrics.total)}</strong>
      </div>
      <div>
        <span>\u5f53\u524d\u6b65\u9aa4</span>
        <strong>${escapeHtml(metrics.current)}</strong>
      </div>
      <div>
        <span>\u66f4\u65b0</span>
        <strong>${escapeHtml(formatDateTime(selectedTask?.updatedAt))}</strong>
      </div>
    </div>
    <ol class="pipeline-steps">
      ${pipelineSteps(progress).map((step, index) => `
        <li class="pipeline-step-card ${escapeHtml(step.state)}">
          <span class="pipeline-step-index">${index + 1}</span>
          <strong>${escapeHtml(step.label)}</strong>
          <em>${escapeHtml(pipelineStepStateLabel(step.state))}</em>
          <small>${escapeHtml(formatPipelineStepDuration(step, progress.timing))}</small>
          <p>${escapeHtml(step.hint)}</p>
        </li>
      `).join("")}
    </ol>
    <div class="pipeline-progress-body">
      <p>${escapeHtml(visibleStatus.message)}</p>
      <div class="pipeline-next-action ${escapeHtml(visibleStatus.level)}">
        <span>\u4e0b\u4e00\u6b65</span>
        <strong>${escapeHtml(visibleStatus.nextAction)}</strong>
        ${visibleStatus.level === "error" && !progress?.timing?.interrupted ? '<em>\u4fee\u590d\u65e5\u5fd7\u4e2d\u7684\u9519\u8bef\u540e\uff0c\u70b9\u201c\u4e00\u952e\u5f00\u59cb/\u7ee7\u7eed\u81ea\u52a8\u6d41\u7a0b\u201d\u91cd\u8bd5\u3002</em>' : ""}
      </div>
      ${progress.stage === "done" ? '<div class="pipeline-done-banner">\u5df2\u4fdd\u5b58\u5230 BigSeller \u8349\u7a3f\u7bb1</div>' : ""}
    </div>
  `;
}

function isPipelineRunning(taskOrProgress = selectedTask) {
  const status = String(taskOrProgress?.status || taskOrProgress?.stage || "");
  return [
    "pipeline_queued",
    "pipeline_waiting_image_api",
    "fetching_source_images",
    "pipeline_copying_source_to_bigseller_drafts",
    "copying_source_to_bigseller_drafts",
    "pipeline_generating_images",
    "generating_images",
    "regenerating_images",
    "pipeline_discovering_bigseller_drafts",
    "discovering_bigseller_drafts",
    "pipeline_saving_bigseller_drafts",
    "saving_bigseller_drafts"
  ].includes(status);
}

function setPrimaryPipelineButtonState(progress = null) {
  const running = isPipelineRunning(selectedTask) || isPipelineRunning(progress);
  const runAllBtn = document.querySelector("#runAllBtn");
  const createRunBtn = document.querySelector("#createRunBtn");
  if (runAllBtn) {
    runAllBtn.disabled = !selectedTask || running;
    runAllBtn.textContent = running ? "\u6d41\u7a0b\u8fd0\u884c\u4e2d" : pipelineActionLabel(selectedTask);
  }
  if (createRunBtn) {
    createRunBtn.disabled = isPipelineRunning(selectedTask);
    createRunBtn.textContent = isPipelineRunning(selectedTask) ? "\u6d41\u7a0b\u8fd0\u884c\u4e2d" : "\u521b\u5efa\u5e76\u5f00\u59cb";
  }
}

function pipelineActionLabel(task) {
  const status = String(task?.status || "");
  if (status === "pipeline_done") return "\u6d41\u7a0b\u5df2\u5b8c\u6210";
  const hasProgress = Boolean(task?.pipelineTiming?.startedAt)
    || (Array.isArray(task?.sourceImages) && task.sourceImages.length > 0)
    || !["", "created", "source_config_ready"].includes(status);
  return hasProgress ? "\u4e00\u952e\u7ee7\u7eed\u5168\u6d41\u7a0b" : "\u4e00\u952e\u5f00\u59cb\u5168\u6d41\u7a0b";
}

function pipelineStepDefinitions() {
  return [
    { id: "source_lookup", label: "1\u5e97\u68c0\u7d22", hint: "\u6309 Item ID/SKU \u627e\u6e90\u5546\u54c1" },
    { id: "source_review", label: "\u6765\u6e90\u786e\u8ba4", hint: "\u4eba\u5de5\u786e\u8ba4\u5546\u54c1\u662f\u540c\u4e00\u6b3e" },
    { id: "bigseller_copy", label: "\u590d\u5236\u8349\u7a3f", hint: "\u590d\u5236 1 \u5e97\u5230\u5df2\u9009\u76ee\u6807\u5e97\u94fa" },
    { id: "image_generation", label: "\u751f\u6210\u56fe\u7247", hint: "\u6309\u5404\u5e97\u98ce\u683c\u751f\u6210\u56fe" },
    { id: "bigseller_discover", label: "\u67e5\u627e\u8349\u7a3f", hint: "\u5339\u914d\u5df2\u9009\u76ee\u6807\u5e97\u94fa\u8349\u7a3f\u94fe\u63a5" },
    { id: "bigseller_save", label: "\u4fdd\u5b58\u8349\u7a3f", hint: "\u4e0a\u4f20\u56fe\u7247\u5e76\u70b9\u767d\u8272\u4fdd\u5b58" },
    { id: "done", label: "\u5b8c\u6210", hint: "\u5230\u7ed3\u679c\u5e93\u68c0\u67e5\u56fe\u7247" }
  ];
}

function pipelineSteps(progress) {
  const steps = progress?.timing?.scope === "images_only"
    ? pipelineStepDefinitions().filter((step) => step.id === "image_generation")
    : pipelineStepDefinitions();
  const currentIndex = steps.findIndex((step) => step.id === progress?.stage);
  if (progress?.stage === "done") return steps.map((step) => ({ ...step, state: "done" }));
  return steps.map((step, index) => {
    return { ...step, state: pipelineStepDisplayState(step, progress, index, currentIndex, steps) };
  });
}

function pipelineStepDisplayState(step, progress, index, currentIndex, steps = pipelineStepDefinitions()) {
  const timing = progress?.timing || {};
  const hasError = progress?.level === "error" || progress?.stage === "failed" || progress?.stage === "blocked";
  if (hasError) {
    const failedStage = pipelineFailedStage(timing);
    const failedIndex = steps.findIndex((candidate) => candidate.id === failedStage);
    if (step.id === failedStage) return "error";
    if (failedIndex > index) return "done";
    if (timing?.stages?.[step.id]?.finishedAt) return "done";
    return "todo";
  }
  if (index === currentIndex && progress?.level === "running") return "active";
  if (timing?.stages?.[step.id]?.finishedAt) return "done";
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "active";
  return "todo";
}

function pipelineVisibleStatus(progress = {}) {
  const hasError = progress?.level === "error" || progress?.stage === "failed" || progress?.stage === "blocked";
  if (hasError) {
    if (progress?.timing?.interrupted) return {
      level: "error", stageLabel: "已中断", label: "流程已中断",
      message: progress.message, nextAction: progress.nextAction
    };
    const failedStage = pipelineFailedStage(progress?.timing);
    const failedLabel = pipelineStepLabel(failedStage);
    const message = [
      failedLabel ? `\u5931\u8d25\u9636\u6bb5\uff1a${failedLabel}\u3002` : "\u5931\u8d25\u9636\u6bb5\uff1a\u6682\u672a\u8bc6\u522b\u3002",
      progress.message || "\u540e\u53f0\u6d41\u7a0b\u5931\u8d25\u6216\u88ab\u9884\u68c0\u62e6\u622a\uff0c\u8bf7\u67e5\u770b\u65e5\u5fd7\u4e2d\u7684\u5931\u8d25\u539f\u56e0\u3002"
    ].join(" ");
    return {
      level: "error",
      stageLabel: "\u672a\u5b8c\u6210",
      label: "\u6d41\u7a0b\u672a\u5b8c\u6210",
      message,
      nextAction: progress.nextAction || "\u4fee\u590d\u95ee\u9898\u540e\u518d\u70b9\u4e00\u952e\u5f00\u59cb/\u7ee7\u7eed\u81ea\u52a8\u6d41\u7a0b\u3002"
    };
  }
  return {
    level: progress.level || "idle",
    stageLabel: progressStageLabel(progress.stage),
    label: progress.label || "\u672a\u77e5\u72b6\u6001",
    message: progress.message || "",
    nextAction: progress.nextAction || "\u67e5\u770b\u65e5\u5fd7\u6216\u5237\u65b0\u72b6\u6001\u3002"
  };
}

function pipelineFailedStage(timing = {}) {
  const activeStage = timing?.activeStage;
  const workStageIds = pipelineStepDefinitions().map((step) => step.id).filter((id) => id !== "done");
  if (workStageIds.includes(activeStage)) return activeStage;
  for (let index = workStageIds.length - 1; index >= 0; index -= 1) {
    const stageId = workStageIds[index];
    if (timing?.stages?.[stageId]?.startedAt) return stageId;
  }
  return "";
}

function pipelineStepLabel(stageId) {
  return pipelineStepDefinitions().find((step) => step.id === stageId)?.label || "";
}

function pipelineMetrics(progress) {
  const timing = progress?.timing || {};
  if (!timing.startedAt && progress?.stage === "done") {
    return {
      total: "\u5df2\u5b8c\u6210\uff08\u65e7\u4efb\u52a1\u672a\u8bb0\u5f55\u8017\u65f6\uff09",
      current: "\u5df2\u5b8c\u6210"
    };
  }
  const activeStage = timing.activeStage || progress?.stage;
  const activeTiming = timing.stages?.[activeStage];
  return {
    total: formatPipelineDuration(timing.startedAt, timing.finishedAt),
    current: progress?.stage === 'done' ? '已完成' : progress?.level === "error"
      ? "\u5df2\u505c\u6b62"
      : (activeTiming ? formatPipelineDuration(activeTiming.startedAt, activeTiming.finishedAt) : "\u672a\u5f00\u59cb")
  };
}

function formatPipelineStepDuration(step, timing = {}) {
  if (step.id === 'done' && step.state === 'done') return '已完成';
  const stageTiming = timing?.stages?.[step.id];
  if (!stageTiming?.startedAt) {
    if (step.state === "done") return "\u5df2\u5b8c\u6210";
    if (step.state === "todo") return "\u5f85\u5904\u7406";
    return "\u6682\u65e0\u8bb0\u5f55";
  }
  return formatPipelineDuration(stageTiming.startedAt, stageTiming.finishedAt || timing.finishedAt);
}

function formatPipelineDuration(startedAt, finishedAt) {
  if (!startedAt) return "\u672a\u5f00\u59cb";
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "\u8ba1\u65f6\u4e2d";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}\u79d2`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (minutes < 60) return restSeconds ? `${minutes}\u5206${restSeconds}\u79d2` : `${minutes}\u5206`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours}\u5c0f\u65f6${restMinutes}\u5206` : `${hours}\u5c0f\u65f6`;
}

function pipelineStepStateLabel(state) {
  if (state === "done") return "\u5df2\u5b8c\u6210";
  if (state === "active") return "\u6b63\u5728\u5904\u7406";
  if (state === "error") return "\u9700\u5904\u7406";
  return "\u5f85\u5904\u7406";
}

function progressStageLabel(stage) {
  if (stage === "source_lookup") return "1\u5e97\u68c0\u7d22";
  if (stage === "source_review") return "1\u5e97\u786e\u8ba4";
  if (stage === "image_generation") return "\u751f\u56fe";
  if (stage === "bigseller_copy") return "\u590d\u5236\u8349\u7a3f";
  if (stage === "bigseller_discover") return "\u67e5\u627e\u8349\u7a3f";
  if (stage === "bigseller_save") return "\u4fdd\u5b58\u8349\u7a3f";
  if (stage === "done") return "\u5b8c\u6210";
  if (stage === "failed" || stage === "blocked") return "\u9700\u5904\u7406";
  if (stage === "ready") return "\u5c31\u7eea";
  return "\u51c6\u5907";
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
        <button id="confirmSourceBtn" type="button" ${images.length ? "" : "disabled"}>\u786e\u8ba4\u5e76\u7ee7\u7eed</button>
        <button id="rejectSourceBtn" class="danger" type="button" ${images.length ? "" : "disabled"}>\u4e0d\u5bf9</button>
      </div>
    </div>
    <div class="source-meta">
      <div><span>Item ID/SKU</span><strong>${escapeHtml(taskIdentifierText(displayTask))}</strong></div>
      <div><span>1\u5e97\u6807\u9898</span><strong>${escapeHtml(review.title || selectedTask.sourceTitle || "\u5c1a\u672a\u68c0\u7d22")}</strong></div>
      <div><span>\u7f16\u8f91\u94fe\u63a5</span>${review.editUrl ? `<a href="${escapeHtml(review.editUrl)}" target="_blank" rel="noreferrer">\u6253\u5f00 1\u5e97\u5546\u54c1</a>` : "<strong>\u6682\u65e0</strong>"}</div>
    </div>
    <div class="source-risk-detail">
      <span>\u5339\u914d\u8bc1\u636e</span>
      <strong>${escapeHtml(sourceRiskMessage(review, risk))}</strong>
      <em>${escapeHtml((risk.matchedSkus || []).length ? `Item ID/SKU: ${risk.matchedSkus.join(" ")}` : "\u672a\u5339\u914d\u5230 Item ID/SKU")}</em>
    </div>
    <div class="source-image-grid">${images.length ? images.map((image) => `
      <div class="source-image-item">
        <img src="${image.url}&t=${Date.now()}" alt="${escapeHtml(image.file)}">
        <span>${escapeHtml(image.file)}</span>
      </div>
    `).join("") : '<div class="empty">\u5c1a\u672a\u83b7\u53d6 1\u5e97\u6765\u6e90\u56fe</div>'}</div>
  `;
  document.querySelector("#sourceCheckBtn")?.addEventListener("click", () => postTaskAction("source-check", "\u5df2\u63d0\u4ea4 1\u5e97\u68c0\u7d22"));
  document.querySelector("#confirmSourceBtn")?.addEventListener("click", () => postTaskAction("confirm-source-and-run", "\u5df2\u786e\u8ba4\uff0c\u81ea\u52a8\u6d41\u7a0b\u7ee7\u7eed\u8fd0\u884c"));
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
  if (level === "high") return "\u672a\u68c0\u6d4b\u5230 SKU";
  return "\u672a\u68c0\u67e5";
}

function sourceRiskMessage(review, risk) {
  if (risk?.level === "high" && review?.status === "confirmed") {
    return "\u5df2\u4eba\u5de5\u786e\u8ba4\uff0c\u4f46\u7cfb\u7edf\u672a\u68c0\u6d4b\u5230 SKU \u8bc1\u636e\u3002";
  }
  if (risk?.level === "high") {
    return "\u672a\u68c0\u6d4b\u5230 SKU \u8bc1\u636e\uff0c\u8bf7\u5148\u4eba\u5de5\u786e\u8ba4 1 \u5e97\u5546\u54c1\u3002";
  }
  return risk?.message || "\u5c1a\u65e0\u5339\u914d\u8bc1\u636e";
}

function taskIdentifierText(task) {
  const skuText = skuListFromValue(task?.skuGroup).join(" ");
  const productCodeText = (task?.productCodes || []).join(" ");
  return productCodeText ? `${productCodeText} -> ${skuText}` : skuText;
}

function skuListFromValue(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(/[\s,，]+/)
    .map((sku) => sku.trim())
    .filter(Boolean);
}

function pendingDisplayTask() {
  if (!pendingParsedTask) return null;
  const skuGroup = skuListFromValue(pendingParsedTask.skuGroup);
  const skuText = skuGroup.join(" ");
  const targetStores = selectedTargetStores();
  return {
    productName: pendingParsedTask.productName || skuText || "\u5f85\u4ece 1 \u5e97\u6293\u53d6",
    skuGroup,
    targetStores,
    archived: false,
    status: "\u5f85\u521b\u5efa\uff0c\u5df2\u89e3\u6790",
    listings: Object.fromEntries(targetStores.map((storeId) => [storeId, {
      title: "\u521b\u5efa\u540e\u751f\u6210\u8be5\u5e97\u94fa\u7684 90-99 \u5b57\u6807\u9898",
      detail: "\u521b\u5efa\u540e\u751f\u6210\u8be5\u5e97\u94fa\u7684\u8d8a\u5357\u8bed\u8be6\u60c5\u3002\u54c1\u724c\u548c\u54c1\u540d\u4fdd\u7559\u82f1\u6587\uff0c\u529f\u6548\u5356\u70b9\u7528\u8d8a\u5357\u8bed\u3002"
    }]))
  };
}

function setTaskActionButtonsDisabled(disabled, progress = null) {
  const running = isPipelineRunning(selectedTask) || isPipelineRunning(progress);
  taskActionButtonIds.forEach((id) => {
    const button = document.querySelector(`#${id}`);
    if (button) button.disabled = disabled || (running && mutatingTaskActionButtonIds.includes(id));
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
  const auditWarnings = displayTask.listingAudit?.warnings || [];
  listingEditors.innerHTML = (auditWarnings.length ? `<div class="listing-audit-warning">${auditWarnings.map(escapeHtml).join('<br>')}</div>` : '') + displayTask.targetStores.map((storeId) => {
    const store = stores.find((item) => item.id === storeId);
    const listing = displayTask.listings?.[storeId] || { title: "", detail: "" };
    const titleCount = titleLength(listing.title);
    return `
      <div class="listing-editor" data-store="${escapeHtml(storeId)}">
        <h4>${escapeHtml(store?.label || storeId)}</h4>
        <label>
          &#26631;&#39064;
          <textarea data-field="title" rows="3">${escapeHtml(listing.title)}</textarea>
        </label>
        <div class="count ${titleCount < 90 || titleCount > 100 ? "bad" : ""}">${titleCount}/100（须为 90–100 字符）</div>
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
      const titleCount = titleLength(textarea.value);
      count.textContent = `${titleCount}/100（须为 90–100 字符）`;
      count.classList.toggle("bad", titleCount < 90 || titleCount > 100);
    });
  });
}

function titleLength(value) {
  return Array.from(String(value || "").normalize("NFC")).length;
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
    if (action === "run-all" || action === "confirm-source-and-run") {
      setPrimaryPipelineButtonState({ level: "running" });
    }
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
  await loadArchivedTasks(false);
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
  await loadArchivedTasks(false);
  await loadImageResults(false);
  toast(action === "archive" ? "\u7ed3\u679c\u5df2\u5f52\u6863" : "\u7ed3\u679c\u5df2\u6062\u590d");
}

async function openArchivedTask(taskId) {
  showArchived.checked = true;
  const data = await api(`/api/tasks/${taskId}`);
  selectedTask = data.task;
  pendingParsedTask = null;
  await refreshTasks(taskId, false);
}

async function restoreArchivedTask(taskId) {
  const data = await api(`/api/tasks/${taskId}/unarchive`, { method: "POST" });
  if (selectedTask?.id === taskId) selectedTask = data.task;
  await refreshTasks(selectedTask?.id || taskId, false);
  await loadArchivedTasks(false);
  await loadImageResults(false);
  toast("\u4efb\u52a1\u5df2\u6062\u590d");
}

async function regenerateImageResultTask(taskId) {
  try {
    const data = await api(`/api/tasks/${taskId}/regenerate-images`, { method: "POST" });
    if (selectedTask?.id === taskId) selectedTask = data.task;
    await refreshTasks(selectedTask?.id, false);
    await loadImageResults(false);
    toast("\u5df2\u6309\u8d28\u68c0\u6807\u8bb0\u63d0\u4ea4\u91cd\u751f");
  } catch (error) {
    toast(error.message);
  }
}

async function updateImageReview(taskId, review) {
  const data = await api(`/api/tasks/${taskId}/image-review`, {
    method: "PUT",
    body: JSON.stringify(review)
  });
  if (selectedTask?.id === taskId) selectedTask = data.task;
  await refreshTasks(selectedTask?.id, false);
  await loadImageResults(false);
  toast("\u8d28\u68c0\u6807\u8bb0\u5df2\u4fdd\u5b58");
}

async function deleteSelectedTask() {
  if (!selectedTask) return;
  const message = `\u786e\u5b9a\u5220\u9664\u4efb\u52a1\uff1a${selectedTask.productName}\uff1f\n\n\u8fd9\u4f1a\u5220\u9664\u8be5\u4efb\u52a1\u76ee\u5f55\u4e0b\u7684\u56fe\u7247\u3001\u6587\u6848\u548c\u65e5\u5fd7\u3002`;
  if (!window.confirm(message)) return;
  const deletedId = selectedTask.id;
  await api(`/api/tasks/${deletedId}`, { method: "DELETE" });
  selectedTask = null;
  await refreshTasks(undefined, false);
  await loadArchivedTasks(false);
  await loadImageResults(false);
  toast("\u4efb\u52a1\u5df2\u5220\u9664");
}

async function deleteArchivedTask(taskId) {
  const task = archivedTasks.find((item) => item.id === taskId);
  const label = task?.productName || taskIdentifierText(task) || taskId;
  const message = `\u786e\u5b9a\u5220\u9664\u5df2\u5f52\u6863\u4efb\u52a1\uff1a${label}\uff1f\n\n\u8fd9\u4f1a\u5220\u9664\u8be5\u4efb\u52a1\u76ee\u5f55\u4e0b\u7684\u56fe\u7247\u3001\u6587\u6848\u548c\u65e5\u5fd7\u3002`;
  if (!window.confirm(message)) return;
  await api(`/api/tasks/${taskId}`, { method: "DELETE" });
  if (selectedTask?.id === taskId) selectedTask = null;
  await refreshTasks(selectedTask?.id, false);
  await loadArchivedTasks(false);
  await loadImageResults(false);
  toast("\u5df2\u5220\u9664\u5df2\u5f52\u6863\u4efb\u52a1");
}

function downloadSelectedTask() {
  if (!selectedTask) return;
  window.location.href = `/api/tasks/${selectedTask.id}/download`;
}

async function loadImages() {
  if (!selectedTask) return;
  const data = await api(`/api/tasks/${selectedTask.id}/images`);
  taskImages = data.images || [];
  const progressPanel = document.querySelector('#imageSlotProgress');
  const labels = { done: '已完成', active: '生成中', interrupted: '已中断', blocked: '失败待处理', retry: '待重试', pending: '待生成' };
  if (progressPanel) progressPanel.innerHTML = (data.progress || []).map(store => `<div class="image-slot-row"><strong>${escapeHtml(store.label)} · ${store.slots.filter(slot => slot.state === 'done').length}/4</strong><span>${store.slots.map((slot, i) => `${i + 1}：${labels[slot.state] || '待生成'}${slot.attempts ? `（已请求${slot.attempts}次）` : ''}`).join('　')}</span></div>`).join('');
  renderTaskImages();
}

function renderTaskImages() {
  const filteredImages = taskImages.filter((image) => taskImageMatchesSearch(image, taskImageSearch.value));
  if (!taskImages.length) {
    imageGrid.innerHTML = '<div class="empty">&#26242;&#26080;&#22270;&#29255;</div>';
    return;
  }
  if (!filteredImages.length) {
    imageGrid.innerHTML = '<div class="empty">\u6ca1\u6709\u5339\u914d\u7684\u5f53\u524d\u56fe\u7247</div>';
    return;
  }
  const cacheKey = Date.now();
  imageGrid.innerHTML = filteredImages.map((image) => `
    <div class="image-item">
      <img src="${image.url}&t=${cacheKey}" alt="${escapeHtml(image.file)}">
      <span>${escapeHtml(image.storeLabel)} &middot; ${escapeHtml(image.file)}</span>
    </div>
  `).join("");
}

function renderArchivedTasks() {
  if (!archivedTaskList) return;
  if (!archivedTasks.length) {
    archivedTaskList.innerHTML = '<div class="empty small">\u6682\u65e0\u5df2\u5f52\u6863\u4efb\u52a1</div>';
    return;
  }
  archivedTaskList.innerHTML = archivedTasks.map((task) => `
    <article class="archived-task-row" data-task-id="${escapeHtml(task.id)}">
      <div>
        <strong>${escapeHtml(task.productName || taskIdentifierText(task))}</strong>
        <span>${escapeHtml(taskIdentifierText(task))} &middot; ${escapeHtml(task.status)} &middot; ${escapeHtml(formatDateTime(task.archivedAt || task.updatedAt || task.createdAt))}</span>
      </div>
      <div class="archived-task-actions">
        <button type="button" data-archive-action="open">\u6253\u5f00</button>
        <button type="button" data-archive-action="restore">\u6062\u590d</button>
        <button class="danger" type="button" data-archive-action="delete">\u5220\u9664</button>
      </div>
    </article>
  `).join("");
  archivedTaskList.querySelectorAll(".archived-task-row").forEach((row) => {
    row.querySelector('[data-archive-action="open"]')?.addEventListener("click", () => openArchivedTask(row.dataset.taskId));
    row.querySelector('[data-archive-action="restore"]')?.addEventListener("click", () => restoreArchivedTask(row.dataset.taskId));
    row.querySelector('[data-archive-action="delete"]')?.addEventListener("click", () => deleteArchivedTask(row.dataset.taskId));
  });
}

function taskImageMatchesSearch(image, query = "") {
  const terms = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const searchable = [
    image.file,
    image.store,
    image.store ? `store:${image.store}` : "",
    image.storeLabel
  ].filter(Boolean).join(" ").toLowerCase();
  return terms.every((term) => searchable.includes(term));
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

function imageReviewStatusLabel(status) {
  if (status === "approved") return "\u53ef\u7528";
  if (status === "needs_regeneration") return "\u5efa\u8bae\u91cd\u751f";
  if (status === "delivered") return "\u5df2\u4ea4\u4ed8";
  return "\u5f85\u8d28\u68c0";
}

function imageReviewFlagLabel(flag) {
  if (flag === "layout_similar") return "\u6784\u56fe\u592a\u50cf";
  if (flag === "color_similar") return "\u989c\u8272\u592a\u50cf";
  if (flag === "quality_issue") return "\u8d28\u91cf\u95ee\u9898";
  if (flag === "wrong_product") return "\u5546\u54c1\u4e0d\u5bf9";
  return flag;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
