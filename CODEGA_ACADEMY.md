# CODEGA AI Academy — Artificial Software Engineer Training Program

CODEGA AI artık yalnızca kod yazan bir araç değil; **sürekli öğrenen ve mühendislik
olgunluğu artan bir yapay yazılım mühendisi** olarak eğitiliyor. Academy, bu eğitimin
kalıcı alt sistemidir.

## Felsefe

> Her bug bir eğitim, her başarısızlık bir bilgi, her başarı bir mühendislik içgüdüsü olur.

Academy **teori deposu değildir** — dersleri gerçek CODEGA mühendislik olaylarına
dayanır (kurumsal hafıza). Örnek ilk dersler doğrudan bu projede yaşanan hatalardan türedi:

- `installer.js` truncation → **"Always validate UTF-8 and full-file syntax before release"**
- Surum string kıyas riski → **"Never compare semantic versions as strings"**
- Electron renderer → **"Never block the Electron renderer"**
- Test'siz merge → **"Never merge without tests; always verify exit codes"**

## Mimari

```
apps/codegaai-desktop/src/main/agent/academy/
  curriculum.js     — 8 seviye, 57 ders (Level 1 tam işlenmiş, gerçek olaylara dayalı)
  academy-os.js     — orkestratör: study → exam → certification → report card → reflection
  academy-ipc.js    — renderer IPC köprüsü
```

Runtime verisi `userData/academy/` altında: `transcript.json`, `learning-history.jsonl`,
`report-cards.jsonl`, `reflections.jsonl`.

## Kritik entegrasyon: Engineering Brain'e promote

Geçilen her dersin `brainRules`'u, ACE `EngineeringBrain`'ine **promote** edilir.
EngineeringBrain canlı chat prompt'una bağlı olduğu için (`buildContext` →
`contextReconstructor`), **öğrenilen her kural otomatik olarak gelecekteki tüm LLM
çağrılarına akar.** Yani Academy teori değil, davranış değiştiren bir döngüdür.

## 8 Seviye

| Seviye | Başlık | Odak |
|---|---|---|
| 1 | Junior Developer | Git, Node, Electron, TS, Testing, JSON, Monorepo, CI |
| 2 | Senior Developer | Architecture, Performance, Async, Memory, Builder, ZIP, Git Agent, QA, Release |
| 3 | Software Architect | SOLID, DDD, Clean Architecture, Event Driven, Dependency Graph, Scalability, Plugins |
| 4 | Principal Engineer | Technical Debt, Benchmark, Refactoring, Migration, Performance Budget, Metrics |
| 5 | CTO | Roadmaps, Risk, Release Planning, Cost, Architecture Decisions, Rollback, Competitive |
| 6 | Artificial Engineer | Self Review/Criticism/Testing/Benchmark/Optimization, Patch/PR Generation |
| 7 | Artificial Cognition | Project/User Brain, Life/Mission/Knowledge Graph, Reference Resolution, Context, Goals |
| 8 | Artificial Evolution | Engineering Backlog, Improvement Planner, Evolution Engine, Competitive Intel, Genome |

## Ders formatı

Her ders: Lesson Goal, Theory, Real Examples, Engineering Rules (do/dont/why),
Common Mistakes, Architecture Notes, Practical Exercise, Final Exam, Certification.

## Report Card eksenleri

Knowledge · Architecture · Reasoning · Engineering · Code Quality · Risk Awareness ·
Context Awareness · Mission Awareness · Overall Grade (A–F) · Maturity Score.

## Retraining

Aynı dersin sınavı iki kez başarısız olursa otomatik **retraining** kaydı oluşur.

## IPC API (`window.codega.academy`)

`summary`, `transcript`, `curriculum`, `level(n)`, `lesson(id)`, `study(id)`,
`exam(id, answers[])`, `reportCard`, `knowledge`.

## Yol Haritası (Phase II+)

- Level 2–8 derslerinin tam içeriği (şu an yapılandırılmış iskelet + çekirdek kurallar).
- Engineering Dashboard UI'da "Engineering Maturity" paneli (renderer — Codex).
- Gerçek projeler üzerinden pratik laboratuvarları (University of CODEGA).
- Her release'in mühendislik olgunluğunu ölçülebilir şekilde artırması.
