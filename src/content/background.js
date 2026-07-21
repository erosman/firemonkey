import {pref, App} from './app.js';
import {Sync} from './sync.js';
import {Script} from './script.js';
import {Counter} from './counter.js';
import {Migrate} from './migrate.js';
import {WebRequest} from './webrequest.js';
import {Installer} from './installer.js';
import './api-message.js';
import './menus.js';

// ---------- process preferences --------------------------
class ProcessPref {

  static {
    // register persistent listeners
    // from popup.js & options.js
    browser.runtime.onMessage.addListener((...e) => this.onMessage(...e));

    // cant runtime.sendMessage to the same context
    Installer.callback = e => this.onMessage(e);

    this.init();
  }

  static async init() {
    // user preference
    await App.getPref();

    // storage sync -> local update
    await Sync.get(pref);

    // migrate after storage sync check
    await Migrate.init(pref);

    // webRequest listener
    WebRequest.init(pref);

    // script counter
    Counter.init(pref);

    // scripts register
    Script.init(pref);
  }

  static onMessage(message) {
    const {update, pref, ids = []} = message;
    if (!update) { return; }

    // update Script Counter
    Counter.init(pref);

    switch (update) {
      // update script []
      case 'script':
        // update every userScript (enable/disable/code change)
        Script.update(pref, ids);
        break;

      // update globalExclude from options.js
      case 'globalExclude':
        // update all userScripts
        const js = App.getIds(pref).filter(i => i.js);
        Script.update(pref, js);
        break;

      // update all from sync.js
      case 'sync':
        // previously enabled but deleted
        Script.update(pref, ids);
        // all current scripts
        Script.update(pref);
        break;

      case 'cspExclude':
        WebRequest.init(pref);
        break;
    }
  }
}