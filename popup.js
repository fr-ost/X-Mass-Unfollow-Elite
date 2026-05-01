// ============================================================
// X Unfollow Manager Pro — popup.js (v5.0.0)
// ============================================================

const $ = (id) => document.getElementById(id);

const countEl       = $("count"),
      statusEl      = $("statusText"),
      modeEl        = $("modeText"),
      dot           = $("dot"),
      timerLabel    = $("timerLabel"),
      timerText     = $("timerText"),
      progressBar   = $("progressBar"),
      rateEl        = $("rate"),
      elapsedEl     = $("elapsed"),
      dbCountEl     = $("dbCount"),
      chart         = $("sessionChart"),
      chartLabel    = $("chartLabel"),
      chartTotal    = $("chartTotal"),
      chartPeak     = $("chartPeak"),
      chartDuration = $("chartDuration"),
      greetingText  = $("greetingText"),
      profileName   = $("profileName"),
      profileHandle = $("profileHandle"),
      profileAvatar = $("profileAvatar");

const chartCtx = chart.getContext("2d");

// Hi-DPI canvas for crisp lines on retina screens.
function setupCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const cssW = 310, cssH = 120;
  chart.style.width = cssW + "px";
  chart.style.height = cssH + "px";
  chart.width = cssW * ratio;
  chart.height = cssH * ratio;
  chartCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

let points = [];
let peakRate = 0;

function setStatus(text, state = "ready") {
  statusEl.textContent = text;
  dot.className = "dot";
  if (state === "running") dot.classList.add("running");
  if (state === "stopped") dot.classList.add("stopped");
}

function getDisplayMessage(msg) {
  let text = msg?.message || "Running";
  if (msg?.timer?.totalSeconds && (
        text.toLowerCase().includes("waiting before next action") ||
        text.toLowerCase().includes("cooldown") ||
        text.toLowerCase().includes("scrolling pause")
      )) {
    text = text + ": " + formatTime(msg.timer.totalSeconds);
  }
  return text;
}

function updateTimer(msg) {
  if (!msg || msg.totalSeconds === undefined || msg.remainingSeconds === undefined) {
    timerLabel.textContent = "Timer";
    timerText.textContent = "—";
    progressBar.style.width = "0%";
    return;
  }
  timerLabel.textContent = msg.label || "Timer";
  timerText.textContent = formatTime(msg.remainingSeconds);
  const total = Math.max(1, Number(msg.totalSeconds) || 1);
  const remaining = Math.max(0, Number(msg.remainingSeconds) || 0);
  const pct = Math.max(0, Math.min(100, ((total - remaining) / total) * 100));
  progressBar.style.width = pct + "%";
}

function updateAnalytics(msg) {
  if (msg?.rate !== undefined) {
    const rate = Number(msg.rate) || 0;
    rateEl.textContent = rate.toFixed(1);
    peakRate = Math.max(peakRate, rate);
  }
  if (msg?.elapsedSeconds !== undefined) elapsedEl.textContent = formatTime(msg.elapsedSeconds);
  if (msg?.elapsedSeconds !== undefined && msg?.count !== undefined) {
    addChartPoint(Number(msg.elapsedSeconds) || 0, Number(msg.count) || 0, Number(msg.rate) || 0);
  }
}

function addChartPoint(t, c, r) {
  const last = points[points.length - 1];
  if (!last || last.t !== t || last.c !== c || last.r !== r) {
    points.push({ t, c, r });
    if (points.length > 90) points.shift();
    drawChart();
  }
}

