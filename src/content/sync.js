// ---------- Storage Sync ---------------------------------
// In Firefox, extension data is synced every 10 minutes or whenever the user selects Sync Now
// increase storage.sync limit 100KB -> 1MB
// https://github.com/w3c/webextensions/issues/351
// Inconsistency: storage onChanged
// https://github.com/w3c/webextensions/issues/511

export class Sync {

  static {
    browser.storage.sync.onChanged.addListener(() => this.get());
  }

  static async get(pref) {
    pref ||= await browser.storage.local.get();

    // sync not enabled
    if (!pref.sync) { return; }

    const syncPref = await browser.storage.sync.get();

    // no update if there is no script in synched data
    if (!Object.keys(syncPref).find(i => i.startsWith('_'))) {
      return;
    }

    const ids = [];
    Object.keys(pref).forEach(i => {
      // deleted scripts
      if (i.startsWith('_') && !syncPref[i]) {
        // enabled scripts to unregister
        pref[i].enabled && ids.push(i);
        delete pref[i];
      }
    });

    // assign synced pref
    Object.assign(pref, syncPref);

    // update saved pref
    await browser.storage.local.set(pref);

    // update all & deleted ids message to background.js
    browser.runtime.sendMessage({update: 'sync', pref, ids});
  }
}