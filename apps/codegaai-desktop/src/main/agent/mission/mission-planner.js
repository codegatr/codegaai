"use strict";

/**
 * mission-planner.js — CODEGA AI Mission Planlayıcı (LLM-Powered)
 *
 * Sprint 10: MissionOS
 *
 * Kullanıcı niyetini tam bir Mission Graph'a dönüştürür:
 *   Kullanıcı Niyeti → Mission → Milestones → Tasks → SubTasks
 *
 * LLM'den yapılandırılmış JSON çıktı ister; parse edemezse
 * akıllıca fallback planı döner.
 */

const {
  PRIORITY,
  SPRINT_TYPE,
  AGENT_ROSTER,
  createMission,
  createMilestone,
  createTask,
  createSubTask,
} = require("./mission-types");

// ── Sistem Promptu ────────────────────────────────────────────────────────────

const PLANNER_SYSTEM = `Sen CODEGA AI'nın Mission Planlayıcısısın.
Bir yazılım geliştirme görevini tam bir mission planına dönüştürürsün.

Kullanılabilir ajan rolleri: ${AGENT_ROSTER.join(", ")}

Sprint türleri:
- "foundation": Altyapı, mimari, güvenlik, performans, kalite iyileştirmeleri
- "capability": Kullanıcıya görünür yeni özellikler ve yetenekler

Risk Skoru (0-10): 0=çok düşük risk, 10=kritik risk. Rollback planı gerekli.

SADECE geçerli JSON yanıtla. Şema:
{
  "title": "Kısa ve net misyon başlığı",
  "description": "Misyonun amacı ve kapsamı",
  "priority": "critical|high|medium|low",
  "riskScore": 0-10,
  "estimatedMinutes": 60,
  "estimatedTokens": 10000,
  "requiredAgents": ["ajan listesi"],
  "rollbackPlan": "Bu misyon başarısız olursa ne yapılır",
  "sprintType": "foundation|capability",
  "milestones": [
    {
      "title": "Milestone başlığı",
      "tasks": [
        {
          "title": "Task başlığı",
          "description": "Ne yapılacak",
          "agent": "ajan_adı",
          "dependencies": [],
          "subtasks": [
            { "title": "Alt görev", "agent": "ajan_adı" }
          ]
        }
      ]
    }
  ]
}`;

// ── Fallback Planı ────────────────────────────────────────────────────────────

/**
 * LLM başarısız olursa temel bir plan döner.
 */
function _fallbackPlan(intent) {
  return createMission({
    title:            `Görev: ${String(intent).slice(0, 60)}`,
    description:      String(intent),
    priority:         PRIORITY.MEDIUM,
    riskScore:        4,
    estimatedMinutes: 45,
    estimatedTokens:  8000,
    requiredAgents:   ["planner", "builder", "qa"],
    rollbackPlan:     "Değişiklikler geri alınır, önceki sürüm aktifleştirilir.",
    sprintType:       SPRINT_TYPE.CAPABILITY,
    milestones: [
      createMilestone({
        title: "Analiz",
        tasks: [
          createTask({ title: "Görevi analiz et", agent: "architect", description: "Mevcut kodu ve gereksinimleri incele" }),
          createTask({ title: "Etki alanını belirle", agent: "planner", description: "Hangi modüller etkilenecek?" }),
        ],
      }),
      createMilestone({
        title: "Uygulama",
        tasks: [
          createTask({ title: "Kodu yaz", agent: "builder", description: intent }),
          createTask({ title: "Testleri güncelle", agent: "qa", description: "Yeni kod için birim testleri yaz" }),
        ],
      }),
      createMilestone({
        title: "Yayın",
        tasks: [
          createTask({ title: "Code review", agent: "qa", description: "Kalite ve güvenlik kontrolü" }),
          createTask({ title: "Git commit + tag", agent: "git", description: "Değişiklikleri commit et ve versiyon tag'i oluştur" }),
        ],
      }),
    ],
  });
}

// ── JSON Ayrıştırıcı ─────────────────────────────────────────────────────────

