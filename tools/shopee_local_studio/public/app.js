let stores = [];
let tasks = [];
let selectedTask = null;
let pendingParsedTask = null;

const taskForm = document.querySelector("#taskForm");
const storeChecks = document.querySelector("#storeChecks");
const taskSelect = document.querySelector("#taskSelect");
const taskView = document.querySelector("#taskView");
const emptyState = document.querySelector("#emptyState");
const listingEditors = document.querySelector("#listingEditors");
const imageGrid = document.querySelector("#imageGrid");
const logs = document.querySelector("#logs");
const quickTaskText = document.querySelector("#quickTaskText");
const imagePicker = document.querySelector("#imagePicker");
const pickImagesBtn = document.querySelector("#pickImagesBtn");
const imageDropZone = document.querySelector("#imageDropZone");

document.querySelector("#refreshBtn").addEventListener("click", refreshAll);
document.querySelector("#parseQuickBtn").addEventListener("click", parseQuickTask);
document.querySelector("#createRunBtn").addEventListener("click", createAndRunTask);
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

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createTaskFromForm(false);
});

await refreshAll();
setInterval(async () => {
  if (selectedTask) {
    await refreshTasks(selectedTask.id, false);
    await loadLogs();
    await loadImages();
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
  const storeData = await api("/api/stores");
  stores = storeData.stores;
  renderStores();
  await refreshTasks(selectedTask?.id ?? (pendingParsedTask ? null : undefined));
}

async function refreshTasks(preferredId, notify = true) {
  const data = await api("/api/tasks");
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

function renderStores() {
  storeChecks.innerHTML = stores.map((store) => `
    <label class="store-check">
      <input type="checkbox" name="targetStores" value="${store.id}" checked>
      ${escapeHtml(store.label)}
    </label>
  `).join("");
}

function renderTaskSelect() {
  const placeholder = selectedTask ? "" : `
    <option value="" selected>
      ${pendingParsedTask ? "\u5df2\u89e3\u6790\u8868\u5355\uff0c\u7b49\u5f85\u521b\u5efa\u4efb\u52a1" : "\u8bf7\u9009\u62e9\u4efb\u52a1"}
    </option>
  `;
  taskSelect.innerHTML = placeholder + tasks.map((task) => `
    <option value="${task.id}" ${task.id === selectedTask?.id ? "selected" : ""}>
      ${escapeHtml(task.productName)} &middot; ${escapeHtml(task.skuGroup.join(" "))}
    </option>
  `).join("");
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
  document.querySelector("#taskSkus").textContent = displayTask.skuGroup.join(" ");
  document.querySelector("#taskStatus").textContent = displayTask.status;
  renderListings(displayTask);
  if (selectedTask) {
    await loadImages();
    await loadLogs();
  } else {
    imageGrid.innerHTML = '<div class="empty">\u521b\u5efa\u4efb\u52a1\u540e\u751f\u6210\u56fe\u7247</div>';
    logs.textContent = "\u5df2\u89e3\u6790\u5230\u5de6\u4fa7\u8868\u5355\u3002\u8bf7\u70b9\u51fb\u201c\u521b\u5efa\u5e76\u4e00\u952e\u5168\u6d41\u7a0b\u201d\uff0c\u624d\u4f1a\u771f\u6b63\u751f\u6210\u56fe\u7247\u5e76\u5904\u7406 BigSeller \u8349\u7a3f\u3002";
  }
}

function pendingDisplayTask() {
  if (!pendingParsedTask) return null;
  const skuText = pendingParsedTask.skuGroup?.join(" ") || "";
  const targetStores = selectedTargetStores();
  return {
    productName: pendingParsedTask.productName || skuText || "\u5f85\u4ece 1 \u5e97\u6293\u53d6",
    skuGroup: pendingParsedTask.skuGroup || [],
    targetStores,
    status: "\u5f85\u521b\u5efa\uff0c\u5df2\u89e3\u6790",
    listings: Object.fromEntries(targetStores.map((storeId) => [storeId, {
      title: "\u521b\u5efa\u540e\u751f\u6210\u8be5\u5e97\u94fa\u7684 80-100 \u5b57\u7206\u6b3e\u6807\u9898",
      detail: "\u521b\u5efa\u540e\u751f\u6210\u8be5\u5e97\u94fa\u7684\u8d8a\u5357\u8bed\u8be6\u60c5\u3002\u54c1\u724c\u548c\u54c1\u540d\u4fdd\u7559\u82f1\u6587\uff0c\u529f\u6548\u5356\u70b9\u7528\u8d8a\u5357\u8bed\u3002"
    }]))
  };
}

function setTaskActionButtonsDisabled(disabled) {
  ["runAllBtn", "writeImageConfigBtn", "generateBtn", "regenerateImagesBtn", "writeBigsellerBtn", "discoverBtn", "saveBtn", "regenerateListingsBtn", "saveListingsBtn", "reloadImagesBtn", "reloadLogsBtn"].forEach((id) => {
    const button = document.querySelector(`#${id}`);
    if (button) button.disabled = disabled;
  });
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

async function postTaskAction(action) {
  if (!selectedTask) return;
  const data = await api(`/api/tasks/${selectedTask.id}/${action}`, { method: "POST" });
  selectedTask = data.task;
  await refreshTasks(selectedTask.id, false);
  toast("\u5df2\u63d0\u4ea4\u540e\u53f0\u4efb\u52a1");
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
