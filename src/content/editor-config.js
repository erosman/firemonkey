// import with {type: 'json'} Firefox 138
import {globals} from './editor-globals.js';
import {rules} from './editor-rules.js';

// ---------- editor keywords for autocomplete -------------
const extra = [
  'GM_addScript',
  'GM_fetch',
  'GM_popup',
  'GM_cookie.delete',
  'GM_cookie.list',
  'GM_cookie.set',
];

const GM = [...Object.keys(globals.greasemonkey), ...extra];
export const editorKeywords = [
  ...Object.keys(globals.browser),
  ...Object.keys(globals.es2027),
  ...Object.keys(globals.jquery),
  ...GM,
  // change GM_ to GM.
  ...GM.filter(i => i.startsWith('GM_') && !['GM_getResourceURL', 'GM_xmlhttpRequest'].includes(i))
        .map(i => 'GM.' + i.substring(3)),
  // case-changed APIs
  'GM.getResourceUrl',
  'GM.xmlHttpRequest',
];
// ---------- /editor keywords for autocomplete ------------

// ---------- ESLint ---------------------------------------
export class ESLintOptions {

  // default grant globals
  // true: writeable, false: readonly, off: ?
  static v10 = {
    languageOptions: {
      // ecmaVersion: 'latest', // default, ecmaVersion: 15, ECMAScript 2024
      // allow top-level await
      // sourceType: 'module', // default
      // https://github.com/eslint/eslint/issues/20535
      // Change Request: globalReturn with module
      globals: {
        ...globals.browser,
        ...globals.es2027,
        ...globals.jquery,
        // ...globals.greasemonkey,

        // default globals
        GM: false,
        GM_info: false,
        cloneInto: false,
        createObjectIn: false,
        exportFunction: false,
      },
      parserOptions: {
        ecmaFeatures: {
          // allow return statements in the global scope
          globalReturn: true,
        },
      },
    },

    rules: {
      ...rules.recommended,
      ...rules.fireMonkey,
    },
  };

  static get() {
    // prevent changes to the default object
    return structuredClone(this.v10);
  }
}

// ---------- FireMonkey Markers ---------------------------
// https://microsoft.github.io/monaco-editor/docs.html#interfaces/editor_editor_api.editor.ITextModel.html#findMatches
// Error = 8, Warning = 4, Info = 2, Hint = 1,
// [severity, message, searchString, searchOnlyEditableRange, isRegex, matchCase, wordSeparators, captureMatches, limitResultCount]
export class UserScript {

  // used in parseGrant
  static unsupported = [
    'GM.getTab',
    'GM_getTab',
    'GM.getTabs',
    'GM_getTabs',
    'GM.saveTab',
    'GM_saveTab',

    // removed in v3.0
    'GM.createObjectURL',
    'GM_createObjectURL',
    'GM.import',
    'GM_import',
  ];

  // used in convert deprecated
  static deprecated = {
    '@matches': '@match',
    '@excludeMatches': '@exclude-match',
    '@includeGlobs': '@include',
    '@excludeGlobs': '@exclude',
    '@runAt': '@runAt',
    'GM_fetch': 'GM.fetch',
  };

  static custom = [
    // unprocessed
    // ['Info', '@icon is not processed.', '@icon', true, false, true],
    // ['Info', '@namespace is not processed.', '@namespace', true, false, true],
    // ['Info', '@nocompat is not processed.', '@nocompat', true, false, true],

    // unsupported
    ['Error', 'GM.getTab is not supported.', 'GM\\.getTab\\b', true, true, true],
    ['Error', 'GM_getTab is not supported.', 'GM_getTab\\b', true, true, true],
    ['Error', 'GM.getTabs is not supported.', 'GM.getTabs', true, false, true],
    ['Error', 'GM_getTabs is not supported.', 'GM_getTabs', true, false, true],
    ['Error', 'GM.saveTab is not supported.', 'GM.saveTab', true, false, true],
    ['Error', 'GM_saveTab is not supported.', 'GM_saveTab', true, false, true],

     // removed in v3.0
    ['Error', 'GM.createObjectURL is not supported.', 'GM.createObjectURL', true, false, true],
    ['Error', 'GM_createObjectURL is not supported.', 'GM_createObjectURL', true, false, true],
    ['Error', 'GM.import is not supported.', 'GM.import', true, false, true],
    ['Error', 'GM_import is not supported.', 'GM_import', true, false, true],

    // other
    ['Info', 'GM.info is available without @grant', '@grant\\s+GM\\.info', true, true, true],
    ['Info', 'GM_info is available without @grant', '@grant\\s+GM_info', true, true, true],

    ['Warning', 'GM.getResourceUrl is implemented differently (see Help for more information).', 'GM.getResourceUrl', true, false, true],
    ['Warning', 'GM_getResourceURL is implemented differently (see Help for more information).', 'GM_getResourceURL', true, false, true],
    ['Warning', `This type of resource is not supported for GM_getResourceText.`, '@resource\\s+.+\\.(jpe?g|png|gif|webp|svg)', true, true, true],
    ['Warning', 'Regular Expression has the worst performance.', '@(include|exclude)\\s+/[^/].+/$', true, true, true],

    ['Error', 'window.close is not supported', '@grant\\s+window\\.close', true, true, true],
    ['Error', 'window.focus is not supported', '@grant\\s+window\\.focus', true, true, true],
    ['Error', 'window.onurlchange is not supported', '@grant\\s+window\\.onurlchange', true, true, true],
    ['Error', 'Includes unexpected content e.g. ads, miners, etc.', '@antifeature\\s+.+', true, true, true],
  ];

  static validMatch = '(((https?|\\*)://(\\*|\\*\\.[^*:/]+|[^*:/]+)/.*)|file:///.+)$';
  static possibleMatch = '(\\*|(http[*s]*|file)://\\*|([*:]*//)?[^*:/^]+(/[^^$]*))?$';

  static common = [
    // deprecated
    ...Object.entries(this.deprecated).map(i => ['Warning', `${i[0]} is deprecated, use ${i[1]} instead`, i[0], true, false, true]),

    // use match
    ['Info', `This pattern would be better as @match.`, `@include\\s+${this.validMatch}`, true, true, true],
    ['Info', `This pattern would be better as @exclude-match.`, `@exclude\\s+${this.validMatch}`, true, true, true],
    ['Info', `It is recommended to convert to @match.`, `@include\\s+${this.possibleMatch}`, true, true, true],
    ['Info', `It is recommended to convert to @exclude-match.`, `@exclude\\s+${this.possibleMatch}`, true, true, true],
  ];

  static jsMarkers = [
    ...this.custom,
    ...this.common,
  ];

  static cssMarkers = [
    ...this.common,
  ];

  static getMarkers(language) {
    return language === 'javascript' ? this.jsMarkers : this.cssMarkers;
  }
}