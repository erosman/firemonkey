// ---------- Default Preferences --------------------------
export const pref = {
  autoUpdateInterval: 0,
  autoUpdateLast: 0,
  cmOptions: '',
  counter: true,
  customOptionsCSS: '',
  customPopupCSS: '',
  globalScriptExcludeMatches: '',
  sync: false,
  template: {css: '', js: ''}
};
// ---------- /Default Preferences -------------------------

// ---------- App ------------------------------------------
export class App {

  static android = navigator.userAgent.includes('Android');

  // ---------- User Preferences ---------------------------
  static getPref() {
    // update pref with the saved version
    return browser.storage.local.get().then(result => {
      Object.keys(result).forEach(i => pref[i] = result[i]);
    });
  }

  // ---------- Helper functions ---------------------------
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
    log = log.slice(-(localStorage.getItem('logSize') * 1 || 100)); // slice to the last n entries, default 100
    localStorage.setItem('log', JSON.stringify(log));
  }

  static JSONparse(str) {
    try { return JSON.parse(str); }
    catch { return null; }
  }

  static getIds(pref) {
    return Object.keys(pref).filter(i => i.startsWith('_'));
  }

  static sortGrant(grant) {                                 // script.js, popup.js
    const grantKeep = [];
    const grantRemove = [];

    // only needed for storage APIs
    const storage = ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues'];

    grant.forEach(i =>
      storage.includes(i) && grant.includes(`GM.${i.substring(3)}`) ? grantRemove.push(i) : grantKeep.push(i)
    );

    return [grantKeep, grantRemove];
  }
}