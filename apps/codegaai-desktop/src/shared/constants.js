const APP_NAME = "CODEGA AI";
const FEDERATION_BASE_URL = "https://ai.codega.com.tr/api/federation";
const DEFAULT_MODEL = "qwen3.5:4b";
const MODEL_OPTIONS = [
  {
    id: "qwen3.5:0.8b",
    label: "Qwen3.5 0.8B",
    description: "Guncel ve cok hafif Qwen3.5",
    task: "chat",
  },
  {
    id: "qwen3.5:2b",
    label: "Qwen3.5 2B",
    description: "Dusuk bellekli cihazlar icin guncel model",
    task: "chat",
  },
  {
    id: "qwen3.5:4b",
    label: "Qwen3.5 4B",
    description: "Guncel varsayilan; sohbet, muhakeme ve arac kullanimi",
    task: "writing",
  },
  {
    id: "qwen3.5:9b",
    label: "Qwen3.5 9B",
    description: "Guclu yerel muhakeme ve kodlama secenegi",
    task: "writing",
  },
  {
    id: "qwen3.6:27b",
    label: "Qwen3.6 27B",
    description: "En yeni ust seviye Qwen; yuksek RAM veya VRAM ister",
    task: "writing",
  },
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
const FALLBACK_MODELS = [
  "qwen3.5:0.8b",
  "qwen2.5:1.5b",
  "qwen3:1.7b",
  "qwen3.5:2b",
  "llama3.2:3b",
  "qwen2.5:3b",
  "qwen2.5-coder:3b",
  "qwen2.5-coder:3b-instruct",
  "gemma3:4b",
  "qwen3:4b",
  "mistral:7b",
  "qwen2.5-coder:7b",
  "qwen2.5-coder:7b-instruct",
  "qwen3:8b",
  "qwen3.5:9b",
  "qwen3:14b",
  "qwen3.6:27b",
].filter((id) => id !== DEFAULT_MODEL);
const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download/windows";
const OLLAMA_COMMAND_TIMEOUT_MS = 15 * 1000;
const OLLAMA_CHAT_TIMEOUT_MS = 35 * 1000;
const OLLAMA_PULL_TIMEOUT_MS = 30 * 60 * 1000;
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;

// Cookbook: model başına yaklaşık DONANIM gereksinimi (Q4 nicemleme).
// sizeGb = indirme boyutu, minVramGb = GPU'da rahat çalışma için, minRamGb = CPU/sistem,
// quality = 1..5 (Türkçe akıl yürütme için kabaca), note = kısa açıklama.
const MODEL_CATALOG = {
  "qwen3.5:0.8b": { params: "0.8B", sizeGb: 1.0, minVramGb: 2, minRamGb: 4, quality: 2, note: "En hafif guncel Qwen3.5" },
  "qwen3.5:2b": { params: "2B", sizeGb: 2.0, minVramGb: 3, minRamGb: 6, quality: 3, note: "Dusuk donanim icin guncel" },
  "qwen3.5:4b": { params: "4B", sizeGb: 3.4, minVramGb: 5, minRamGb: 10, quality: 4, note: "Guncel varsayilan - en iyi yerel denge" },
  "qwen3.5:9b": { params: "9B", sizeGb: 6.6, minVramGb: 8, minRamGb: 18, quality: 5, note: "Guclu muhakeme; CPU offload gerekebilir" },
  "qwen3.6:27b": { params: "27B", sizeGb: 17.0, minVramGb: 20, minRamGb: 40, quality: 5, note: "En yeni ust seviye Qwen; workstation" },
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
