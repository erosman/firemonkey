import {App} from './app.js';
import {Meta} from './meta.js';
import {RemoteUpdate} from './remote-update.js';

// ----------------- installer (side effect) ---------------
class Installer {

  static {
    // message from install.js content script
    browser.runtime.onMessage.addListener(e =>
      e.install && this.process(e.text, e.name, e.updateURL));

    // --- auto-update on browser idle
    this.cache = [];
    browser.idle.onStateChanged.addListener(state => state === 'idle' && this.onIdle());
  }

  static async onIdle() {
    const pref = await browser.storage.local.get();
    const now = Date.now();
    const days = pref.autoUpdateInterval * 1;
    // 86400 * 1000 = 24hr
    if (!days || now <= pref.autoUpdateLast + (days * 86_400_000)) { return; }

    // rebuild cache if empty
    if (!this.cache[0]) {
      this.cache = App.getIds(pref).filter(i =>
        pref[i].autoUpdate && pref[i].updateURL && pref[i].version);
    }

    // do 10 updates at a time & check if script wasn't deleted
    this.cache.splice(0, 10).forEach(i => pref[i] &&
      RemoteUpdate.get(pref[i])
      .then(text => this.process(text, pref[i].name, pref[i].updateURL, pref))
    );

    // set autoUpdateLast after updates are finished
    !this.cache[0] && browser.storage.local.set({autoUpdateLast: now});
  }

  static async process(text, name, updateURL, pref) {
    const direct = !pref;
    pref ||= await browser.storage.local.get();
    const data = Meta.get(text, pref);
    if (!data) {
      App.log(`${name}: Meta Data error`, 'error');
      return;
    }

    // set id as _name
    const id = `_${data.name}`;
    const oldId = `_${name}`;

    // --- check name, if update existing
    if (pref[oldId] && data.name !== name) {
      // name has changed
      if (pref[id]) {
        // name already exists
        App.log(`${name}: Update new name already exists`, 'error');
        return;
      }
      // copy to new id
      pref[id] = pref[oldId];
      // delete old id
      delete pref[oldId];
      // remove old data
      await browser.storage.local.remove(oldId);
      // unregister old data message to background.js
      browser.runtime.sendMessage({update: 'script', pref, ids: [oldId]});
    }

    // --- check version, not for direct or local files
    if (!direct && !updateURL.startsWith('file:///') && pref[id] &&
          !App.higherVersion(data.version, pref[id].version)) { return; }

    // --- check for Direct Install, set install URL
    if (!data.updateURL && !updateURL.startsWith('file:///')) {
      data.updateURL = updateURL;
      data.autoUpdate = true;
    }

    // --- log message to display in Options -> Log
    const message = pref[id] ?
      `Updated version ${pref[id].version} ➜ ${data.version}` :
      `Installed version ${data.version}`;
    App.log(data.name, message, '', data.updateURL);
    direct && App.notify(data.name + '\n' + message);

    pref[id] = data;
    browser.storage.local.set({[id]: pref[id]});
  }
}