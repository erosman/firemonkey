import {App} from './app.js';
import {monaco} from '/lib/monaco-editor/monaco.js';
import {editorKeywords, ESLintOptions, UserScript} from './editor-config.js';
import {Theme} from './editor-theme.js';
import {eslint} from '/lib/eslint/linter.min.js';
import {UserStyleConverter} from './userstyle-converter.js';
import {Meta} from './meta.js';
import './editor-env.js';

// ---------- monaco editor --------------------------------
export class Editor {

  static {
    this.createEditor();
    Theme.set(monaco);
    this.addGlobals();
    this.addAction();
  }

  // update with user options from options.js
  // monaco-editor ignores incorrect rules
  static updateOptions(userOptions) {
    userOptions = App.JSONparse(userOptions);
    if (userOptions) {
      // remove disallowed options
      ['value', 'language'].forEach(i => delete userOptions[i]);
      this.editor.updateOptions(userOptions);
      // this.model.updateOptions({tabSize: 2});
    }
  }

  static createEditor() {
    this.box = document.querySelector('.editor');
    const options = {
      value: '',
      language: 'css',
      // language: 'javascript',
      // theme: 'vs', // default
      // adjust editor layout when container resizes
      automaticLayout: true,
      fixedOverflowWidgets: true,
      links: false,
      scrollBeyondLastLine: false,
      tabSize: 2,
      minimap: {enabled: false},
    };
    this.editor = monaco.editor.create(this.box, options);
    this.model = this.editor.getModel();

    this.model.onDidChangeContent(e => {
      e = e.changes[0];
      // clear the previous timeout
      clearTimeout(this.timeout);
      // new script
      if (!Object.hasOwn(e, 'forceMoveMarkers')) { return; }
      // add: space
      if (!e.rangeLength && e.text && !e.text.trim()) { return; }
      // delete: if (e.rangeLength && !e.text) {}
      // type, paste: if (!e.rangeLength && e.text) {}
      const language = this.model._tokenizationTextModelPart._languageId;
      // set a new timeout
      this.timeout = setTimeout(() => {
        this.setMarkers(language);
        language === 'javascript' && Linter.lint();
        this.setConvert();
      }, 2_000);
    });
  }

  static addGlobals() {
    const keywords = editorKeywords;
    monaco.languages.registerCompletionItemProvider('javascript', {
      provideCompletionItems: (model, position) => {
        const suggestions = keywords.map(keyword => ({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
        }));

        return {suggestions};
      }
    });
  }

