"use strict";

const AGENTS = {
  chat: {
    id: "chat-agent",
    label: "Chat Agent",
    role: "Kisa, net ve dogal sohbet yanitlari uretir.",
  },
  short_fact: {
    id: "reasoner-agent",
    label: "Reasoner Agent",
    role: "Kisa bilgi, tanim ve akil yurutme yanitlari uretir.",
  },
  code: {
    id: "code-agent",
    label: "Code Agent",
    role: "Kod yazar, duzeltir, refactor eder ve teknik cozum uretir.",
  },
  analysis: {
    id: "analyst-agent",
    label: "Analyst Agent",
    role: "Mimari, planlama, analiz ve strateji uretir.",
  },
  research: {
    id: "research-agent",
    label: "Research Agent",
    role: "Kaynak arar, dogrular, ozetler ve raporlar.",
  },
  design: {
    id: "design-agent",
    label: "Design Agent",
    role: "Gorsel, UI/UX, marka ve tasarim isteklerini yonetir.",
  },
};

function selectAgent(intent) {
  const type = intent && intent.type ? intent.type : "chat";
  return AGENTS[type] || AGENTS.chat;
}

module.exports = {
  AGENTS,
  selectAgent,
};
