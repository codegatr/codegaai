(() => {
  "use strict";

  const replacements = [
    ["ÃƒÆ’Ã¢â‚¬Â¡", "Ç"], ["ÃƒÆ’Ã‚Â§", "ç"],
    ["ÃƒÆ’Ã¢â‚¬â€œ", "Ö"], ["ÃƒÆ’Ã‚Â¶", "ö"],
    ["ÃƒÆ’Ã…â€œ", "Ü"], ["ÃƒÆ’Ã‚Â¼", "ü"],
    ["Ãƒâ€Ã‚Â°", "İ"], ["Ãƒâ€Ã‚Â±", "ı"],
    ["Ãƒâ€Ã…Â¸", "ğ"], ["Ãƒâ€Ã‚Â", "Ğ"],
    ["Ãƒâ€¦Ã…Â¸", "ş"], ["Ãƒâ€¦Ã‚Â", "Ş"],
    ["ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â", "—"], ["ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â€", "↗"],
    ["ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬Å“", "↓"], ["Ã„Å¸Ã…Â¸Ã¢â‚¬ËœÃ‚Â", "👍"],
    ["Ã„Å¸Ã…Â¸Ã¢â‚¬ËœÃ‚Â", "👎"], ["Ã„Å¸Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Â¹", "📋"],
    ["Ã‡", "Ç"], ["Ã§", "ç"], ["Ã–", "Ö"], ["Ã¶", "ö"],
    ["Ãœ", "Ü"], ["Ã¼", "ü"], ["Ä°", "İ"], ["Ä±", "ı"],
    ["Äž", "Ğ"], ["ÄŸ", "ğ"], ["Åž", "Ş"], ["ÅŸ", "ş"],
    ["â€™", "’"], ["â€œ", "“"], ["â€", "”"], ["â€“", "–"], ["â€”", "—"],
    ["HazÃ„Â±r", "Hazır"], ["YanÃ„Â±t", "Yanıt"], ["Ã‡alÃ„Â±Ã…Å¸ma", "Çalışma"],
    ["Ã¶zeti", "özeti"], ["sÃ¼rÃ¼yor", "sürüyor"], ["Ã§alÃ„Â±Ã…Å¸maya", "çalışmaya"],
    ["deÄŸilse", "değilse"], ["gÃ¼ncelleme", "güncelleme"], ["gerekli", "gerekli"]
  ];

  function repairText(value) {
    let text = String(value ?? "");
    if (!/[ÃÄÅâ]/.test(text)) return text;
    for (let pass = 0; pass < 5; pass += 1) {
      const before = text;
      for (const [bad, good] of replacements) text = text.split(bad).join(good);
      if (text === before) break;
    }
    return text;
  }

  window.__codegaRepairText = repairText;

  const originalGetItem = Storage.prototype.getItem;
  Storage.prototype.getItem = function patchedGetItem(key) {
    const value = originalGetItem.call(this, key);
    if (key === "codega.desktop.chats.v1" && value) return repairText(value);
    return value;
  };

  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function patchedSetItem(key, value) {
    return originalSetItem.call(this, key, key === "codega.desktop.chats.v1" ? repairText(value) : value);
  };

  function repairNode(node) {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const fixed = repairText(node.nodeValue);
      if (fixed !== node.nodeValue) node.nodeValue = fixed;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    for (const attr of ["title", "aria-label", "placeholder", "value"]) {
      if (node.hasAttribute?.(attr)) {
        const oldValue = node.getAttribute(attr);
        const fixed = repairText(oldValue);
        if (fixed !== oldValue) node.setAttribute(attr, fixed);
      }
    }
    for (const child of node.childNodes || []) repairNode(child);
  }

  function repairDocument() {
    repairNode(document.body);
  }

  document.addEventListener("DOMContentLoaded", () => {
    repairDocument();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) repairNode(node);
        if (mutation.type === "characterData") repairNode(mutation.target);
        if (mutation.type === "attributes") repairNode(mutation.target);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    window.setInterval(repairDocument, 1200);
  });
})();
