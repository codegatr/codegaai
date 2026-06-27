"use strict";

/**
 * competitive-intel.js — CODEGA AI Rekabet Zekası
 *
 * Sprint XX: Autonomous Evolution Platform (AEP)
 *
 * Rakipleri anlayarak farklılaş — kopyalama değil, anlama.
 * Düzenli karşılaştırma → eksik yetenekler → öncelik listesi.
 */

const fs   = require("node:fs");
const path = require("node:path");

// ── Rakip Profilleri (Statik Bilgi Tabanı) ────────────────────────────────────

const COMPETITORS = {
  cursor: {
    name       : "Cursor",
    type       : "IDE Plugin",
    strengths  : ["IDE entegrasyonu", "inline edit", "multi-file context", "git diff görünümü"],
    weaknesses : ["offline desteği yok", "model bağımlılığı", "enterprise fiyatlandırma"],
    uniqueValue: "VS Code tabanlı, geliştirici iş akışına sıkı entegrasyon",
  },
  claude_code: {
    name       : "Claude Code",
    type       : "CLI Agent",
    strengths  : ["terminal tabanlı", "bash araçları", "dosya sistemi tam erişim", "Anthropic modelleri"],
    weaknesses : ["GUI yok", "yerel model desteği sınırlı", "offline çalışmaz"],
    uniqueValue: "Güçlü CLI ajan, terminal tabanlı geliştirme için",
  },
  github_copilot: {
    name       : "GitHub Copilot",
    type       : "IDE Plugin",
    strengths  : ["GitHub entegrasyonu", "kod tamamlama", "PR özeti", "Bing arama"],
    weaknesses  : ["pahalı", "yerel model yok", "gizlilik sorunları"],
    uniqueValue: "GitHub'a sıkı entegrasyon, enterprise uyumlu",
  },
  windsurf: {
    name       : "Windsurf (Codeium)",
    type       : "IDE",
    strengths  : ["ücretsiz tier", "hızlı tamamlama", "Cascade ajan", "çok IDE desteği"],
    weaknesses : ["daha küçük model kapasitesi", "enterprise özellik eksikliği"],
    uniqueValue: "Erişilebilir fiyatlandırma, çok IDE desteği",
  },
  continue_dev: {
    name       : "Continue.dev",
    type       : "Open Source IDE Plugin",
    strengths  : ["açık kaynak", "özelleştirilebilir", "yerel model", "çoklu LLM"],
    weaknesses : ["kurulum karmaşık", "UX ham", "kurumsal destek yok"],
    uniqueValue: "Tam kontrol, yerel veya bulut model, açık kaynak",
  },
};

// ── CODEGA AI Yetenekleri ──────────────────────────────────────────────────────

const CODEGA_CAPABILITIES = [
  "yerel model (Ollama)",
  "offline çalışma",
  "RAG (belge bilgi tabanı)",
  "MCP desteği",
  "plugin sistemi",
  "proje hafızası",
  "mission-driven geliştirme",
  "otonom evrim motoru (AEP)",
  "CODEGA DNA değerlendirmesi",
  "ZIP engine",
  "git agent",
  "mühendislik backlog",
  "öğrenme veritabanı",
  "CTO dashboard",
  "builder engine",
];

// ── CompetitiveIntel Sınıfı ───────────────────────────────────────────────────

class CompetitiveIntel {
  constructor(dataDir) {
    this._dataDir  = dataDir;
    this._filePath = path.join(dataDir, "competitive-intel.json");
    this._analyses = [];
  }

  init() {
    try {
      fs.mkdirSync(this._dataDir, { recursive: true });
      if (fs.existsSync(this._filePath)) {
        const raw = JSON.parse(fs.readFileSync(this._filePath, "utf8"));
        this._analyses = raw.analyses || [];
      }
    } catch (e) {
      console.warn("[CompetitiveIntel] init:", e.message);
    }
    return this;
  }

  _save() {
    try {
      fs.writeFileSync(this._filePath, JSON.stringify({
        version : 1,
        savedAt : Date.now(),
        analyses: this._analyses.slice(-20),
      }, null, 2), "utf8");
    } catch (e) {
      console.warn("[CompetitiveIntel] save:", e.message);
    }
  }

