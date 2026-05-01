// Tiny ping every 20s so the service worker never goes idle long enough
// to be terminated while a session is active.
setInterval(() => {
  try { chrome.runtime.sendMessage({ type: "OFFSCREEN_PING" }).catch(() => {}); } catch (_) {}
}, 20000);