  // ---------- actions & commands -------------------------
  static addAction() {
    // --- tidy metadata block
    this.editor.addAction({
      id: 'tidy-meta',
      label: browser.i18n.getMessage('tidyMeta'),
      contextMenuOrder: 1,
      contextMenuGroupId: '2_fm',
      run: ed => {
        let str = ed.getValue();
        const meta = str.match(Meta.regEx)?.[2] || '';
        const keys = meta.match(/@\S+/g) || [];
        if (!keys[0]) { return; }

        const max = Math.max(...keys.map(i => i.length), 10) + 4;
        str = str.replace(Meta.regEx, m =>
          m.replace(/([\r\n]+)\s+(\/\/|@)/g, '$1$2')        // trim leading spaces
            .replace(/\/\/(|\s{2,})@/g, '// @')             // set space between '// @'
            .replace(/(@\S+)[^\S\r\n]+/g, (m, p) => p.padEnd(max)) // align values
        );
        // set one empty line after metadata block
        str = str.replace(/(==\/(UserScript|UserCSS|UserStyle)==(\s+\*\/)?)\s+/i, '$1\n\n');
        this.set(str);
      },
    });

    // --- convert to match
    this.editor.addAction({
      id: 'convert-to-match',
      label: browser.i18n.getMessage('convertToMatch'),
      contextMenuOrder: 2,
      contextMenuGroupId: '2_fm',
      run: ed => {
        let str = ed.getValue();
        const regex = new RegExp(UserScript.validMatch, 'i');
        str = str.replace(Meta.regEx, m => {
          m = m.replace(/(@include[^\S\r\n]+)(\S+)/g, (a, p1, p2) => {
            p2 = this.convertPattern(p2);
            const len = p1.length;
            return regex.test(p2) ? '@match'.padEnd(len) + p2 : a;
          });

          m = m.replace(/(@exclude[^\S\r\n]+)(\S+)/g, (a, p1, p2) => {
            p2 = this.convertPattern(p2);
            const len = Math.max(p1.length, 15);
            return regex.test(p2) ? '@exclude-match'.padEnd(len) + p2 : a;
          });

          return m;
        });

        this.set(str);
      }
    });

    // --- convert to userCSS
    this.convertToUserCSS = this.editor.createContextKey('convertToUserCSS', false);
    this.editor.addAction({
      id: 'convert-to-userCSS',
      label: browser.i18n.getMessage('convertToUserCSS'),
      contextMenuOrder: 3,
      contextMenuGroupId: '2_fm',
      precondition: 'convertToUserCSS',
      run: ed => {
        const str = UserStyleConverter.get(ed.getValue(), this.box.dataset.updateURL);
        this.set(str);
      },
    });

    // --- convert deprecated
    this.editor.addAction({
      id: 'convert-deprecated',
      label: browser.i18n.getMessage('convertDeprecated'),
      contextMenuOrder: 4,
      contextMenuGroupId: '2_fm',
      run: ed => {
        let str = ed.getValue();
        Object.entries(UserScript.deprecated).forEach(([k, v]) => str = str.replaceAll(k, v));
        this.set(str);
      },
    });

    // --- save as template
    this.editor.addAction({
      id: 'save-as-template',
      label: browser.i18n.getMessage('saveTemplate'),
      contextMenuOrder: 5,
      contextMenuGroupId: '2_fm',
      run: ed => {
        const str = ed.getValue();
        const type = this.isJS(str) ? 'js' : 'css';
        browser.storage.local.get('template').then(obj => {
          obj.template[type] = str;
          browser.storage.local.set(obj);
        });
      },
    });

    // --- save
    const saveButton = document.querySelector('.scripts button[data-i18n="save"]');
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveButton.click();
    });

    // --- Toggle word wrap (match VS Code)
    this.editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => {
        const wordWrap = this.editor.getOption(monaco.editor.EditorOption.wordWrap);
        this.editor.updateOptions({
          wordWrap: wordWrap === 'on' ? 'off' : 'on',
        });
    });

    // --- fullscreen & escape
    const nav = document.querySelector('nav');
    const aside = document.querySelector('aside');
    // const content = document.querySelector('section.scripts .content');
    this.editor.addCommand(monaco.KeyCode.F11, () => {
      const off = aside.matches('.off');
      nav.classList.toggle('off');
      aside.classList.toggle('off');
      off && this.editor.layout({});
    });

    this.editor.addCommand(monaco.KeyCode.Escape, () => {
      const off = aside.matches('.off');
      nav.classList.remove('off');
      aside.classList.remove('off');
      off && this.editor.layout({});
    });
  }

  static convertPattern(i) {
    i.startsWith('//') && (i = '*:' + i);
    // convert whole pattern
    const pat = {
      '*': '*://*/*',
      '*://*': '*://*/*',
      'http*://*': '*://*/*',
      'http*': '*://*/*',
      'http://*': 'http://*/*',
      'https://*': 'https://*/*',
      'file://*': 'file:///*',
    };

    return pat[i] || i;
  }
  // ---------- /actions & commands ------------------------

  // ---------- get/set ----------------------------------
  static get() {
    return this.editor.getValue();
  }

  static set(str = '') {
    const language = this.isJS(str) ? 'javascript' : 'css';
    monaco.editor.setModelLanguage(this.model, language);
    // monaco.editor.setTheme(this.dark.matches ? 'vs-dark-fm' : 'vs');
    this.editor.setValue(this.prepareMeta(str));
    this.editor.revealLine(1);

    // show/hide warp in IIFE context menu
    // this.wrapIIFE.set(language === 'javascript');

    // show/hide Convert to UserCSS context menu
    this.setConvert(str);

    // set custom markers
    this.setMarkers(language);

    // show linter result
    language === 'javascript' && Linter.lint();
  }

  static isJS(str) {
    return /==UserScript==/i.test(str);
  }

  // fixing metadata block since there would be an error with /* ...@match    *://*/* ... */
  static prepareMeta(str) {
    return str.replace(/\/\*\s*==User(script|CSS)==.+==\/User\1==\s*(?=\*\/)/is,
      m => m.replaceAll('*/', '*\u200b/'));
  }

  static setMarkers(lang) {
    // reset the markers
    monaco.editor.setModelMarkers(this.model, 'FireMonkey', []);

    // create new markers
    const markers = [];
    UserScript.getMarkers(lang).forEach(i => markers.push(...this.findMatches(i)));
    monaco.editor.setModelMarkers(this.model, 'FireMonkey', markers);
  }

  static findMatches([severity, message, ...p]) {
    return this.model.findMatches(...p).map(i => ({
      ...i.range,
      message,
      severity: monaco.MarkerSeverity[severity],
      source: 'FireMonkey',
    }));
  }

  static setConvert(str = this.get()) {
    this.convertToUserCSS.set(UserStyleConverter.canConvert(str));
  }
}
// ---------- /monaco editor -------------------------------

