"use strict";

/**
 * timeline-seed.js — Mühendislik zaman çizelgesinin başlangıç tohumu.
 *
 * CODEGA AI'nin gerçek mühendislik geçmişi (alpha.47→alpha.65). EngineeringTimeline
 * boşsa bir kez yüklenir; idempotenttir (tip+version+başlık tekrarı eklenmez).
 * Yeni sürümlerde buraya yeni olay eklemek yeterli — eskiler korunur.
 */

const D = (iso) => Date.parse(iso);

const SEED_TIMELINE = [
  { type: "lesson", version: "alpha.47", title: "git-status footgun: 'Eğitim'→fold→'egitim' ⊃ 'git'", why: "Aşırı geniş anahtar eşleşmesi yanlış araç tetikledi; fold sonrası substring eşleşmesi tehlikeli.", at: D("2026-06-29T10:00:00Z"), tags: ["regression", "intent"] },
  { type: "optimization", version: "alpha.50", title: "Anti-tekrar gen parametreleri (repeat_penalty/repeat_last_n/top_p/top_k)", why: "Küçük modeller 'Bu bu paketi' gibi döngüye giriyordu; örnekleme parametreleri eklendi.", at: D("2026-06-29T11:00:00Z"), tags: ["ollama", "quality"] },
  { type: "decision", version: "alpha.52", title: "answer-adequacy kapısı: uzun teknik soruya saf-sayı cevabı reddet", why: "'6 TL' gibi alakasız kısa cevaplar; isLongTechnicalQuestion + isInadequateAnswer.", at: D("2026-06-29T12:00:00Z"), tags: ["guard", "quality"] },
  { type: "release", version: "alpha.54", title: "Güvenli proje ZIP servisi (staged commit + rollback)", ref: "PR #99", why: "Path-traversal/symlink korumalı atomik import/export.", at: D("2026-06-29T17:35:00Z"), tags: ["zip", "security"] },
  { type: "release", version: "alpha.56", title: "Chat içi ZIP + Chat/Cowork/Code modları + mesaj kopyala", ref: "PR #102", why: "ZIP sohbet penceresine taşındı (sidebar yanlış anlaşılmaydı); Claude-benzeri mod yapısı.", at: D("2026-06-29T19:05:00Z"), tags: ["ux", "zip"] },
  { type: "release", version: "alpha.57", title: "Kademeli public-içerik web çekme (T1 direct→T2 mobil→T3 reader)", ref: "PR #104", why: "insane-search fikri; login/paywall'da durur, yalnız public içerik.", at: D("2026-06-29T20:05:00Z"), tags: ["web", "tools"] },
  { type: "optimization", version: "alpha.58", title: "Akış DOM mikro-güncelleme (her karede tüm konuşmayı yeniden çizme)", ref: "PR #107", why: "Streaming her rAF'te innerHTML='' ile O(n) DOM yıkıyordu; canlı .msg-body düğümüne yaz.", at: D("2026-06-29T20:25:00Z"), tags: ["performance", "render"] },
  { type: "decision", version: "alpha.58", title: "release.ps1 transaction koruması (lockfile + rollback + finally)", ref: "PR #107", why: "Sürüm-bump'ı atomik; hata halinde yedekten geri yükle, kilidi her koşulda temizle.", at: D("2026-06-29T20:25:00Z"), tags: ["pipeline", "powershell"] },
  { type: "optimization", version: "alpha.59", title: "Çıktı-tavanı otomatik devam (done_reason:length → continue)", ref: "PR #110", why: "10-soru testinde yanıt token tavanında kesiliyordu; sequential continuation + aggregation.", at: D("2026-06-30T04:00:00Z"), tags: ["ollama", "reasoning"] },
  { type: "optimization", version: "alpha.61", title: "Uyarlanır num_ctx (büyük prompt budanmasın)", ref: "PR #113", why: "Büyük prompt 8192'yi aşınca Ollama buduyor→dejenerasyon; 16384'e ölçekle.", at: D("2026-06-30T04:43:00Z"), tags: ["ollama", "context"] },
  { type: "release", version: "alpha.62", title: "Ardışık prompt chunking (_askBatched)", ref: "PR #114", why: "Çok-soru yükünü 4'erli paketlerle sıralı işle; fail-safe continue.", at: D("2026-06-30T05:16:00Z"), tags: ["reasoning", "chunking"] },
  { type: "regression", version: "alpha.60", title: "'0.75' çökmesi: çok-soru cevabı tek Final Answer'a çökertiliyordu", ref: "PR #112", why: "TDE köşeli etiketleri görev saymıyor→sanitizer keepAll atlanıyordu; isMultiQuestionInput eklendi.", at: D("2026-06-30T04:32:00Z"), tags: ["sanitizer", "regression"] },
  { type: "decision", version: "alpha.63", title: "Koşulsuz kısa-cevap guard'ı (dış ask katmanı)", ref: "PR #115/#116", why: "İç guard !isMultiTask ile kapalıydı; ham '0.75' sızıyordu. Codex teşhisi + Claude review.", at: D("2026-06-30T07:18:00Z"), tags: ["guard", "codex"] },
  { type: "decision", version: "alpha.64", title: "Otomatik model yükseltme (ağır promptta en güçlü kurulu model)", ref: "PR #118", why: "Router yalnız panele bağlıydı; 4B varsayılan hep öndeydi. Ağır promptta 9B'ye otomatik geç.", at: D("2026-06-30T07:48:00Z"), tags: ["routing", "models"] },
  { type: "lesson", version: "alpha.64", title: "Asıl darboğaz pipeline değil MODEL (~4B Qwen)", why: "12-soru testinde kanıtlandı: kod katmanları çöpü engelliyor ama 4B muhakeme gücü yetmiyor. 7-9B öner.", at: D("2026-06-30T07:50:00Z"), tags: ["models", "diagnosis"] },
];

module.exports = { SEED_TIMELINE };