  /**
   * Tam rekabet analizi çalıştır.
   * @returns {CompetitiveAnalysis}
   */
  analyze() {
    const gaps          = this._findGaps();
    const advantages    = this._findAdvantages();
    const opportunities = this._findOpportunities(gaps);
    const roadmapSuggestions = this._buildRoadmap(gaps, opportunities);

    const analysis = {
      id             : "CI-" + Date.now().toString(36).toUpperCase(),
      analyzedAt     : Date.now(),
      codegaCapabilities: CODEGA_CAPABILITIES,
      competitors    : COMPETITORS,
      gaps,
      advantages,
      opportunities,
      roadmapSuggestions,
      differentiator : this._coreDifferentiator(),
    };

    this._analyses.push(analysis);
    this._save();
    return analysis;
  }

  _findGaps() {
    // Rakiplerde olan ama CODEGA'da olmayan özellikler
    const allCompetitorStrengths = new Set(
      Object.values(COMPETITORS).flatMap(c => c.strengths)
    );
    const lower = new Set(CODEGA_CAPABILITIES.map(c => c.toLowerCase()));

    const gaps = [];
    for (const strength of allCompetitorStrengths) {
      if (!lower.has(strength.toLowerCase())) {
        // Kaç rakipte var?
        const count = Object.values(COMPETITORS).filter(c => c.strengths.includes(strength)).length;
        gaps.push({ feature: strength, competitorCount: count, priority: count * 2 });
      }
    }
    return gaps.sort((a, b) => b.priority - a.priority);
  }

  _findAdvantages() {
    // CODEGA'nın rakiplerde olmayan güçleri
    const allStrengths = new Set(
      Object.values(COMPETITORS).flatMap(c => c.strengths).map(s => s.toLowerCase())
    );
    return CODEGA_CAPABILITIES.filter(c => !allStrengths.has(c.toLowerCase()));
  }

  _findOpportunities(gaps) {
    // Rakiplerin zayıf olduğu alanlar → CODEGA için fırsat
    const opportunities = [];
    for (const [, competitor] of Object.entries(COMPETITORS)) {
      for (const weakness of competitor.weaknesses) {
        // CODEGA bu zayıflığı kapatiyor mu?
        const addressed = CODEGA_CAPABILITIES.some(c =>
          c.toLowerCase().includes(weakness.toLowerCase().split(" ")[0])
        );
        if (addressed) {
          opportunities.push({
            opportunity: `${competitor.name} zayıflığı: ${weakness}`,
            addressedBy: CODEGA_CAPABILITIES.find(c =>
              c.toLowerCase().includes(weakness.toLowerCase().split(" ")[0])
            ) || "mevcut yetenek",
          });
        }
      }
    }
    return opportunities;
  }

  _buildRoadmap(gaps, opportunities) {
    const suggestions = [];

    // En yüksek öncelikli gap'ler
    for (const gap of gaps.slice(0, 3)) {
      suggestions.push({
        type    : "gap",
        item    : `Eksik yetenek ekle: ${gap.feature}`,
        reason  : `${gap.competitorCount} rakipte mevcut`,
        priority: gap.priority,
      });
    }

    // AEP'in benzersiz değeri
    suggestions.push({
      type    : "differentiate",
      item    : "AEP'i öne çıkar: 'Kendini geliştiren tek AI editörü'",
      reason  : "Hiçbir rakipte otonom evrim döngüsü yok",
      priority: 100,
    });

    suggestions.push({
      type    : "differentiate",
      item    : "Offline + yerel model özelliğini pazarla",
      reason  : "Cursor, Copilot offline çalışmıyor",
      priority: 90,
    });

    return suggestions.sort((a, b) => b.priority - a.priority);
  }

  _coreDifferentiator() {
    return "CODEGA AI, kendini analiz eden, iyileştirmeler planlayan ve PR üreten tek AI mühendislik platformudur. "
      + "Rakipler yalnızca komut alır — CODEGA kendi gelişimini yönetir.";
  }

  latest() { return this._analyses[this._analyses.length - 1] || null; }

  summary() {
    const latest = this.latest();
    if (!latest) return { analyzed: false };
    return {
      analyzed      : true,
      analyzedAt    : latest.analyzedAt,
      gapCount      : latest.gaps.length,
      advantageCount: latest.advantages.length,
      topGaps       : latest.gaps.slice(0, 3).map(g => g.feature),
      topAdvantages : latest.advantages.slice(0, 3),
      differentiator: latest.differentiator,
    };
  }
}

module.exports = { CompetitiveIntel, COMPETITORS, CODEGA_CAPABILITIES };
