const tabsEl = document.getElementById("tabs");
const viewsEl = document.getElementById("views");
const omnibox = document.getElementById("omnibox");
const bookmarksBar = document.getElementById("bookmarks-bar");
const historyPanel = document.getElementById("history-panel");
const historyList = document.getElementById("history-list");
const status = document.getElementById("status");
const starBtn = document.getElementById("star");
const backBtn = document.getElementById("back");
const forwardBtn = document.getElementById("forward");

let tabs = [];
let activeId = null;
let bookmarks = [];
let history = [];
let homeUrl = "https://www.google.com";
let idSeq = 0;

function looksLikeUrl(text) {
  const value = text.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return true;
  if (value.startsWith("localhost") || value.startsWith("127.0.0.1")) return true;
  return /^[\w-]+(\.[\w-]+)+([/:?#].*)?$/.test(value);
}

function toUrl(input) {
  const text = input.trim();
  if (!text) return homeUrl;
  if (looksLikeUrl(text)) {
    return /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}

function activeTab() {
  return tabs.find((t) => t.id === activeId);
}

function activeView() {
  return document.getElementById(`view-${activeId}`);
}

function setStatus(message) {
  if (!message) {
    status.hidden = true;
    status.textContent = "";
    return;
  }
  status.hidden = false;
  status.textContent = message;
}

function renderTabs() {
  tabsEl.innerHTML = "";
  for (const tab of tabs) {
    const el = document.createElement("button");
    el.className = `tab${tab.id === activeId ? " active" : ""}`;
    el.innerHTML = `<span></span><button class="close" title="Close">×</button>`;
    el.querySelector("span").textContent = tab.title || "New tab";
    el.addEventListener("click", () => showTab(tab.id));
    el.querySelector(".close").addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    tabsEl.appendChild(el);
  }
}

function renderBookmarks() {
  bookmarksBar.innerHTML = "";
  for (const b of bookmarks) {
    const chip = document.createElement("button");
    chip.className = "bookmark-chip";
    chip.textContent = b.title;
    chip.title = b.url;
    chip.addEventListener("click", () => navigate(b.url));
    bookmarksBar.appendChild(chip);
  }
}

function renderHistory() {
  historyList.innerHTML = "";
  for (const h of history) {
    const item = document.createElement("button");
    item.className = "hist-item";
    item.innerHTML = `<strong></strong><small></small>`;
    item.querySelector("strong").textContent = h.title;
    item.querySelector("small").textContent = h.url;
    item.addEventListener("click", () => {
      navigate(h.url);
      historyPanel.hidden = true;
    });
    historyList.appendChild(item);
  }
}

function updateChrome() {
  const view = activeView();
  const tab = activeTab();
  if (!view || !tab) return;
  omnibox.value = tab.url || "";
  backBtn.disabled = !view.canGoBack();
  forwardBtn.disabled = !view.canGoForward();
  starBtn.textContent = bookmarks.some((b) => b.url === tab.url) ? "★" : "☆";
  starBtn.classList.toggle("starred", bookmarks.some((b) => b.url === tab.url));
}

function showTab(id) {
  activeId = id;
  for (const tab of tabs) {
    const view = document.getElementById(`view-${tab.id}`);
    view.classList.toggle("hidden", tab.id !== id);
  }
  renderTabs();
  updateChrome();
}

function attachView(view, tab) {
  view.addEventListener("did-navigate", (e) => {
    tab.url = e.url;
    if (tab.id === activeId) updateChrome();
    window.browser.addHistory({ url: tab.url, title: tab.title }).then((items) => {
      history = items;
      renderHistory();
    });
  });
  view.addEventListener("did-navigate-in-page", (e) => {
    tab.url = e.url;
    if (tab.id === activeId) updateChrome();
  });
  view.addEventListener("page-title-updated", (e) => {
    tab.title = e.title;
    renderTabs();
  });
  view.addEventListener("did-start-loading", () => {
    if (tab.id === activeId) document.getElementById("reload").textContent = "✕";
  });
  view.addEventListener("did-stop-loading", () => {
    document.getElementById("reload").textContent = "↻";
    if (tab.id === activeId) updateChrome();
  });
  view.addEventListener("new-window", (e) => {
    createTab(e.url);
  });
}

function createTab(url = homeUrl, focus = true) {
  const id = ++idSeq;
  const tab = { id, url, title: "New tab" };
  const view = document.createElement("webview");
  view.id = `view-${id}`;
  view.setAttribute("allowpopups", "true");
  view.setAttribute("webpreferences", "contextIsolation=yes");
  view.src = url;
  viewsEl.appendChild(view);
  tabs.push(tab);
  attachView(view, tab);
  if (focus) showTab(id);
  else renderTabs();
  return tab;
}

function closeTab(id) {
  const index = tabs.findIndex((t) => t.id === id);
  if (index < 0) return;
  document.getElementById(`view-${id}`)?.remove();
  tabs.splice(index, 1);
  if (!tabs.length) {
    createTab(homeUrl);
    return;
  }
  if (activeId === id) showTab(tabs[Math.max(0, index - 1)].id);
  else renderTabs();
}

function navigate(url) {
  const view = activeView();
  const tab = activeTab();
  if (!view || !tab) return;
  tab.url = url;
  view.src = url;
  omnibox.value = url;
}

async function toggleBookmark() {
  const tab = activeTab();
  if (!tab?.url) return;
  if (bookmarks.some((b) => b.url === tab.url)) {
    bookmarks = await window.browser.removeBookmark(tab.url);
  } else {
    bookmarks = await window.browser.addBookmark({ title: tab.title, url: tab.url });
  }
  renderBookmarks();
  updateChrome();
}

document.getElementById("new-tab").addEventListener("click", () => createTab(homeUrl));
document.getElementById("back").addEventListener("click", () => activeView()?.goBack());
document.getElementById("forward").addEventListener("click", () => activeView()?.goForward());
document.getElementById("home").addEventListener("click", () => navigate(homeUrl));
document.getElementById("reload").addEventListener("click", () => {
  const view = activeView();
  if (!view) return;
  if (view.isLoading()) view.stop();
  else view.reload();
});
document.getElementById("star").addEventListener("click", toggleBookmark);
document.getElementById("history-btn").addEventListener("click", () => {
  historyPanel.hidden = !historyPanel.hidden;
});
document.getElementById("close-history").addEventListener("click", () => {
  historyPanel.hidden = true;
});
document.getElementById("clear-history").addEventListener("click", async () => {
  history = await window.browser.clearHistory();
  renderHistory();
});
document.getElementById("omnibox-form").addEventListener("submit", (e) => {
  e.preventDefault();
  navigate(toUrl(omnibox.value));
});

window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "t") {
    e.preventDefault();
    createTab(homeUrl);
  } else if (e.ctrlKey && e.key.toLowerCase() === "w") {
    e.preventDefault();
    closeTab(activeId);
  } else if (e.ctrlKey && e.key.toLowerCase() === "l") {
    e.preventDefault();
    omnibox.focus();
    omnibox.select();
  } else if (e.ctrlKey && e.key.toLowerCase() === "r") {
    e.preventDefault();
    activeView()?.reload();
  } else if (e.ctrlKey && e.key.toLowerCase() === "d") {
    e.preventDefault();
    toggleBookmark();
  } else if (e.ctrlKey && e.key.toLowerCase() === "h") {
    e.preventDefault();
    historyPanel.hidden = !historyPanel.hidden;
  } else if (e.altKey && e.key === "ArrowLeft") {
    e.preventDefault();
    activeView()?.goBack();
  } else if (e.altKey && e.key === "ArrowRight") {
    e.preventDefault();
    activeView()?.goForward();
  }
});

window.browser.onDownloadStarted((info) => setStatus(`Downloading ${info.filename}…`));
window.browser.onDownloadDone((info) => {
  setStatus(info.state === "completed" ? `Saved ${info.filename}` : `Download ${info.state}`);
  setTimeout(() => setStatus(""), 4000);
});
window.browser.onOpenUrlInTab((url) => createTab(url));

(async function init() {
  homeUrl = await window.browser.getHome();
  const stored = await window.browser.getData();
  bookmarks = stored.bookmarks || [];
  history = stored.history || [];
  renderBookmarks();
  renderHistory();
  createTab(homeUrl);
})();
