// ---------- default preferences --------------------------
export const pref = {
  autoUpdateInterval: 0,
  autoUpdateLast: 0,
  counter: true,
  cspExclude: '',
  customOptionsCSS: '',
  customPopupCSS: '',
  editorOptions: '',
  globalExclude: '',
  linterOptions: '',
  sync: false,
  template: {css: '', js: ''},
};
// ---------- /default preferences -------------------------

// ---------- app ------------------------------------------
export class App {

  static android = navigator.userAgent.includes('Android');

  // ---------- user preferences ---------------------------
  static getPref() {
    // update pref with the saved version
    return browser.storage.local.get().then(r => Object.assign(pref, r));
  }

  // ---------- helper functions ---------------------------
  static notify(message, title = browser.i18n.getMessage('extensionName'), id = '') {
    browser.notifications.create(id, {
      type: 'basic',
      iconUrl: '/image/icon.svg',
      title,
      message
    });
  }

  static log(ref, message, type = '', updateURL = '') {
    let log = App.JSONparse(localStorage.getItem('log')) || [];
    log.push([new Date().toString().substring(0, 24), ref, message, type, updateURL]);
    // slice to the last n entries, default 100
    log = log.slice(-(localStorage.getItem('logSize') * 1 || 100));
    localStorage.setItem('log', JSON.stringify(log));
  }

  static JSONparse(str) {
    try { return JSON.parse(str); }
    catch { return null; }
  }

  static getIds(pref) {
    return Object.keys(pref).filter(i => i.startsWith('_'));
  }

  static higherVersion(a, b) {
    return a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}) > 0;
  }

  static getLanguage() {
    const [generic] = navigator.language.split('-');
    return [navigator.language, generic];
  }
}