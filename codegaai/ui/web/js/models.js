/* models.js - System.js tarafindan yonetiliyor */
const Models = (() => {
  function init() {
    if (typeof Views !== "undefined") {
      Views.on(name => { if (name === "system") System.loadModels(); });
    }
  }
  function reload() { System.loadModels(); }
  return { init, reload };
})();
window.Models = Models;
