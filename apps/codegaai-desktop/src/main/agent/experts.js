"use strict";
/**
 * agent/experts.js
 * -----------------
 * Uzman modları (README: "uzman profilleri"). Kullanıcı bir alan uzmanı seçince
 * tüm sohbet o alana göre yönlendirilir — sistem promptuna kişilik eklenir.
 *
 * personaFor/resolve saf → modelsiz test edilebilir.
 */

const EXPERTS = {
  genel: { label: "Genel", persona: "" },
  php: {
    label: "PHP Uzmanı",
    persona:
      "Bu sohbette kıdemli bir PHP 8.3 uzmanı gibi davran: modern PHP, güvenlik " +
      "(SQL injection/XSS), PSR ve çalışır kod örneklerine odaklan.",
  },
  python: {
    label: "Python Uzmanı",
    persona:
      "Bu sohbette kıdemli bir Python uzmanı gibi davran: temiz kod, tip ipuçları, " +
      "standart kütüphane ve PEP 8'e uygun çalışır örnekler ver.",
  },
  javascript: {
    label: "JS/Node Uzmanı",
    persona:
      "Bu sohbette kıdemli bir JavaScript/Node.js uzmanı gibi davran: modern ES, " +
      "async/await ve güvenli, çalışır örneklere odaklan.",
  },
  devops: {
    label: "DevOps Uzmanı",
    persona:
      "Bu sohbette bir DevOps uzmanı gibi davran: Linux, Docker, CI/CD, Nginx ve " +
      "dağıtım konularında pratik, komut düzeyinde rehberlik ver.",
  },
  finans: {
    label: "Finans/Muhasebe",
    persona:
      "Bu sohbette finans ve muhasebe konularında dikkatli bir uzman gibi davran: " +
      "kavramları net açıkla, hesapları göster. Yatırım tavsiyesi vermekten kaçın, " +
      "bilgi sun ve kullanıcının kendi kararını vermesini sağla.",
  },
  hukuk: {
    label: "Hukuk (bilgi)",
    persona:
      "Bu sohbette hukuki konularda bilgilendirici bir uzman gibi davran: genel " +
      "çerçeveyi açıkla, ama avukat olmadığını ve bunun hukuki tavsiye olmadığını belirt.",
  },
};

function resolve(name) {
  const key = String(name || "").trim().toLowerCase();
  return EXPERTS[key] ? key : "genel";
}

/** Seçili uzmanın persona metni (genel ise boş). */
function personaFor(name) {
  return (EXPERTS[resolve(name)] || EXPERTS.genel).persona;
}

function list() {
  return Object.entries(EXPERTS).map(([id, e]) => ({ id, label: e.label }));
}

module.exports = { EXPERTS, resolve, personaFor, list };
