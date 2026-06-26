"use strict";

function critiquePhpSecurity(text) {
  const source = String(text || "");
  const issues = [];
  const lower = source.toLowerCase();

  if (/password_hash\s*=\s*[:?$]/i.test(source) || /where\s+[^\n;]*password_hash\s*=\s*[:?]/i.test(lower)) {
    issues.push({
      level: "critical",
      code: "password-verify-missing",
      message: "Şifre hash'i SQL içinde düz karşılaştırılmış. Kullanıcıyı e-posta/kullanıcı adıyla çekip password_verify() kullanılmalı.",
    });
  }
  if (lower.includes("password_hash") && !lower.includes("password_verify")) {
    issues.push({
      level: "critical",
      code: "password-verify-required",
      message: "password_hash kullanılmış ama giriş doğrulamasında password_verify() yok.",
    });
  }
  if (/new\s+PDO\s*\(\s*["']mysql:host=[^;"']+["']/i.test(source)) {
    issues.push({
      level: "warning",
      code: "pdo-dbname-missing",
      message: "PDO DSN içinde dbname belirtilmemiş. mysql:host=...;dbname=...;charset=utf8mb4 kullanılmalı.",
    });
  }
  if (lower.includes("$_session['user_id']") && !lower.includes("session_regenerate_id(true")) {
    issues.push({
      level: "warning",
      code: "session-regenerate-missing",
      message: "Başarılı girişten sonra session_regenerate_id(true) kullanılmalı.",
    });
  }
  if (/<form[\s\S]*method=["']post["']/i.test(source) && !/csrf|_token/i.test(source)) {
    issues.push({
      level: "warning",
      code: "csrf-missing",
      message: "POST formunda CSRF token görünmüyor.",
    });
  }

  return {
    ok: !issues.some((issue) => issue.level === "critical"),
    issues,
  };
}

function appendCriticReport(answer) {
  const report = critiquePhpSecurity(answer);
  if (!report.issues.length) return answer;
  const lines = ["", "---", "Phoenix Code Critic:"];
  for (const issue of report.issues) {
    lines.push(`- ${issue.level.toUpperCase()}: ${issue.message}`);
  }
  return `${String(answer || "").trim()}\n${lines.join("\n")}`.trim();
}

module.exports = {
  critiquePhpSecurity,
  appendCriticReport,
};
