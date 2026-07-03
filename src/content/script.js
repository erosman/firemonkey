import {App} from './app.js';
import {UserScript} from './userscript.js';
import {UserCSS} from './usercss.js';
import {UserStyle} from './userstyle.js';
import {Meta} from './meta.js';
import {Match} from './match.js';

// ---------- register content script|css ------------------
export class Script {

  // registered cache, not needed in MV3 userScripts.register()
  static registered = {};

  static async init(pref) {
    await UserScript.init();
    await UserCSS.init();

    // register all
    this.update(pref);
  }

  static update(pref, ids = App.getIds(pref)) {
    ids.forEach(id => this.register(id, pref));
  }

  // need complete pref for pref.globalExclude & @require & deleted scripts
  static async register(id, pref) {
    // unregister previously registered script
    await this.unregister(id);

    // deleted script
    if (!pref[id]) { return; }

    // shallow clone
    const script = {...pref[id]};

    // end if not enabled OR no include
    if (!script.enabled ||
      (!script.matches[0] && !script.includes[0] && !script.includeGlobs[0])) { return; }

    const options = await this.getOptions(script, pref);

    // scripts with regex includes, includeGlobs to be handled by api-gm.js
    if (script.includes[0]) {
      options.matches.push('*://*/*');
      delete options.includeGlobs;
    }

    // matches is mandatory in MV2 contentScripts/userScripts
    // https://searchfox.org/mozilla-central/source/toolkit/components/extensions/WebExtensionPolicy.cpp
    // empty array of excludeMatches (reject), includeGlobs/excludeGlobs
    // (silently) cause register error in MV2 contentScripts/userScripts
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1911834
    // Implement matches OR includeGlobs semantics for MV3 userScripts API (fixed FF134)
    // public scripts should not be suitable for file:///*
    options.matches[0] || (options.matches = ['*://*/*']);

    // register script
    this.registerScript(id, pref, script, options);

    // process open tabs
    this.updateTabs(id, pref);
  }

  static getOptions(script, pref) {
    const mod = script.js ? UserScript : /==UserCSS==/i.test(script.css) ? UserCSS : UserStyle;
    return mod.getOptions(script, pref);
  }

  static registerScript(id, pref, script, options) {
    // userScripts API: userScript
    // contentScripts API: userScript (inject-into page) | userCSS | userStyle
    const api = (script.css || options.world) ? browser.contentScripts : browser.userScripts;
    try {
      // catch error thrown before the Promise reject
      api.register(options)
      .then(reg => this.registered[id] = reg)
      .catch(e => App.log(id.substring(1), `Register ➜ ${e}`, 'error'));
    }
    catch (e) {
      // store error message & log message to display in Options -> Log
      pref[id].error = e;
      browser.storage.local.set({[id]: pref[id]});
      App.log(id.substring(1), `Register ➜ ${e}`, 'error');
    }
  }

  static async unregister(id) {
    if (this.registered[id]) {
      await this.registered[id].unregister();
      delete this.registered[id];
    }
  }

  // matching a single script against all tabs
  static async updateTabs(id, pref) {
    const {enabled, css, style, allFrames, origin} = pref[id];
    // only for enabled userCSS (not userStyle)
    if (!enabled || !css || style) { return; }

    const gExclude = pref.globalExclude?.split(/\s+/) || [];
    const tabs = await browser.tabs.query({});
    tabs.forEach(async tab => {
      if (tab.discarded) { return; }
      if (!Match.supported(tab.url)) { return; }

      let urls;
      if (allFrames) {
        const frames = await browser.webNavigation.getAllFrames({tabId: tab.id});
        urls = [...new Set(frames.map(Match.cleanUrl).filter(Match.supported))];
      }
      else {
        urls = [Match.cleanUrl(tab.url)];
      }

      const containerId = tab.cookieStoreId.substring(8);
      if (!Match.get(pref[id], tab.url, urls, gExclude, containerId)) { return; }

      browser.tabs.insertCSS(tab.id, {
        code: Meta.prepare(css),
        allFrames,
        ...(origin && {cssOrigin: origin}),
      });
    });
  }
}