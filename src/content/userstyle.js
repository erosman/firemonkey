import {Meta} from './meta.js';

export class UserStyle {

  // --- prepare script options
  static async getOptions(script) {
    // parse userStyle if not already done
    if (!script.style && script.css.includes('@-moz-document')) {
      Meta.parseStyle(script);
      // update script
      const id = `_${script.name}`;
      browser.storage.local.set({[id]: script});
    }

    // ---------- include/exclude --------------------------
    // support user metadata (no excludeGlobs in userStyles)
    const {excludeMatches, includeGlobs, excludeGlobs, container} = script;
    const options = {
      matches: script.matches,
      ...(excludeMatches[0] && {excludeMatches}),
      ...(includeGlobs[0] && {includeGlobs}),
      ...(excludeGlobs[0] && {excludeGlobs}),
      ...(container[0] && {cookieStoreId: container.map(i => `firefox-${i}`)}),
      matchAboutBlank: script.matchAboutBlank,
      allFrames: script.allFrames,
      runAt: script.runAt,

      js: [],
      // MAIN|ISOLATED (default) Firefox 128
      // world: 'ISOLATED',
    };

    // --- add @var
    // var is already added to script.style in meta.js

    // --- global userStyle
    if (!script.style) {
      options.css = [{code: Meta.prepare(script.css)}];
      delete options.js;
      return options;
    }

    // --- add code
    options.js.push({code: Meta.prepare(script.style)});

    return options;
  }
}