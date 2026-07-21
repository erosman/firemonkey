import {App} from './app.js';
import {Match} from './match.js';

// ---------- script counter -------------------------------
export class Counter {

  static {
    // default colors
    browser.browserAction.setBadgeBackgroundColor({color: '#cd853f'});
    browser.browserAction.setBadgeTextColor({color: '#fff'});
  }

  // pref from background.js
  static init(pref) {
    if (!pref.counter) {
      browser.tabs.onUpdated.removeListener(this.process);
      return;
    }

    this.pref = pref;

    // extraParameters not supported on Android
    App.android ?
      browser.tabs.onUpdated.addListener(this.process) :
      browser.tabs.onUpdated.addListener(this.process, {
        urls: ['*://*/*', 'file:///*'],
        properties: ['status'],
      });
  }

  static process(tabId, changeInfo, tab) {
    if (changeInfo.status !== 'complete') { return; }
    if (App.android && !/^(https?|file):/i.test(tab.url)) { return; }

    Match.process(tab, Counter.pref, 'bg')
    .then(count => {
      browser.browserAction.setBadgeText({tabId, text: count[0] ? count.length + '' : ''});
      browser.browserAction.setTitle({tabId, title: count[0] ? count.join('\n') : ''});
    });
  }
}