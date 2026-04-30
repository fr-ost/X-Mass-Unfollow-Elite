// ============================================================
// X Unfollow Manager Pro — content.js (v5.0.0)
// Background-safe, filter-correct, chunked scrolling, robust profile detection.
// ============================================================

let running = false;
let paused = false;
let count = 0;
let mode = "Idle";
let startedAt = null;
let currentTimer = null;
let nonFollowersOnly = true;

// `seen` now tracks BOTH unfollowed and skipped accounts so the loop
// always advances instead of getting stuck on the same row.
const seen = new Set();
const skippedRecently = new Map(); // username -> timestamp, to avoid re-evaluating skipped rows

// Cache of DOM nodes already evaluated this scroll pass (cleared on each scroll).
let evaluatedNodes = new WeakSet();

const defaults = {
  minDelay: 20, maxDelay: 45, maxActions: 30, cooldownAfter: 12, cooldownMinutes: 5, scrollWait: 3,
  reloadOnStop: false, skipVerified: false, skipProtected: false, skipFollowsMe: false, soundEnabled: true,
  smartSelection: false, cleanupThreshold: 55, keywordProtection: false, protectedKeywords: "project, team, partner"
};

// ------------------------------------------------------------
// Background-safe timing: ask the service worker (which has chrome.alarms)
// to wake us up. setTimeout in a hidden tab is throttled to >=1s and
// sometimes pauses entirely. Service-worker alarms are NOT throttled.
// ------------------------------------------------------------
const pendingWakes = new Map(); // id -> resolve fn
let wakeIdSeq = 1;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "WAKE" && msg.id != null) {
    const fn = pendingWakes.get(msg.id);
    if (fn) {
      pendingWakes.delete(msg.id);
      fn();
    }
    return; // no response needed
  }

  if (msg.action === "GET_PROFILE") { sendResponse({ profile: getLoggedInProfile() }); return true; }
  if (msg.action === "GET_STATE")   { sendResponse(state(running ? "Running" : "Idle", running)); return true; }
  if (msg.action === "START_NON_FOLLOWERS") { start(true);  sendResponse(state("Started Non Followers", true)); return true; }
  if (msg.action === "START_ALL")           { start(false); sendResponse(state("Started All", true));           return true; }
  if (msg.action === "PAUSE")  { paused = true;  notify("Paused");  sendResponse(state("Paused", true));  return true; }
  if (msg.action === "RESUME") { paused = false; notify("Resumed"); sendResponse(state("Resumed", true)); return true; }
  if (msg.action === "STOP")   { stop("Stopped manually."); sendResponse(state("Stopped", false)); return true; }
});

// Background-safe sleep. Falls back to setTimeout for short waits (<800ms),
// uses chrome.alarms (via background script) for longer ones because
// setTimeout is unreliable / throttled when the tab is hidden.
function sleep(ms) {
  ms = Math.max(0, Math.floor(ms));
  if (ms < 800) {
    return new Promise(r => setTimeout(r, ms));
  }
  return new Promise(resolve => {
    const id = wakeIdSeq++;
    pendingWakes.set(id, resolve);
    chrome.runtime.sendMessage({ type: "REQUEST_WAKE", id, ms }).catch(() => {
      // If background is asleep, fall back to setTimeout (best-effort).
      setTimeout(() => {
        if (pendingWakes.has(id)) {
          pendingWakes.delete(id);
          resolve();
        }
      }, ms);
    });
    // Hard-cap fallback in case the alarm message is lost.
    setTimeout(() => {
      if (pendingWakes.has(id)) {
        pendingWakes.delete(id);
        resolve();
      }
    }, ms + 5000);
  });
}

