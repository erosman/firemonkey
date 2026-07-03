import {Meta} from './meta.js';

export class UserScript {

  // used for sourceURL
  // not available in MV3 api.js (browser.runtime.getURL is not a function)
  static FMUrl = browser.runtime.getURL('');
  // FireMonkey version
  static FMV = browser.runtime.getManifest().version;

  static async init() {
    this.platformInfo = await browser.runtime.getPlatformInfo();
    this.browserInfo = await browser.runtime.getBrowserInfo();
  }

  // --- prepare script options
  static async getOptions(script, pref) {
    // ---------- include/exclude --------------------------
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
      // css used in injectInto page
      css: [],
    };

    // --- add Global Exclude, remove duplicates
    if (pref.globalExclude) {
      options.excludeMatches = [...new Set([
        ...script.excludeMatches,
        ...pref.globalExclude.split(/\s+/),
      ])];
    }

    // ---------- scriptMetadata ---------------------------
    const {name, includes, excludes, grant, require} = script;

    // const runAt = script.runAt.replace('_', '-');
    // const metadata = script.js.match(Meta.regEx)[2].replace(/[/\s]+$/, '');
    options.scriptMetadata = {
      resourceData: {},                                     // resource text data for getResourceText
      FMUrl: this.FMUrl,

      // GM info data
      info: {
        // application data
        scriptHandler: 'FireMonkey',
        version: this.FMV,
        platform: this.platformInfo,                        // FM|VM, VM: includes browserName, browserVersion
        browser: this.browserInfo,                          // FM only

        // script data
        // isIncognito: false,                              // will be set in MV2 api.js, not available in page
        injectInto: script.injectInto,                      // FM|VM
        // scriptMetaStr: metadata,                            // FM|GM|VM without start/end strings, TM with
        script: {
          name,
          version: script.version,                          // FM|TM|VM: string, GM: string|null
          // description: script.description,                  // undefined breaks registration
          includes,
          excludes,
          matches: script.matches,
          excludeMatches: script.excludeMatches,            // FM|VM
          includeGlobs: script.includeGlobs,                // FM only
          excludeGlobs: script.excludeGlobs,                // FM only
          grant,                                            // FM|TM|VM
          require,                                          // FM|VM
          resources: script.resource,                       // GM: { {...} }, TM: {...}, VM: [ {...} ]
          connects: script.connect || [],                   // FM 3.0|TM
          // 'run-at': runAt,                                  // FM|TM
          // runAt,                                            // VM: runAt, GM: runAt: "end"
          // namespace: '',                                    // FM|TM|VM: string, GM: string|null
          // metadata,                                         // FM only, TM under info.script.header
          // injectInto: script.injectInto,                    // FM only, VM under info.injectInto
          // isIncognito: false,                               // FM only
        }
      }
    };

    // ---------- other ------------------------------------
    const {userVar, unwrap} = script;

    // injectInto page for @grant none
    const page = script.injectInto === 'page' || !grant[0] || unwrap;
    const pageURL = page ? 'page/' : '';
    const encodeName = encodeURI(name);

    // re UUID when inject-into page
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1717671
    // Display inconsistency of sourceURL folder & file
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1824910
    const sourceURL = `\n\n//# sourceURL=${this.FMUrl}userscript/${pageURL}${encodeName}`;

    // regex in include/exclude is handled by api-gm.js
    const hasRegex = includes[0] || excludes[0];

    // page scripts to join
    const pageScripts = [];