// ------------------------------------------------------------
// Chart — redrawn for the light/editorial theme.
// Black ink line, vermillion fill, dotted grid.
// ------------------------------------------------------------
function drawChart() {
  const w = 310, h = 120;
  chartCtx.clearRect(0, 0, w, h);

  // background paper
  chartCtx.fillStyle = "#efe7d8";
  chartCtx.fillRect(0, 0, w, h);

  // dotted horizontal gridlines
  chartCtx.strokeStyle = "rgba(20,17,13,0.16)";
  chartCtx.setLineDash([1, 3]);
  chartCtx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (h / 4) * i;
    chartCtx.beginPath();
    chartCtx.moveTo(6, y);
    chartCtx.lineTo(w - 6, y);
    chartCtx.stroke();
  }
  chartCtx.setLineDash([]);

  const latest = points[points.length - 1] || { t: 0, c: 0, r: 0 };
  const maxT = Math.max(1, ...points.map(p => p.t));
  const maxC = Math.max(1, ...points.map(p => p.c));

  chartLabel.textContent = `${latest.c} unfollows · ${latest.r.toFixed(1)}/min`;
  chartTotal.textContent = String(latest.c);
  chartPeak.textContent  = peakRate.toFixed(1);
  chartDuration.textContent = formatTime(latest.t);

  if (points.length < 2) {
    chartCtx.font = "italic 11px Fraunces, serif";
    chartCtx.fillStyle = "rgba(20,17,13,0.5)";
    chartCtx.textAlign = "center";
    chartCtx.fillText("chart begins after first actions", w / 2, h / 2);
    chartCtx.textAlign = "start";
    return;
  }

  const coords = points.map(p => ({
    x: (p.t / maxT) * (w - 18) + 9,
    y: h - ((p.c / maxC) * (h - 28)) - 14
  }));

  // filled area — vermillion at low opacity
  chartCtx.beginPath();
  coords.forEach((pt, i) => i === 0 ? chartCtx.moveTo(pt.x, pt.y) : chartCtx.lineTo(pt.x, pt.y));
  chartCtx.lineTo(coords[coords.length - 1].x, h - 4);
  chartCtx.lineTo(coords[0].x, h - 4);
  chartCtx.closePath();
  const grad = chartCtx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(200,49,44,0.28)");
  grad.addColorStop(1, "rgba(200,49,44,0.02)");
  chartCtx.fillStyle = grad;
  chartCtx.fill();

  // ink line
  chartCtx.strokeStyle = "#14110d";
  chartCtx.lineWidth = 2;
  chartCtx.lineJoin = "round";
  chartCtx.lineCap = "round";
  chartCtx.beginPath();
  coords.forEach((pt, i) => i === 0 ? chartCtx.moveTo(pt.x, pt.y) : chartCtx.lineTo(pt.x, pt.y));
  chartCtx.stroke();

  // last point — vermillion accent
  const last = coords[coords.length - 1];
  chartCtx.beginPath();
  chartCtx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
  chartCtx.fillStyle = "#c8312c";
  chartCtx.fill();
  chartCtx.strokeStyle = "#14110d";
  chartCtx.lineWidth = 1.5;
  chartCtx.stroke();

  // axis labels — monospace
  chartCtx.font = "9px JetBrains Mono, monospace";
  chartCtx.fillStyle = "rgba(20,17,13,0.55)";
  chartCtx.fillText("0", 6, h - 4);
  chartCtx.fillText(String(maxC), 6, 12);
  chartCtx.textAlign = "end";
  chartCtx.fillText(formatTime(maxT), w - 6, h - 4);
  chartCtx.textAlign = "start";
}

function formatTime(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Welcome back";
}

async function loadProfileGreeting() {
  greetingText.textContent = getGreeting();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(x|twitter)\.com\//.test(tab.url || "")) {
    profileName.textContent = "X User";
    profileHandle.textContent = "Open X to detect profile";
    profileAvatar.removeAttribute("src");
    return;
  }
  chrome.tabs.sendMessage(tab.id, { action: "GET_PROFILE" }, (res) => {
    if (chrome.runtime.lastError || !res?.profile) {
      profileName.textContent = "X User";
      profileHandle.textContent = "Profile not detected yet";
      profileAvatar.removeAttribute("src");
      return;
    }
    profileName.textContent = res.profile.name || "X User";
    profileHandle.textContent = res.profile.handle ? "@" + res.profile.handle : "Logged-in account";
    if (res.profile.avatar) profileAvatar.src = res.profile.avatar;
  });
}