function _extractJson(text) {
  // Kod bloğu içinde mi?
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw   = block ? block[1].trim() : text.trim();
  // İlk { ... } bloğu
  const start = raw.indexOf("{");
  const end   = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

/**
 * LLM çıktısından Mission nesnesi oluşturur.
 */
function _jsonToMission(json) {
  if (!json || typeof json !== "object") return null;
  return createMission({
    title:            String(json.title || "").slice(0, 120) || "Unnamed Mission",
    description:      String(json.description || ""),
    priority:         Object.values(PRIORITY).includes(json.priority) ? json.priority : PRIORITY.MEDIUM,
    riskScore:        Number(json.riskScore) || 5,
    estimatedMinutes: Number(json.estimatedMinutes) || 60,
    estimatedTokens:  Number(json.estimatedTokens) || 10000,
    requiredAgents:   Array.isArray(json.requiredAgents) ? json.requiredAgents.filter(a => AGENT_ROSTER.includes(a)) : [],
    rollbackPlan:     String(json.rollbackPlan || ""),
    sprintType:       json.sprintType === SPRINT_TYPE.FOUNDATION ? SPRINT_TYPE.FOUNDATION : SPRINT_TYPE.CAPABILITY,
    milestones:       Array.isArray(json.milestones)
      ? json.milestones.map(ms => createMilestone({
          title: String(ms.title || "Milestone"),
          tasks: Array.isArray(ms.tasks) ? ms.tasks.map(t => createTask({
            title:        String(t.title || "Task"),
            description:  String(t.description || ""),
            agent:        AGENT_ROSTER.includes(t.agent) ? t.agent : "builder",
            dependencies: Array.isArray(t.dependencies) ? t.dependencies : [],
            subtasks:     Array.isArray(t.subtasks) ? t.subtasks.map(st => createSubTask({
              title: String(st.title || "SubTask"),
              agent: AGENT_ROSTER.includes(st.agent) ? st.agent : "builder",
            })) : [],
          })) : [],
        }))
      : [],
  });
}

// ── Ana Fonksiyon ─────────────────────────────────────────────────────────────

/**
 * Kullanıcı niyetinden tam Mission planı oluşturur.
 *
 * @param {string}   intent        — kullanıcının isteği
 * @param {Function} generateFn    — async (messages) => string  (cloud-provider)
 * @param {object}   context       — opsiyonel ek bağlam (codebase summary, vb.)
 * @returns {Promise<object>}      — createMission() ile oluşturulmuş mission
 */
async function planMission(intent, generateFn, context = {}) {
  const contextNote = context.summary
    ? `\n\nMevcut sistem bağlamı:\n${String(context.summary).slice(0, 500)}`
    : "";

  const messages = [
    { role: "system", content: PLANNER_SYSTEM },
    {
      role: "user",
      content: `Şu görev için tam mission planı oluştur:\n\n"${intent}"${contextNote}\n\nSadece JSON yanıtla.`,
    },
  ];

  let raw = "";
  try {
    raw = await generateFn(messages);
  } catch (e) {
    console.warn("[MissionPlanner] LLM çağrısı başarısız:", e.message);
    return _fallbackPlan(intent);
  }

  const json    = _extractJson(raw);
  const mission = json ? _jsonToMission(json) : null;

  if (!mission || !mission.milestones.length) {
    console.warn("[MissionPlanner] Plan parse edilemedi, fallback kullanılıyor.");
    return _fallbackPlan(intent);
  }

  return mission;
}

/**
 * Bir string'in mission niyeti mi yoksa sohbet mi olduğuna karar verir.
 * Kısayol: doğrudan LLM'e gitmeden önce heuristik kontrol.
 */
function looksLikeMission(text) {
  const t = String(text || "").toLowerCase().trim();
  if (t.length < 15) return false;
  const missionVerbs = [
    "yap", "kur", "oluştur", "olustur", "geliştir", "gelistir",
    "entegre", "ekle", "çıkar", "cikar", "taşı", "tasi",
    "migrate", "refactor", "düzelt", "duzelt", "optimize",
    "implement", "build", "create", "add", "fix", "upgrade",
    "sprint", "mission", "özellik", "ozellik", "modül", "modul",
  ];
  return missionVerbs.some(v => t.includes(v));
}

module.exports = { planMission, looksLikeMission, _extractJson, _jsonToMission, _fallbackPlan };
