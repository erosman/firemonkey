import {App} from './app.js';
import {Meta} from './meta.js';
import {CustomValidity} from './custom-validity.js';

// ---------- remote update --------------------------------
export class RemoteUpdate {

  // updateButton is set when loaded from options.js
  static updateButton = document.querySelector('.scripts button[data-i18n="update"]');

  static async get(item) {
    // drop userstyles.org update
    if (item.updateURL.startsWith('https://userstyles.org/styles/')) {
      this.updateButton &&
        CustomValidity.set(this.updateButton, 'userstyles.org update has been dropped');
      return;
    }

    item.metaURL ||= Meta.getMetaURL(item.updateURL);
    return item.metaURL ? this.getMeta(item) : this.getScript(item);
  }

  static async getMeta(item) {
    return fetch(item.metaURL)
    .then(r => r.text())
    .then(text => this.needUpdate(text, item) && this.getScript(item, true))
    .catch(e => App.log(item.name, `getMeta ${item.metaURL} ➜ ${e}`, 'error'));
  }

  static async getScript(item, fromGetMeta) {
    return fetch(item.updateURL)
    .then(r => r.text())
    .then(text => (fromGetMeta || this.needUpdate(text, item)) && text)
    .catch(e => App.log(item.name, `getScript ${item.updateURL} ➜ ${e}`, 'error'));
  }

  static needUpdate(text, item) {
    // check version
    const version = text.match(/@version\s+(\S+)/);
    const result = version && App.higherVersion(version[1], item.version);
    !result && this.updateButton &&
      CustomValidity.set(this.updateButton, browser.i18n.getMessage('noNewUpdate'));
    return result;
    // true/false
  }
}