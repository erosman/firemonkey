import {App} from './app.js';
import {Meta} from './meta.js';
import {RemoteUpdate} from './remote-update.js';

// ----------------- Web/Direct Installer & Remote Update (Side Effect)
class Installer {

  static {
    // message from content scripts
    browser.runtime.onMessage.addListener(e =>
      e.api === 'install' && this.processResponse(e.text, e.name, e.updateURL));

    RemoteUpdate.callback = this.processResponse.bind(this);

    // --- Remote Update
    this.cache = [];
    browser.idle.onStateChanged.addListener(state => this.onIdle(state));
  }

  // ---------- Remote Update ------------------------------
  static async onIdle(state) {
    if (state !== 'idle') { return; }

    const pref = await browser.storage.local.get();
    const now = Date.now();
    const days = pref.autoUpdateInterval * 1;
    if (!days || now <= pref.autoUpdateLast + (days * 86400000)) { return; } // 86400 * 1000 = 24hr

    if (!this.cache[0]) {                                   // rebuild the cache if empty
      this.cache = App.getIds(pref).filter(id => pref[id].autoUpdate && pref[id].updateURL && pref[id].version);
    }

    // do 10 updates at a time & check if script wasn't deleted
    this.cache.splice(0, 10).forEach(i => Object.hasOwn(pref, i) && RemoteUpdate.getUpdate(pref[i]));

    // set autoUpdateLast after updates are finished
    !this.cache[0] && browser.storage.local.set({autoUpdateLast: now}); // update saved pref
  }

  static async processResponse(text, name, updateURL) {     // from class RemoteUpdate.callback
    const pref = await browser.storage.local.get();
    const data = Meta.get(text, pref);
    if (!data) {
      throw `${name}: Meta Data error`;
    }

    const id = `_${data.name}`;                             // set id as _name
    const oldId = `_${name}`;

    // --- check name, if update existing
    if (pref[oldId] && data.name !== name) {                // name has changed
      if (pref[id]) {                                       // name already exists
        throw `${name}: Update new name already exists`;
      }

      pref[id] = pref[oldId];                               // copy to new id
      delete pref[oldId];                                   // delete old id
      browser.storage.local.remove(oldId);                  // remove old data (will get unregistered in processPrefUpdate)
    }

    // --- check version, if update existing, not for local files
    if (!updateURL.startsWith('file:///') && pref[id] &&
          !App.higherVersion(data.version, pref[id].version)) { return; }

    // --- check for Direct Install, set install URL
    if (!data.updateURL && !updateURL.startsWith('file:///')) {
      data.updateURL = updateURL;
      data.autoUpdate = true;
    }

    // --- log message to display in Options -> Log
    const message = pref[id] ? `Updated version ${pref[id].version} ➜ ${data.version}` : `Installed version ${data.version}`;
    App.log(data.name, message, '', data.updateURL);

    pref[id] = data;                                        // save to pref
    browser.storage.local.set({[id]: pref[id]});            // update saved pref
  }
  // ---------- /Remote Update -----------------------------
}