    // ---------- add @require
    // sort @require into local|remoteCSS|remoteJS
    const {local = [], remoteJS = [], remoteCSS = []} = Object.groupBy(require, i =>
      !/^https?:\/\//i.test(i) ? 'local' : /\.css$/i.test(i) ? 'remoteCSS' : 'remoteJS');

    // --- add local @require
    local.forEach(i => {
      const id = `_${i}`;

      // require another userScript
      if (pref[id]?.js) {
        let code = Meta.prepare(pref[id].js);
        if (page) {
          pageScripts.push(code);
        }
        else {
          code += `${sourceURL}/@require/${encodeURI(i)}.user.js`;
          options.js.push({code});
        }
      }
      // require another userCSS
      else if (pref[id]?.css) {
        let code = Meta.prepare(pref[id].css);
        if (page) {
          options.css.push({code});
        }
        else {
          code = `GM.addStyle(${JSON.stringify(code)})`;
          options.js.push({code});
        }
      }
    });

    // --- add remote CSS @require
    if (remoteCSS[0]) {
      let code = `/* --- ${name}.user.css --- */\n\n` + remoteCSS.map(i => `@import '${i}';`).join('\n');
      if (page) {
        options.css.push({code});
      }
      else {
        code = `GM.addStyle(${JSON.stringify(code)})`;
        options.js.push({code});
      }
    }

    // --- add remote JS @require
    if (remoteJS[0]) {
      // keep the order of @require
      const arr = [];
      const pageArr = [];

      // Array.forEach: Uncaught (in promise) TypeError: can't convert undefined to object
      // Array.map to return a Promise
      await Promise.all(remoteJS.map((url, index) =>
        fetch(url)
        .then(r => r.text())
        .then(code => {
          // check for redirection to HTML
          if (/^\s*</.test(code)) { return; }

          if (page) {
            pageArr[index] = code;
          }
          else {
            code += `${sourceURL}/@require/${encodeURI(url)}`;
            arr[index] = {code};
          }
        })
        .catch(() => {})
        // catch() to suppress error
      ));

      options.js.push(...arr);
      pageScripts.push(...pageArr);
    }

    // --- add @resource for GM getResourceText
    const getResourceText = !page && ['GM_getResourceText', 'GM.getResourceText'].some(i => grant.includes(i)); // FM 2.68
    if (getResourceText) {
       // not for image
      const array = Object.entries(script.resource).filter(([, url]) => !/\.(jpe?g|png|gif|webp|svg|ico)\b/i.test(url));
      // Array.map to return a Promise
      await Promise.all(array.map(([key, url]) =>
        fetch(url)
        .then(r => r.text())
        .then(text => options.resourceData[key] = text)
        .catch(() => {})
        // catch() to suppress error
      ));
    }

    // --- add @var
    const uv = Meta.getVar(userVar, 'js');
    if (uv) {
      let code = '/* --- User Variables --- */\n\n' + uv;
      if (page) {
        pageScripts.push(code);
      }
      else {
        code += `${sourceURL}/${encodeName}.var.user.js`;
        options.js.push({code});
      }
    }

    // ---------- prepare data -----------------------------
    // --- add @require location check for regex include/exclude
    if (hasRegex) {
      // convert CSS to JS
      options.js.push(...options.css.map(i => ({code: `GM.addStyle(${JSON.stringify(i.code)});`})));
      // add URL check
      options.js.forEach(i => i.code &&= `GM.initScript().then(async () => { ${i.code}\n}).catch(() => {});`);
    }

    // --- add api
    if (!page || hasRegex) {
      options.js = [
        // GM API (must be inserted first)
        {file: '/content/api-gm.js'},
        // initUserScript is defined in api-gm.js in preparation for MV3
        {code: `initUserScript(${JSON.stringify(options.scriptMetadata)})`},
        // scripts from @require
        ...options.js,
      ];
    }

    // --- add sourceURL
    let code = Meta.prepare(script.js) + `${sourceURL}/${encodeName}.user.js`;

    // --- userscript wrapper
    if (page) {
      // grant only unsafeWindow, GM_info, GM.info
      const GM = {info: options.scriptMetadata.info};
      // join all scripts
      const all = [...pageScripts, code].join('\n\n');
      code = unwrap ? `(async () => { ${all}\n})();` :
        `((unsafeWindow, GM, GM_info = GM.info) => {(async () => { ${all}\n})();})(window, ${JSON.stringify(GM)});`;

      // inject with userScripts API
      if (hasRegex) {
        // catch() to suppress error
        code = `GM.initScript(true).then(() => { GM.addScript(${JSON.stringify(code)})\n}).catch(() => {});`;
        delete options.css;
      }
      else {
        // inject with contentScripts API
        options.world = 'MAIN';
        // Type error for parameter contentScriptOptions (Unexpected property "scriptMetadata") for contentScripts.register.
        delete options.scriptMetadata;
      }
    }
    else {
      // catch() to suppress error
      code = `GM.initScript(true).then(async () => { ${code}\n}).catch(() => {});`;
      delete options.css;
    }

    // --- add code
    options.js.push({code});

    return options;
  }
}