// ---------- linter ---------------------------------------
export class Linter {

  static {
    this.activeRules = document.querySelector('.options textarea.active-rules');
    // console.log(eslint.Linter.version);
  }

  // update with user options from options.js
  static updateOptions(userOptions) {
    this.linterOptions = ESLintOptions.get();
    this.linterOptions.rules = {
      ...this.linterOptions.rules,
      ...App.JSONparse(userOptions),
    };

    // --- populate active rules textarea
    const rules = Object.fromEntries(Object.entries(this.linterOptions.rules).sort());
    this.activeRules.value = JSON.stringify(rules, null, 2).replace(/\[.+?\],/gs, m => m.replace(/\s+/g, ' '));
  }

  // from options.js
  // Linter() throws incorrect severity but ignores incorrect option
  // Config "User Rules": Key "rules": Key "no-var": Expected severity of "off", 0, "warn", 1, "error", or 2.
  static validateUserOptions(rules) {
    // severity is validated by ESLint directly
    rules = App.JSONparse(rules);
    if (!rules) { return true; }

    const linter = new eslint.Linter();
    try {
      linter.verify('', {name: 'User Rules', rules});
    }
    catch (e) {
      return e;
    }
  }

  static parseGrant(str) {
    const meta = str.match(/==UserScript==.+?==\/UserScript==/is)?.[0] || '';
    let grant = meta.match(/(?<=@grant\s+)([\w.]+)\b/g) || [];

    // check 'none'
    if (grant.includes('none')) { return [[], []]; }

    // remove duplicates
    grant = [...new Set(grant)];

    // remove unsupported
    grant = grant.filter(i => !UserScript.unsupported.includes(i));

    // sort grant
    const {gm3 = [], gm4 = []} = Object.groupBy(grant, i => i.startsWith('GM.') ? 'gm4' : 'gm3');

    return [gm3, gm4.map(i => i.substring(3))];
  }

  static checkGrant(str = '') {
    // deep clone a new options
    const options = structuredClone(this.linterOptions);

    // check inject-into page (user metadata not supported)
    const page = /==UserScript==.+?@inject-into\s+page\s.+?==\/UserScript==/is.test(str);
    if (page) {
      // grant unsafeWindow, GM_info, GM.info
      options.languageOptions.globals.unsafeWindow = false;
      return options;
    }

    const [gm3, gm4] = this.parseGrant(str);

    // globals based on @grant, only works for GM_ for now
    Object.assign(options.languageOptions.globals, Object.fromEntries(gm3.map(i => [i, false])));

    // no-restricted-properties
    options.rules['no-restricted-properties'][1].allowProperties.push(...gm4);

    return options;
  }

  static lint() {
    // create a new linter
    const linter = new eslint.Linter();
    const str = Editor.get();
    const options = this.checkGrant(str);
    const messages = linter.verify(str, options);

    const markers = messages.map(i => ({
      startLineNumber: i.line,
      startColumn: i.column,
      endLineNumber: i.endLine,
      endColumn: i.endColumn,
      message: `${i.message} (${i.ruleId})`,
      severity: monaco.MarkerSeverity[this.eslintSeverity[i.severity]],
      source: 'ESLint',
    }));

    // reset the markers
    monaco.editor.setModelMarkers(Editor.model, 'eslint', []);
    monaco.editor.setModelMarkers(Editor.model, 'eslint', markers);
    // monaco-editor already marks errors, no need for extra glyph decorations (or quicks fix)
  }

  static eslintSeverity = {
    // 0 off, 1 warn, 2 error
    0: 'Info',
    1: 'Warning',
    2: 'Error',
  };
}