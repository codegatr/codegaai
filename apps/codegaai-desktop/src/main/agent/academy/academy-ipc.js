"use strict";

/**
 * academy-ipc.js — CODEGA AI Academy IPC kayit modulu
 *
 * Kanallar:
 *   academy:summary        ()                    → ozet (level, maturity, certs)
 *   academy:transcript     ()                    → tam transkript
 *   academy:curriculum     ()                    → tum dersler (hafif: id/level/title/goal)
 *   academy:level          (level)               → o seviyenin dersleri
 *   academy:lesson         (lessonId)            → tek ders (tam icerik)
 *   academy:study          (lessonId)            → dersi calis
 *   academy:exam           (lessonId, answers[]) → sinav sonucu
 *   academy:report-card    ()                    → cok eksenli karne
 *   academy:knowledge      ()                    → promote edilen kalici kurallar
 */

const { app, ipcMain } = require("electron");
const path = require("node:path");
const { AcademyOS } = require("./academy-os");

let _academy = null;

function ok(data) { return { ok: true, data }; }
function err(e)   { return { ok: false, error: String(e?.message || e) }; }

/**
 * @param {object} [engineeringBrain] — ACE EngineeringBrain instance (gecilirse kurallar canli prompt'a akar)
 */
function registerAcademyIpc(engineeringBrain = null) {
  if (!_academy) {
    const dataDir = path.join(app.getPath("userData"), "academy");
    _academy = new AcademyOS({ dataDir, engineeringBrain }).init();
  }

  ipcMain.handle("academy:summary",     async ()              => { try { return ok(_academy.summary()); }            catch (e) { return err(e); } });
  ipcMain.handle("academy:transcript",  async ()              => { try { return ok(_academy.transcript()); }         catch (e) { return err(e); } });
  ipcMain.handle("academy:curriculum",  async ()              => { try { return ok(_academy.curriculum().map(liteLesson)); } catch (e) { return err(e); } });
  ipcMain.handle("academy:level",       async (_e, level)     => { try { return ok(_academy.lessonsForLevel(Number(level)).map(liteLesson)); } catch (e) { return err(e); } });
  ipcMain.handle("academy:lesson",      async (_e, id)        => { try { return ok(_academy.getLesson(String(id))); } catch (e) { return err(e); } });
  ipcMain.handle("academy:study",       async (_e, id)        => { try { return ok(_academy.studyLesson(String(id))); } catch (e) { return err(e); } });
  ipcMain.handle("academy:exam",        async (_e, id, ans)   => { try { return ok(_academy.takeExam(String(id), Array.isArray(ans) ? ans : [])); } catch (e) { return err(e); } });
  ipcMain.handle("academy:report-card", async ()              => { try { return ok(_academy.reportCard()); }         catch (e) { return err(e); } });
  ipcMain.handle("academy:knowledge",   async ()              => { try { return ok(_academy.engineeringKnowledge()); } catch (e) { return err(e); } });

  return _academy;
}

function liteLesson(l) {
  return { id: l.id, level: l.level, title: l.title, goal: l.goal, hasExam: (l.exam?.questions || []).length > 0, stub: !!l._stub };
}

function getAcademy() { return _academy; }

module.exports = { registerAcademyIpc, getAcademy };
