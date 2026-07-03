import {FS} from './fs.js';

// ---------- migrate --------------------------------------
export class Migrate {

  static async init(pref) {
    // --- 3.0
    if (Object.hasOwn(pref, 'cmOptions')) {
      // backup old database
      FS.export(pref);

      // remove unused data
      localStorage.removeItem('dark');
      localStorage.removeItem('theme');

      // add editor/linter Options & remove CodeMirror options
      pref.editorOptions = '';
      pref.linterOptions = '';
      delete pref.cmOptions;

      // rename globalScriptExcludeMatches to globalExclude
      pref.globalExclude = pref.globalScriptExcludeMatches;
      delete pref.globalScriptExcludeMatches;

      // add new properties
      pref.cspExclude = '';

      Object.keys(pref).forEach(id => {
        if (!id.startsWith('_')) { return; }

        // remove requireRemote
        if (pref[id].requireRemote) {
          pref[id].require.push(...pref[id].requireRemote);
          delete pref[id].requireRemote;
        }

        // prepare script.style
        typeof pref[id].style !== 'string' && (pref[id].style = '');

        // @container support v2.41 (2022-01-22)
        pref[id].container ||= [];

        // @var support v2.56 (2022-05-09)
        pref[id].userVar ||= {};
      });

      // update database
      await browser.storage.local.remove(['cmOptions', 'globalScriptExcludeMatches']);
      await browser.storage.local.set(pref);
    }
  }
}