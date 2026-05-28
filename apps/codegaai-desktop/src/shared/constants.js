const APP_NAME = "CODEGA AI";
const DEFAULT_MODEL = "qwen2.5:3b";
const MODEL_OPTIONS = [
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
const OLLAMA_CHAT_TIMEOUT_MS = 25 * 1000;
const OLLAMA_PULL_TIMEOUT_MS = 30 * 60 * 1000;
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;

module.exports = {
  APP_NAME,
  DEFAULT_MODEL,
  MODEL_OPTIONS,
  FALLBACK_MODELS,
  OLLAMA_DOWNLOAD_URL,
  OLLAMA_COMMAND_TIMEOUT_MS,
  OLLAMA_CHAT_TIMEOUT_MS,
  OLLAMA_PULL_TIMEOUT_MS,
  UPDATE_INTERVAL_MS,
};
