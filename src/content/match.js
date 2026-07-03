import {App} from './app.js';

// ---------- match pattern check --------------------------
export class Match {

  // matching all scripts against a single tab
  static async process(tab, pref, bg) {
    const ids = App.getIds(pref);
    const supported = this.supported(tab.url);
    // Unsupported scheme
    if (bg && !supported) { return []; }

    const frames = await browser.webNavigation.getAllFrames({tabId: tab.id});
    // Unsupported scheme
    if (!supported) {
      return [[], ids.sort(Intl.Collator().compare), frames.length];
    }

    const urls = [...new Set(frames.map(this.cleanUrl).filter(this.supported))];
    const tabUrl = this.cleanUrl(tab.url);
    const gExclude = pref.globalExclude?.split(/\s+/) || [];
    const containerId = tab.cookieStoreId.substring(8);

    // --- background
    if (bg) {
      return ids.filter(id => pref[id].enabled && this.get(pref[id], tabUrl, urls, gExclude, containerId))
        .map(id => (pref[id].js ? '🔹 ' : '🔸 ') + id.substring(1));
    }

    // --- popup
    const Tab = [], Other = [];
    ids.sort(Intl.Collator().compare).forEach(item =>
      (this.get(pref[item], tabUrl, urls, gExclude, containerId) ? Tab : Other).push(item));
    return [Tab, Other, frames.length];
  }

  static supported(url) {
    return /^(https?:|file:|about:blank)/i.test(url);
  }

  static cleanUrl(url) {
    return (url.url || url).replace(/#.*/, '').replace(/(:\/\/[^:/]+):\d+/, '$1');
  }

  static get(item, tabUrl, urls, gExclude = [], containerId) {
    // only check main frame
    !item.allFrames && (urls = [tabUrl]);

    switch (true) {
      // script without matches/includes/includeGlobs
      case !item.matches[0] && !item.includes[0] && !item.includeGlobs[0]:
        return false;

      // about:blank
      case item.matchAboutBlank && urls.includes('about:blank'):
        return true;

      // check container
      case item.container?.[0] && !item.container.includes(containerId):
        return false;

      // Global Script Exclude Matches
      case gExclude[0] && this.isMatch(urls, gExclude):
        return false;

      // all excludes
      case item.excludeMatches[0] && this.isMatch(urls, item.excludeMatches):
      case item.excludeGlobs[0] && this.isMatch(urls, item.excludeGlobs, true):
      case item.excludes[0] && this.isMatch(urls, item.excludes, false, true):
        return false;

      // all includes
      case item.includeGlobs[0] && this.isMatch(urls, item.includeGlobs, true):
      case item.includes[0] && this.isMatch(urls, item.includes, false, true):
      case item.matches[0] && this.isMatch(urls, item.matches):
        return true;
    }
  }

  static isMatch(urls, arr, glob, regex) {
    switch (true) {
      // catch all checks
      case arr.includes('<all_urls>'):
      case arr.includes('*'):
      case arr.includes('*://*/*') && urls.some(i => i.startsWith('http')):
      case arr.includes('http://*') && urls.some(i => i.startsWith('http://')):
      case arr.includes('https://*') && urls.some(i => i.startsWith('https://')):
      case arr.includes('file:///*') && urls.some(i => i.startsWith('file:///')):
        return true;

      case regex:
        return urls.some(i => new RegExp(this.prepareRegEx(arr), 'i').test(i));

      case glob:
        return urls.some(i => new RegExp(this.prepareGlob(arr), 'i').test(i));

      default:
        return urls.some(i => new RegExp(this.prepareMatch(arr), 'i').test(i));
    }
  }

  static prepareMatch(arr) {
    // escape regular expression special characters, minus *
    return arr.map(i => '(^' +
      i.replace(/[.+?^$(){}|[\]\\]/g, '\\$&')
        .replace('*://', '^https?://')                      // convert * scheme
        .replace('://*\\.', '://(.+\\.)?')                  // match domains & subdomains
        .replaceAll('*', '.*') +
        '$)')
        .join('|');
  }

  static prepareGlob(arr) {
    // escape regular expression special characters, minus * ?
    return arr.map(i => '(' +
      i.replace(/[.+^$(){}|[\]\\]/g, '\\$&')
        .replaceAll('*', '.*')
        .replaceAll('?', '.') +
        ')')
        .join('|');
  }

  static prepareRegEx(arr) {
    return arr.map(i => `(${i.slice(1, -1)})`).join('|');
  }
}