import {App} from './app.js';
import {Pattern} from './pattern.js';

// ---------- parse metadata block -------------------------
export class Meta {

  static regEx = /==(UserScript|UserCSS|UserStyle)==(.+?)==\/\1==/is;

  static get(str, pref) {
    // --- get all
    let [, type, metaData] = str.match(this.regEx) || [];
    if (!metaData) { return null; }

    metaData = this.clean(metaData);
    type = type.toLowerCase();
    const js = type === 'userscript';
    const userStyle = type === 'userstyle';

    // --- metadata block
    const data = {
      // --- string values
      name: '',
      version: '',
      updateURL: '',
      metaURL: '',
      uploadURL: '',
      injectInto: '',
      // MV2: cssOrigin (case-insensitive), MV3: origin (case-insensitive from Firefox 144)
      origin: '',
      // "document_start" (css default) | "document_end" | "document_idle" (js default)
      runAt: js ? 'document_idle' : 'document_start',

      // --- boolean values
      allFrames: false,
      matchAboutBlank: false,
      unwrap: false,

      // --- object values
      matches: [],
      excludeMatches: [],
      includeGlobs: [],
      excludeGlobs: [],
      excludes: [],
      includes: [],
      container: [],
      require: [],
      resource: {},
      grant: [],
      group: [],
      connect: [],
      // only for navigator.language v3.0
      i18n: {name: {}, description: {}},

      // --- user editable properties
      storage: {},
      userMeta: '',
      userVar: {},

      // --- non-metadata properties
      autoUpdate: false,
      enabled: true,
      // reset error on save
      error: '',

      // --- API related data
      js: js ? str : '',
      // remove invisible characters to avoid CSS parse error
      css: !js ? this.clean(str) : '',
      // converted userStyle to userScript, changed from array to string v3.0
      style: '',
    };

    const [lang, generic] = App.getLanguage();

    const arr = this.parseMeta(metaData);
    arr.forEach(([key, value]) => {
      switch (key) {
        // converting include/exclude to match, conflicts with user metadata disabling
        case 'include':
          if (value === 'about:blank') {
            data.matchAboutBlank = true;
            return;
          }
          // revert .tld
          value = value.replace(/\.tld\//i, '.*/');
          value.startsWith('/') && value.endsWith('/') ? data.includes.push(value) : data.includeGlobs.push(value);
          return;

        case 'exclude':
          // revert .tld
          value = value.replace(/\.tld\//i, '.*/');
          value.startsWith('/') && value.endsWith('/') ? data.excludes.push(value) : data.excludeGlobs.push(value);
          return;

        case 'match':
          data.matches.push(value);
          return;

        case 'exclude-match':
          data.excludeMatches.push(value);
          return;

        case 'includeGlob': // (deprecated v3.0)
          data.includeGlobs.push(value);
          return;

        case 'excludeGlob': // (deprecated v3.0)
          data.excludeGlobs.push(value);
          return;

        case 'container':
          /default|private|container-\d+/i.test(value) && data.container.push(value.toLowerCase());
          return;

        // convert downloadURL/installURL to updateURL/metaURL
        case 'downloadURL':
        case 'installURL':
        case 'updateURL':
          // test for valid URL & save as metaURL
          URL.parse(value) &&
            (/\.meta\.(js|css)$/i.test(value) ? data.metaURL = value : data.updateURL = value);
          return;

        case 'matchAboutBlank':
          data.matchAboutBlank = value === 'true';
          return;

        case 'allFrames':
          data.allFrames = value === 'true';
          return;

        case 'noframes':
          data.allFrames = false;
          return;

        case 'run-at':
        case 'runAt': // (deprecated v3.0)
          value = value.replace('-', '_');
          ['document_start', 'document_end'].includes(value) || (value = 'document_idle');
          data.runAt = value;
          return;

        case 'resource':
          const [resName, resURL] = value.split(/\s+/);
          if (resName && resURL) { data.resource[resName] = resURL; }
          return;

        // js only
        case 'inject-into':
          js && value === 'page' && (data.injectInto = value);
          return;

        // css only
        case 'origin':
          // case insensitive
          value = value.toLowerCase();
          !js && value === 'user' && (data[key] = value);
          return;

        case 'unwrap':
          js && (data.unwrap = true);
          return;

        case 'connect':
          // , no wildcard
          js && !value.includes('*') && data.connect.push(value);
          return;

        // temporary variable, not stored v3.0
        case 'preprocessor':
          // userStyle only (userstyle.js): default (standard CSS) | uso | less | stylus
          userStyle && ['uso', 'less', 'stylus'].includes(value) && (this.preprocessor = value);
          return;

        // --- var
        case 'var':
        case 'advanced': // (deprecated v3.0)
          const [, type, name, label, valueString] = value.match(/^(\S+)\s+(\S+)+\s+('[^']+'|"[^"]+"|\S+)\s+(.+)$/) || [];
          if (!type || !valueString.trim()) { return; }

          const [user, val] = this.getValue(type, valueString);
          if (typeof user === 'undefined') { return; }

          data.userVar[name] = {
            type,
            label: label.replace(/^('|")(.+)(\1)$/, '$2'),
            value: val,
            user,
          };
          return;

        // --- add @require
        case 'require':
          if (value.startsWith('lib/')) { return; }
          // change Protocol-relative URL '//example.com/' to https://
          value.startsWith('//') && (value = 'https:' + value);
          break;

        // --- i18n
        default:
          const m = key.match(/^(name|description):([A-Za-z-]+)$/);
          if (m) {
            [lang, generic].includes(m[2]) && (data.i18n[m[1]][m[2]] = value);
            return;
          }
      }

      // set key & value
      if (Object.hasOwn(data, key) && value !== '') {
        switch (typeof data[key]) {
          case 'string':
            data[key] = value;
            break;

          case 'boolean':
            data[key] = value === 'true';
            break;

          case 'object':
            Array.isArray(data[key]) && data[key].push(value);
            break;
        }
      }
    });

    // --- auto-update must have updateURL & version
    (!data.updateURL || !data.version) && (data.autoUpdate = false);

    // ------------- update from previous version ----------
    // if not requested from options.js
    const id = `_${data.name}`;
    if (pref[id]) {
      ['enabled', 'autoUpdate', 'userMeta', 'storage'].forEach(i => data[i] = pref[id][i]);
      !data.updateURL && (data.updateURL = pref[id].updateURL);

      // --- userVar, get user value
      Object.keys(data.userVar).forEach(i =>
        Object.hasOwn(pref[id].userVar[i] || {}, 'user') && (data.userVar[i].user = pref[id].userVar[i].user));
    }

    // this.enable etc are defined in options.js but not from background.js
    if (this.enable) {
      data.enabled = this.enable.checked;
      data.autoUpdate = !!data.updateURL && !!data.version && this.autoUpdate.checked;
      data.userMeta = this.userMeta.value;

      // --- userVar
      !this.userVar.dataset.default && document.querySelectorAll('.user-var :is(input, select)').forEach(item => {
        const id = item.dataset.id;
        if (!data.userVar[id] || !item.value.trim()) { return; } // skip

        // number | string
        let val = item.type === 'checkbox' ? item.checked * 1 : Number.isNaN(item.value * 1) ? item.value : item.value * 1;

        // color may have opacity
        item.dataset.opacity && (val += item.dataset.opacity);
        data.userVar[id].user = val;
      });
    }

    // --- convert updateURL to metaURL
    data.metaURL ||= this.getMetaURL(data.updateURL);

    // --- userStyle
    userStyle && this.parseStyle(data);

    // --- User Metadata (after all others to override)
    data.userMeta && this.getUserMeta(data, js);

    // --- remove duplicates
    Object.keys(data).forEach(i => Array.isArray(data[i]) && (data[i] = [...new Set(data[i])]));

    // --- check @grant, @inject-into page
    (!js || data.grant.includes('none') || data.injectInto === 'page') && (data.grant = []);

    // --- check @unwrap
    if (data.unwrap) {
      data.grant = [];
      data.injectInto = 'page';
    }

    return data;
  }

  // remove invisible characters to avoid CSS parse error
  static clean(str) {
    return str.replace(/[\u200b-\u200d\ufeff]+/g, '');
  }

  static filter(array, value) {
    return value ? array.filter(i => i !== value) : [];
  }

  // --- user metadata
  static getUserMeta(data, js) {
    // cache values as disable-match or disable-exclude-match can clear it
    const matches = [];
    const excludeMatches = [];

    const arr = this.parseMeta(data.userMeta);
    arr.forEach(([key, value]) => {
      switch (key) {
        case 'disable-match':
          data.matches = this.filter(data.matches, value);
          break;

        case 'disable-exclude-match':
          data.excludeMatches = this.filter(data.excludeMatches, value);
          break;

        case 'disable-include':
          data.includes = this.filter(data.includes, value);
          data.includeGlobs = this.filter(data.includeGlobs, value);
          break;

        case 'disable-exclude':
          data.excludes = this.filter(data.excludes, value);
          data.excludeGlobs = this.filter(data.excludeGlobs, value);
          break;

        case 'disable-container':
          data.container = this.filter(data.container, value.toLowerCase());
          break;

        case 'match':
          value && matches.push(value);
          break;

        case 'exclude-match':
          value && excludeMatches.push(value);
          break;

        case 'container':
          /default|private|container-\d+/i.test(value) && data.container.push(value.toLowerCase());
          break;

        case 'updateURL':
        case 'metaURL':
        case 'uploadURL':
          // test for valid URL
          value && URL.parse(value) && (data[key] = value);
          break;

        case 'matchAboutBlank':
          data.matchAboutBlank = value === 'true';
          break;

        case 'allFrames':
          data.allFrames = value === 'true';
          break;

        case 'run-at':
          value = value.replace('-', '_');
          ['document_start', 'document_end', 'document_idle'].includes(value) && (data.runAt = value);
          break;

        case 'inject-into':
          js && value && (data.injectInto = value);
          break;

        case 'origin':
          // case insensitive
          value = value.toLowerCase();
          !js && value === 'user' && (data[key] = value);
          break;

        case 'group':
          data.group.push(value);
          break;

        case 'connect':
          js && data.connect.push(value);
          break;
      }
    });

    data.matches.push(...matches);
    data.excludeMatches.push(...excludeMatches);
  }

  // --- @var | @advanced (deprecated v3.0)
  static getValue(type, str) {
    let jp, def;
    switch (type) {
      case 'number':
      case 'range':
        // check if single quote object
        jp = App.JSONparse(str) || App.JSONparse(str.replace(/'/g, '"'));
        if (!jp) { return []; }

        // sort unit to the end
        jp.sort((a, b) => typeof a === 'string' && typeof b !== 'string');
        return [jp[0], jp];

      case 'select':
      case 'dropdown': // (deprecated v3.0)
      case 'image':
        // prevent error with empty dropdown value e.g. yes "Yes (default)*" <<<EOT  EOT;
        jp = App.JSONparse(str.replace(/\sEOT;/, ''));
        if (!jp) { return []; }

        if (Array.isArray(jp)) {
          def = jp.find(i => i.endsWith('*')) || jp[0];
          return [def, jp];
        }

        const ky = Object.keys(jp);
        def = ky.find(i => i.endsWith('*'));
        return [def ? jp[def] : jp[ky[0]], jp];

      case 'checkbox':
        return [['1', 'true'].includes(str), str];

      default:
        return [str, str];
    }
  }

  // fixing metadata block since there would be an error with /* ...@match    *://*/* ... */
  static prepare(str) {
    return str.replace(/\/\*\s*==(UserScript|UserCSS|UserStyle)==.+==\/\1==\s*(?=\*\/)/is,
      m => m.replaceAll('*/', '* /'));
  }

  // --- parse metadata into array of [key, value]
  static parseMeta(str, user) {
    if (!user) {
      // convert @var select multiline to single line
      str = str.replace(/(@var\s+select\s+[^\n]+)(\{[^}]+\})/g, this.prepareSelect);

      // convert @advanced dropdown to select (deprecated v3.0)
      str = str.replace(/(@advanced\s+dropdown\s+[^\n]+)(\{[^}]+\})/g, this.prepareDropdown);

      // convert @advanced image to select (deprecated v3.0)
      str = str.replace(/(@advanced\s+image\s+[^\n]+)(\{[^}]+\})/g, this.prepareImage);
    }

    // disallowed properties
    const disallowed = ['autoUpdate', 'enabled', 'error', 'i18n',
      'css', 'js', 'style', 'storage', 'userMeta', 'userVar'];

    const regex = /@(\S+)[^\S\r\n]*(.*)/g;
    const m = str.matchAll(regex);
    // always returns an array
    return [...m].map(i => [i[1], i[2].trim()]).filter(i => !disallowed.includes(i[0]));
  }

  static prepareSelect(m, p1, p2) {
    // check if single quote object
    const jp = App.JSONparse(p2) || App.JSONparse(p2.replace(/'/g, '"'));
    // remove if not valid JSON
    return jp ? p1 + JSON.stringify(jp) : '';
  }

  // xStyle @advanced  dropdown
  static prepareDropdown(m, p1, p2) {
    const obj = {};
    // prevent error with empty dropdown value e.g. yes "Yes (default)*" <<<EOT EOT;
    const opt = p2.slice(1, -1).trim().split(/\sEOT;/);
    opt.forEach(item => {
      if (!item.trim()) { return; }
      // const [, id, label, valueString]
      const [, , label, valueString] = item.match(/(\S+)\s+"([^<]+)"\s+<<<EOT\s*(.+)/s) || [];
      label && (obj[label] = valueString.trim());
    });

    return Object.keys(obj)[0] ? p1 + JSON.stringify(obj) : '';
  }

  static prepareImage(m, p1, p2) {
    const obj = {};
    const opt = p2.slice(1, -1).trim().split(/[\r\n]+/);
    opt.forEach(item => {
      item = item.trim();
      if (!item) { return; }
      // const [, id, label, valueString]
      const [, , label, valueString] = item.match(/(\S+)\s+"(.+)"\s+"(.+)"/);
      label && (obj[label] = valueString);
    });
    return Object.keys(obj)[0] ? p1 + JSON.stringify(obj) : '';
  }

  // ---------- convert updateURL to metaURL ---------------
  static getMetaURL(url) {
    switch (true) {
      // old format
      case url.startsWith('https://greasyfork.org/scripts/'):
      case url.startsWith('https://sleazyfork.org/scripts/'):
      // new format
      case url.startsWith('https://update.greasyfork.org/scripts/'):
      case url.startsWith('https://update.sleazyfork.org/scripts/'):

      case url.startsWith('https://openuserjs.org/install/'):
        return url.replace(/\.user\.(js|css)/i, '.meta.$1');

      default:
        return '';
    }
  }

  // ---------- parse userstyle ----------------------------
  static parseStyle(script) {
    let {css} = script;

    // global: no @-moz-document, inject as normal CSS, but support user metadata
    if (!css.includes('@-moz-document')) {
      script.matches[0] || (script.matches = ['*://*/*']);
      return;
    }

    // process preprocessor before checking segments
    this.preprocessor &&
      (css = this.setPreprocessor(css, this.preprocessor, script.userVar));

    // add name & @var
    const styleName = `/* ${script.name} */`;
    let userVar = this.getVar(script.userVar);
    userVar &&= [':root {', userVar, '}'].join('\n');

    // segments
    const p = css.split('@-moz-document');

    // convert each segment
    const parts = p.slice(1).map(i => this.convert(i, script));

    // wrap in IIFE
    script.style =
`(() => {
${p[0].trim()}

const styleName = ${JSON.stringify(styleName)};
const userVar = ${JSON.stringify(userVar)};

${addStyle.toString()}

${parts.join('\n\n')}
})();`;
  }

  static convert(str, script) {
    // const {name} = script;
    let [rules, css] = this.getByIndex(str, '{', '}');

    // remove quotes and whitespace, split ','
    rules = rules.replace(/['"\s]/g, '').split(',').map(i => {
      const [func, value] = this.getByIndex(i, '(', ')');
      if (!func || !value) { return ''; }

      let pat;
      switch (func) {
        case 'url':
          // Matches an exact URL
          Pattern.validMatchPattern(value) ? script.matches.push(value) : script.includeGlobs.push(value);
          return `location.href === '${value}'`;

        case 'url-prefix':
          // Matches if the document URL starts with the value provided
          pat = value + '*';
          Pattern.validMatchPattern(pat) ? script.matches.push(pat) : script.includeGlobs.push(pat);
          return `location.href.startsWith('${value}')`;

        case 'domain':
          // Matches if the document URL is on the domain provided (or a subdomain of it)
          pat = `*://*.${value}/*`;
          Pattern.validMatchPattern(pat) ? script.matches.push(pat) : script.includeGlobs.push(pat);
          return `new RegExp('://(.+\\.)?${value}/').test(location.href)`;

        case 'regexp':
          // Matches if the document URL is matched by the regular expression provided. The expression must match the entire URL.
          script.includes.push(`/${value}/`);
          return `new RegExp('${value}').test(location.href)`;
      }
    });

    rules = rules.filter(Boolean).join(' || ');
    const ret =
`if (${rules}) {
  const css = ${JSON.stringify(css)};
  addStyle(css);
}`;

    return ret;
  }

  static getByIndex(str, a, b) {
    const start = str.indexOf(a);
    const end = str.lastIndexOf(b);
    const before = str.substring(0, start).trim();
    const middle = str.substring(start + 1, end).trim();
    return [before, middle];
  }

  // used in userscript.js | usercss.js
  static getVar(userVar, js) {
    // --- add @var
    const uv = Object.entries(userVar).map(([key, value]) => {
      let val = value.user;
      ['number', 'range'].includes(value.type) && value.value[4] && (val + value.value[4]);
      value.type === 'select' && Array.isArray(value.value) && (val = val.replace(/\*$/, ''));
      js && typeof val === 'string' && (val = JSON.stringify(val));
      return js ? `const ${key} = ${val};` : `  --${key}: ${val};`;
    }).join('\n');
    return uv;
  }

  // --- @preprocessor
  static setPreprocessor(str, pp, userVar) {
    const re = {
      less: (r) => new RegExp(`@${r}\\b`, 'g'), // @myBorder
      stylus: (r) => new RegExp(`\\b${r}\\b`, 'g'), // myBorder
      uso: (r) => `/*[[${r}]]*/`, // /*[[myBorder]]*/
    };

    const p = str.split(/==\/UserStyle==/i);
    Object.keys(userVar).forEach(i => p[1] = p[1].replaceAll(re[pp](i), `var(--${i})`));
    return p.join('==/UserStyle==');
  }
}

/* global styleName, userVar */
// utility function to include with userStyle, include userVar if defined
function addStyle(str) {
  const style = document.createElement('style');
  style.textContent = [styleName, userVar, str].join('\n\n');
  (document.head || document.body || document.documentElement).append(style);
}