// ------------------------------------------------------------
// Profile detection — much more robust than picking the first /xxx link.
// ------------------------------------------------------------
function getLoggedInProfile() {
  const result = { name: "", handle: "", avatar: "" };
  const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  if (switcher) {
    const img = switcher.querySelector('img[src]');
    if (img) result.avatar = img.src;
    const text = (switcher.innerText || "").split("\n").map(x => x.trim()).filter(Boolean);
    const handleLine = text.find(x => x.startsWith("@"));
    const nameLine = text.find(x => !x.startsWith("@") && x.toLowerCase() !== "more");
    if (nameLine) result.name = nameLine;
    if (handleLine) result.handle = handleLine.replace(/^@/, "");
  }
  if (!result.handle) {
    // Try the profile link in the side nav
    const profileLink = document.querySelector('[data-testid="AppTabBar_Profile_Link"], a[aria-label="Profile"]');
    const href = profileLink?.getAttribute("href") || "";
    if (/^\/[A-Za-z0-9_]{1,15}$/.test(href)) result.handle = href.replace("/", "");
  }
  if (!result.avatar) {
    const accountImg = document.querySelector(
      '[data-testid="SideNav_AccountSwitcher_Button"] img, [data-testid="DashButton_ProfileIcon_Link"] img'
    );
    if (accountImg) result.avatar = accountImg.src;
  }
  if (!result.name && result.handle) result.name = result.handle;
  return result;
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
function start(nf) {
  if (running) return;
  running = true; paused = false; count = 0;
  seen.clear(); skippedRecently.clear(); evaluatedNodes = new WeakSet();
  nonFollowersOnly = nf;
  mode = nf ? "Non Followers" : "All";
  startedAt = Date.now();
  currentTimer = null;
  notify("Running: " + mode);
  loop();
}

async function stop(message = "Stopped.") {
  running = false; paused = false; mode = "Idle"; currentTimer = null;
  chrome.runtime.sendMessage({ ...state(message, false), type: "STOPPED" }).catch(() => {});
  const s = await chrome.storage.sync.get(defaults);
  if (s.reloadOnStop) {
    // Slight delay so the STOPPED message reaches popup/background first.
    setTimeout(() => location.reload(), 700);
  }
}

// ------------------------------------------------------------
// Main loop
// ------------------------------------------------------------
async function loop() {
  const s = await chrome.storage.sync.get(defaults);
  let consecutiveEmptyScrolls = 0;
  const MAX_EMPTY_SCROLLS = 6; // stop after we genuinely run out

  while (running && count < s.maxActions) {
    if (paused) { await sleep(500); continue; }

    const btn = findUnfollowButton(s);

    if (!btn) {
      consecutiveEmptyScrolls++;
      if (consecutiveEmptyScrolls > MAX_EMPTY_SCROLLS) {
        notify("No more eligible accounts found. Finishing.");
        break;
      }
      notify("No eligible unfollow button visible. Scrolling...");
      // Use 'auto' (instant) — 'smooth' is throttled/blocked when tab is hidden.
      window.scrollBy({ top: Math.round(innerHeight * 0.85), behavior: "auto" });
      evaluatedNodes = new WeakSet(); // re-evaluate after layout shifts
      await countdown("Scroll wait", s.scrollWait, "Scrolling pause");
      continue;
    }
    consecutiveEmptyScrolls = 0;

    const username = getUsername(btn) || ("unknown_" + (count + 1));
    if (seen.has(username)) {
      // Already handled — make sure we move past it.
      evaluatedNodes.add(btn);
      window.scrollBy({ top: 400, behavior: "auto" });
      await sleep(800);
      continue;
    }

    seen.add(username);
    evaluatedNodes.add(btn);

    btn.scrollIntoView({ block: "center", behavior: "auto" });
    await sleep(randomInt(600, 1300));

    btn.click();
    await sleep(randomInt(900, 1700));

    const confirmBtn = await waitForConfirm(5000);
    if (!confirmBtn) {
      notify("Confirm button not found. Skipping.");
      // Try to dismiss any open modal
      document.body.click();
      await sleep(800);
      continue;
    }

    confirmBtn.click();
    count++;
    await saveUnfollowedProfile(username);
    playBeep(s.soundEnabled);
    notify(username.startsWith("unknown_") ? "Unfollowed account" : "Unfollowed @" + username);

    if (count >= s.maxActions || !running) break;

    if (count % s.cooldownAfter === 0) {
      await countdown("Cooldown", s.cooldownMinutes * 60, "Cooldown running");
    }

    const delay = randomInt(s.minDelay, s.maxDelay);
    await countdown("Next action", delay, "Waiting before next action");
  }

  stop("Finished. Total unfollowed: " + count);
}

// ------------------------------------------------------------
// Button finder — KEY FIX: when filters reject a row, we mark it `seen`
// so the loop progresses past it instead of getting stuck.
// ------------------------------------------------------------
function findUnfollowButton(s) {
  const buttons = [...document.querySelectorAll('button,div[role="button"]')];

  for (const btn of buttons) {
    if (evaluatedNodes.has(btn)) continue;
    if (!isVisible(btn)) continue;

    const text = (btn.innerText || btn.textContent || "").trim().toLowerCase();
    const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
    const tid  = (btn.getAttribute("data-testid") || "").toLowerCase();

    // X uses several variants. The button currently shows "Following" until hover.
    const isFollowingButton =
      text === "following" ||
      text === "unfollow" ||                         // when hovered
      tid.includes("unfollow") ||
      aria.includes("following") ||
      aria.startsWith("unfollow ");

    if (!isFollowingButton) continue;

    const rowText = getRowText(btn);
    if (rowText.includes("pending")) { evaluatedNodes.add(btn); continue; }

    // Username — used both for filtering AND for marking as seen.
    const username = getUsername(btn) || ("anon_" + Math.random().toString(36).slice(2, 8));
    const followsYou = hasFollowsYouIndicator(btn, rowText);
    const verified   = looksVerified(btn, rowText);
    const isProtected = rowText.includes("protected") || rowText.includes("private");

    let skipReason = null;

    if (nonFollowersOnly && followsYou) skipReason = "follows-you";
    else if (s.skipFollowsMe && followsYou) skipReason = "skip-follows-me";
    else if (s.skipVerified && verified) skipReason = "verified";
    else if (s.skipProtected && isProtected) skipReason = "protected";
    else if (s.keywordProtection && hasProtectedKeyword(rowText, s.protectedKeywords)) skipReason = "keyword";
    else if (s.smartSelection && !passesSmartCleanup(btn, rowText, s, verified)) skipReason = "smart-cleanup";

    if (skipReason) {
      // CRITICAL: mark this row + username as evaluated so we don't loop on it.
      evaluatedNodes.add(btn);
      seen.add(username);
      skippedRecently.set(username, Date.now());
      // Don't return — keep scanning the visible list for the next eligible row.
      continue;
    }

    return btn;
  }
  return null;
}

function getUserRow(btn) {
  return btn.closest('[data-testid="UserCell"]') ||
         btn.closest('[data-testid="cellInnerDiv"]') ||
         btn.closest('article') ||
         btn.closest('[role="listitem"]') ||
         btn.parentElement;
}

function getRowText(btn) {
  const row = getUserRow(btn);
  if (row) return (row.innerText || "").toLowerCase();
  let n = btn, txt = "";
  for (let i = 0; i < 5 && n; i++) { txt += " " + (n.innerText || ""); n = n.parentElement; }
  return txt.toLowerCase();
}

function hasFollowsYouIndicator(btn, rowText) {
  const row = getUserRow(btn);
  if (!row) return rowText.includes("follows you");
  if ((row.innerText || "").toLowerCase().includes("follows you")) return true;
  if (row.querySelector?.('[data-testid="userFollowIndicator"]')) return true;
  return false;
}

function looksVerified(btn, rowText) {
  const row = getUserRow(btn);
  if (!row) return false;
  // X verified: <svg data-testid="icon-verified"> or aria-label contains "Verified"
  if (row.querySelector?.('svg[data-testid="icon-verified"], [data-testid="icon-verified"]')) return true;
  if (row.querySelector?.('svg[aria-label*="Verified" i], [aria-label*="Verified" i]')) return true;
  // Fallback to text
  if (rowText.includes("verified account")) return true;
  return false;
}

function hasProtectedKeyword(rowText, keywords) {
  const list = String(keywords || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  return list.some(k => rowText.includes(k));
}

function passesSmartCleanup(btn, rowText, s, verified) {
  let score = 0;
  if (verified) score -= 30;
  if (rowText.includes("follows you")) score -= 30;
  if (rowText.includes("private") || rowText.includes("protected")) score -= 10;
  if (rowText.length < 70) score += 15;

  const username = getUsername(btn);
  if (username && /[0-9]{5,}/.test(username)) score += 20;
  if (username && username.length > 18) score += 10;

  const spamWords = ["airdrop", "giveaway", "free money", "promo", "casino", "betting", "onlyfans", "adult", "pump", "signals"];
  if (spamWords.some(w => rowText.includes(w))) score += 30;

  const protectedWords = String(s.protectedKeywords || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  if (protectedWords.some(w => rowText.includes(w))) score -= 40;

  return score >= (Number(s.cleanupThreshold) || 55);
}

function getUsername(btn) {
  // Most reliable: aria-label like "Following @handle" or "Unfollow @handle"
  const aria = btn.getAttribute("aria-label") || "";
  let m = aria.match(/@([A-Za-z0-9_]+)/);
  if (m) return m[1].toLowerCase();

  // data-testid often is `unfollow-handle` or `123456-unfollow`
  const tid = btn.getAttribute("data-testid") || "";
  m = tid.match(/^(?:[0-9]+-)?unfollow-?([A-Za-z0-9_]+)?/);
  if (m && m[1]) return m[1].toLowerCase();

  const row = getUserRow(btn);
  if (row) {
    m = (row.innerText || "").match(/@([A-Za-z0-9_]+)/);
    if (m) return m[1].toLowerCase();
    const a = row.querySelector?.('a[href^="/"]');
    const href = a?.getAttribute("href") || "";
    if (/^\/[A-Za-z0-9_]{1,15}$/.test(href)) return href.replace("/", "").toLowerCase();
  }
  return "";
}

async function waitForConfirm(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const buttons = [...document.querySelectorAll('button,div[role="button"]')];
    const confirmBtn = buttons.find(b => {
      if (!isVisible(b)) return false;
      const text = (b.innerText || b.textContent || "").trim().toLowerCase();
      const tid  = (b.getAttribute("data-testid") || "").toLowerCase();
      return text === "unfollow" || tid.includes("confirmationsheetconfirm");
    });
    if (confirmBtn) return confirmBtn;
    await sleep(250);
  }
  return null;
}

async function saveUnfollowedProfile(username) {
  const cleanUsername = (username || "").replace(/^@/, "").toLowerCase();
  const profileUrl = cleanUsername && !cleanUsername.startsWith("unknown_") ? `https://x.com/${cleanUsername}` : "";
  const record = { username: cleanUsername, profileUrl, unfollowedAt: new Date().toISOString(), sourceUrl: location.href, mode };

  return new Promise(resolve => {
    chrome.storage.local.get({ unfollowedProfiles: [] }, data => {
      const rows = Array.isArray(data.unfollowedProfiles) ? data.unfollowedProfiles : [];
      const exists = profileUrl && rows.some(r => r.profileUrl === profileUrl);
      const next = exists ? rows : [...rows, record];
      chrome.storage.local.set({ unfollowedProfiles: next }, resolve);
    });
  });
}

async function countdown(label, totalSeconds, message) {
  totalSeconds = Math.max(1, Math.floor(Number(totalSeconds) || 1));
  for (let remaining = totalSeconds; remaining > 0; remaining--) {
    currentTimer = { label, totalSeconds, remainingSeconds: remaining };
    notify(message);
    await sleep(1000);
    while (paused && running) {
      notify("Paused");
      await sleep(500);
    }
    if (!running) break;
  }
  currentTimer = null;
  notify("Ready for next step");
}

function playBeep(enabled) {
  if (!enabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 520;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.13);
    setTimeout(() => ctx.close(), 250);
  } catch (e) {}
}

// On a hidden tab the viewport check (r.bottom>0 && r.top<innerHeight)
// can still pass because layout is preserved. We just need elements that
// are actually in the DOM and laid out.
function isVisible(el) {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const st = getComputedStyle(el);
  if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
  return true;
}

function state(message, runningState) {
  const elapsedSeconds = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const minutes = Math.max(elapsedSeconds / 60, 1 / 60);
  const rate = count / minutes;
  return { message, running: runningState, count, mode, timer: currentTimer, elapsedSeconds, rate };
}

function notify(message) {
  chrome.runtime.sendMessage({ ...state(message, true), type: "PROGRESS" }).catch(() => {});
  console.log("[X Unfollow Manager Pro]", message);
}

function randomInt(min, max) {
  min = Number(min) || 20; max = Number(max) || 45;
  if (max < min) [min, max] = [max, min];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
