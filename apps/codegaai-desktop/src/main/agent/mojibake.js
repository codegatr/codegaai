"use strict";

const REPLACEMENTS = new Map([
  ["Ä±", "ı"], ["Ä°", "İ"], ["ÅŸ", "ş"], ["Åž", "Ş"], ["ÄŸ", "ğ"], ["Äž", "Ğ"],
  ["Ã¼", "ü"], ["Ãœ", "Ü"], ["Ã¶", "ö"], ["Ã–", "Ö"], ["Ã§", "ç"], ["Ã‡", "Ç"],
  ["Ã¢", "â"], ["Ã‚", "Â"], ["Ã®", "î"], ["ÃŽ", "Î"], ["Ã»", "û"], ["Ã›", "Û"],
  ["â€™", "’"], ["â€œ", "“"], ["â€", "”"], ["â€“", "–"], ["â€”", "—"], ["â†’", "→"],
]);

function repairMojibake(value) {
  let text = String(value || "");
  if (!/[ÃÄÅâ]/.test(text)) return text;
  for (const [bad, good] of REPLACEMENTS) text = text.split(bad).join(good);
  return text;
}

module.exports = {
  repairMojibake,
};
