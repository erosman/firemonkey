import {Meta} from './meta.js';

 export class UserCSS {

  static async init() {
    // check cssOrigin support Firefox 144
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1679997
    try {
      const id = await browser.contentScripts.register({
        matches: ['*://example.com/*'],
        css: [{code: ''}],
        cssOrigin: 'user',
      });
      this.origin = true;
      id.unregister();
    }
    catch {}
  }

  // --- prepare script options
  static async getOptions(script, pref) {
    // ---------- include/exclude --------------------------
    const {excludeMatches, includeGlobs, excludeGlobs, require, container, origin} = script;
    const options = {
      matches: script.matches,
      ...(excludeMatches[0] && {excludeMatches}),
      ...(includeGlobs[0] && {includeGlobs}),
      ...(excludeGlobs[0] && {excludeGlobs}),
      ...(container[0] && {cookieStoreId: container.map(i => `firefox-${i}`)}),
      matchAboutBlank: script.matchAboutBlank,
      allFrames: script.allFrames,
      runAt: script.runAt,

      css: [],
      // Firefox 144, default 'author'
      ...(this.origin && origin && {cssOrigin: origin}),
      // MAIN|ISOLATED (default) Firefox 128
      // world: 'ISOLATED',
    };

    // ---------- other ------------------------------------
    const {name, userVar} = script;

    // ---------- add @require
    // sort @require into local|remoteCSS
    const {local = [], remoteCSS = []} = Object.groupBy(require, i =>
      !/^https?:\/\//i.test(i) ? 'local' : 'remoteCSS');

    // --- add local @require
    local.forEach(i =>
      pref[`_${i}`]?.css && options.css.push({code: Meta.prepare(pref[`_${i}`].css)}));

    // --- add remote CSS @require
    if (remoteCSS[0]) {
      const code = `/* --- ${name}.user.css --- */\n\n` +
        remoteCSS.map(i => `@import '${i}';`).join('\n');
      options.css.push({code});
    }

    // --- add @var
    const uv = Meta.getVar(userVar);
    if (uv) {
      const code = `/* --- ${name}.user.css --- User Variables --- */\n\n:root {\n${uv}\n}`;
      options.css.push({code});
    }

    // --- add code
    options.css.push({code: Meta.prepare(script.css)});

    return options;
  }
}