// Restore live state on popup re-open (since the script keeps running).
async function restoreLiveState() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(x|twitter)\.com\//.test(tab.url || "")) return;
  chrome.tabs.sendMessage(tab.id, { action: "GET_STATE" }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    applyResponse(res);
  });
}

async function send(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { setStatus("No active tab", "stopped"); return; }
  if (!/^https:\/\/(x|twitter)\.com\//.test(tab.url || "")) {
    setStatus("Open X/Twitter first", "stopped");
    return;
  }
  chrome.tabs.sendMessage(tab.id, { action }, (res) => {
    if (chrome.runtime.lastError) { setStatus("Refresh the X page first", "stopped"); return; }
    if (action === "START_NON_FOLLOWERS" || action === "START_ALL") {
      points = []; peakRate = 0; drawChart();
    }
    applyResponse(res);
  });
}

function applyResponse(res) {
  if (res?.count !== undefined) countEl.textContent = res.count;
  if (res?.mode) modeEl.textContent = res.mode;
  updateTimer(res?.timer);
  updateAnalytics(res);
  updateDbCount();
  setStatus(getDisplayMessage(res), res?.running ? "running" : "ready");
}

function csvEscape(value) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

async function updateDbCount() {
  chrome.storage.local.get({ unfollowedProfiles: [] }, (data) => {
    dbCountEl.textContent = (data.unfollowedProfiles || []).length;
  });
}

async function exportCsv() {
  chrome.storage.local.get({ unfollowedProfiles: [] }, (data) => {
    const rows = data.unfollowedProfiles || [];
    if (!rows.length) { setStatus("Database is empty.", "stopped"); return; }
    const header = ["username", "profile_url", "unfollowed_at", "source_url", "mode"];
    // FIX: was "\\n" (literal backslash-n). Now real newlines.
    const csv = [
      header.join(","),
      ...rows.map(r => [
        csvEscape(r.username),
        csvEscape(r.profileUrl),
        csvEscape(r.unfollowedAt),
        csvEscape(r.sourceUrl),
        csvEscape(r.mode)
      ].join(","))
    ].join("\n");

    // BOM so Excel opens UTF-8 cleanly
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `x-unfollowed-profiles-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("CSV exported.", "ready");
  });
}

async function clearDb() {
  if (!confirm("Clear all saved unfollowed profiles from the local database?")) return;
  chrome.storage.local.set({ unfollowedProfiles: [] }, () => {
    updateDbCount();
    setStatus("Database cleared.", "stopped");
  });
}

// ---- wire up ----
$("nonFollowers").addEventListener("click", () => send("START_NON_FOLLOWERS"));
$("all").addEventListener("click",          () => send("START_ALL"));
$("pause").addEventListener("click",        () => send("PAUSE"));
$("resume").addEventListener("click",       () => send("RESUME"));
$("stop").addEventListener("click",         () => send("STOP"));
$("settings").addEventListener("click",     () => chrome.runtime.openOptionsPage());
$("contact").addEventListener("click",      () => chrome.tabs.create({ url: "https://t.me/igfrostt" }));
$("exportCsv").addEventListener("click",    exportCsv);
$("clearDb").addEventListener("click",      clearDb);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "PROGRESS") applyResponse(msg);
  if (msg.type === "STOPPED") {
    applyResponse(msg);
    updateTimer(null);
    setStatus(msg.message || "Stopped", "stopped");
    modeEl.textContent = "Idle";
  }
});

document.addEventListener("DOMContentLoaded", () => {
  setupCanvas();
  loadProfileGreeting();
  updateDbCount();
  drawChart();
  restoreLiveState();
});
