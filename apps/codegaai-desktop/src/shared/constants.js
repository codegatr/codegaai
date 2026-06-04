const APP_NAME = "CODEGA AI";
const FEDERATION_BASE_URL = "https://ai.codega.com.tr/api/federation";
const DEFAULT_MODEL = "qwen3:4b";
const MODEL_OPTIONS = [
  {
    id: "qwen3:1.7b",
    label: "Qwen3 1.7B",
    description: "Yeni nesil cok hafif Qwen",
    task: "chat",
  },
  {
    id: "qwen3:14b",
    label: "Qwen3 14B",
    description: "Yuksek RAM icin daha guclu Qwen3",
    task: "writing",
  },
  {
    id: "qwen2.5-coder:3b",
    label: "Qwen 2.5 Coder 3B",
    description: "Kod yazma icin guncel kucuk model",
    task: "code",
  },
  {
    id: "qwen2.5-coder:7b",
    label: "Qwen 2.5 Coder 7B",
    description: "Kod icin guncel guclu secenek",
    task: "code",
  },
  {
    id: "qwen2.5:1.5b",
    label: "Qwen 2.5 1.5B",
    description: "En hızlı günlük sohbet",
    task: "chat",
  },
  {
    id: "qwen2.5:3b",
    label: "Qwen 2.5 3B",
    description: "Dengeli varsayılan model",
    task: "chat",
  },
  {
    id: "qwen2.5-coder:3b-instruct",
    label: "Qwen 2.5 Coder 3B",
    description: "Kod yazma ve kısa teknik işler",
    task: "code",
  },
  {
    id: "qwen2.5-coder:7b-instruct",
    label: "Qwen 2.5 Coder 7B",
    description: "Daha iyi kod, daha yavaş",
    task: "code",
  },
  {
    id: "qwen3:4b",
    label: "Qwen3 4B",
    description: "Yeni nesil hızlı Qwen",
    task: "writing",
  },
  {
    id: "qwen3:8b",
    label: "Qwen3 8B",
    description: "Daha güçlü Qwen",
    task: "writing",
  },
  {
    id: "llama3.2:3b",
    label: "Llama 3.2 3B",
    description: "Genel sohbet alternatifi",
    task: "chat",
  },
  {
    id: "mistral:7b",
    label: "Mistral 7B",
    description: "Genel amaçlı güçlü model",
    task: "writing",
  },
  {
    id: "gemma3:4b",
    label: "Gemma 3 4B",
    description: "Hızlı ve kompakt alternatif",
    task: "image",
  },
];
const FALLBACK_MODELS = MODEL_OPTIONS.map((model) => model.id).filter((id) => id !== DEFAULT_MODEL);
const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download/windows";
const OLLAMA_COMMAND_TIMEOUT_MS = 10 * 1000;
const OLLAMA_CHAT_TIMEOUT_MS = 90 * 1000;
const OLLAMA_PULL_TIMEOUT_MS = 30 * 60 * 1000;
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;

// Cookbook: model başına yaklaşık DONANIM gereksinimi (Q4 nicemleme).
// sizeGb = indirme boyutu, minVramGb = GPU'da rahat çalışma için, minRamGb = CPU/sistem,
// quality = 1..5 (Türkçe akıl yürütme için kabaca), note = kısa açıklama.
const MODEL_CATALOG = {
  "qwen2.5:1.5b": { params: "1.5B", sizeGb: 1.0, minVramGb: 2, minRamGb: 4, quality: 2, note: "En hızlı, en hafif sohbet" },
  "qwen3:1.7b": { params: "1.7B", sizeGb: 1.4, minVramGb: 2, minRamGb: 4, quality: 2, note: "Yeni nesil çok hafif" },
  "llama3.2:3b": { params: "3B", sizeGb: 2.0, minVramGb: 3, minRamGb: 6, quality: 2, note: "Hafif genel amaçlı" },
  "qwen2.5:3b": { params: "3B", sizeGb: 1.9, minVramGb: 3, minRamGb: 6, quality: 3, note: "Dengeli küçük model" },
  "qwen2.5-coder:3b": { params: "3B", sizeGb: 1.9, minVramGb: 3, minRamGb: 6, quality: 3, note: "Kod için hafif" },
  "qwen2.5-coder:3b-instruct": { params: "3B", sizeGb: 1.9, minVramGb: 3, minRamGb: 6, quality: 3, note: "Kod için hafif (instruct)" },
  "gemma3:4b": { params: "4B", sizeGb: 3.3, minVramGb: 4, minRamGb: 8, quality: 3, note: "Google Gemma 3" },
  "qwen3:4b": { params: "4B", sizeGb: 2.6, minVramGb: 4, minRamGb: 8, quality: 3, note: "Varsayılan — dengeli" },
  "mistral:7b": { params: "7B", sizeGb: 4.4, minVramGb: 6, minRamGb: 12, quality: 3, note: "Klasik 7B" },
  "qwen2.5-coder:7b": { params: "7B", sizeGb: 4.7, minVramGb: 6, minRamGb: 12, quality: 4, note: "Kod için güçlü" },
  "qwen2.5-coder:7b-instruct": { params: "7B", sizeGb: 4.7, minVramGb: 6, minRamGb: 12, quality: 4, note: "Kod için güçlü (instruct)" },
  "qwen3:8b": { params: "8B", sizeGb: 5.2, minVramGb: 7, minRamGb: 16, quality: 4, note: "En iyi denge (16 GB sistem)" },
  "qwen3:14b": { params: "14B", sizeGb: 9.0, minVramGb: 12, minRamGb: 32, quality: 5, note: "En güçlü — yüksek donanım" },
};

module.exports = {
  APP_NAME,
  FEDERATION_BASE_URL,
  DEFAULT_MODEL,
  MODEL_OPTIONS,
  MODEL_CATALOG,
  FALLBACK_MODELS,
  OLLAMA_DOWNLOAD_URL,
  OLLAMA_COMMAND_TIMEOUT_MS,
  OLLAMA_CHAT_TIMEOUT_MS,
  OLLAMA_PULL_TIMEOUT_MS,
  UPDATE_INTERVAL_MS,
};
