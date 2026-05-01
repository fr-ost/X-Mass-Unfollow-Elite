// ============================================================
// X Unfollow Manager Pro — options.js (v5.0.0)
// ============================================================

const defaults = {
  minDelay: 20, maxDelay: 45, maxActions: 30, cooldownAfter: 12, cooldownMinutes: 5, scrollWait: 3,
  reloadOnStop: false, skipVerified: false, skipProtected: false, skipFollowsMe: false, soundEnabled: true,
  smartSelection: false, cleanupThreshold: 55, keywordProtection: false, protectedKeywords: "project, team, partner"
};

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get(defaults, (d) => {
    $("minDelay").value         = d.minDelay;
    $("maxDelay").value         = d.maxDelay;
    $("maxActions").value       = d.maxActions;
    $("cooldownAfter").value    = d.cooldownAfter;
    $("cooldownMinutes").value  = d.cooldownMinutes;
    $("scrollWait").value       = d.scrollWait;
    $("reloadOnStop").checked   = !!d.reloadOnStop;
    $("skipVerified").checked   = !!d.skipVerified;
    $("skipProtected").checked  = !!d.skipProtected;
    $("skipFollowsMe").checked  = !!d.skipFollowsMe;
    $("soundEnabled").checked   = d.soundEnabled !== false;
    $("smartSelection").checked = !!d.smartSelection;
    $("cleanupThreshold").value = d.cleanupThreshold || 55;
    $("keywordProtection").checked = !!d.keywordProtection;
    $("protectedKeywords").value   = d.protectedKeywords || "";
  });

  $("save").addEventListener("click", saveSettings);

  // Save on Enter inside any input
  document.querySelectorAll("input").forEach(el => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); saveSettings(); }
    });
  });
});

function saveSettings() {
  let min = clamp($("minDelay").value, 5, 600, 20);
  let max = clamp($("maxDelay").value, 5, 600, 45);
  if (max < min) [min, max] = [max, min];

  const data = {
    minDelay: min,
    maxDelay: max,
    maxActions:       clamp($("maxActions").value, 1, 1000, 30),
    cooldownAfter:    clamp($("cooldownAfter").value, 1, 100, 12),
    cooldownMinutes:  clamp($("cooldownMinutes").value, 1, 120, 5),
    scrollWait:       clamp($("scrollWait").value, 1, 30, 3),
    reloadOnStop:     $("reloadOnStop").checked,
    skipVerified:     $("skipVerified").checked,
    skipProtected:    $("skipProtected").checked,
    skipFollowsMe:    $("skipFollowsMe").checked,
    soundEnabled:     $("soundEnabled").checked,
    smartSelection:   $("smartSelection").checked,
    cleanupThreshold: clamp($("cleanupThreshold").value, 1, 100, 55),
    keywordProtection: $("keywordProtection").checked,
    protectedKeywords: $("protectedKeywords").value.trim()
  };

  // Reflect normalised values back in the UI
  $("minDelay").value = data.minDelay;
  $("maxDelay").value = data.maxDelay;

  chrome.storage.sync.set(data, () => {
    const status = $("status");
    status.textContent = "✓  Settings saved";
    status.style.opacity = "1";
    setTimeout(() => {
      status.style.opacity = "0";
      setTimeout(() => { status.textContent = ""; status.style.opacity = "1"; }, 300);
    }, 1800);
  });
}

function clamp(v, min, max, fallback) {
  let n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
