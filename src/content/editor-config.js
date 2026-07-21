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
      // sourceType: "module", // default
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
// Error = 8, Warning = 4, Info = 2, Hint = 1,
// [severity, message, searchString, searchOnlyEditableRange, isRegex, matchCase, wordSeparators, captureMatches, limitResultCount]
export class UserScript {

  // static unprocessed = [
  //   '@icon',
  //   '@namespace',
  //   '@nocompat',
  // ];

  static unsupported = [
    'getTab',
    'getTabs',
    'saveTab',

    // removed in v3.0
    'createObjectURL',
    'import',
  ].flatMap(i => [`GM.${i}`, `GM_${i}`]);

  static deprecated = {
    '@matches': '@match',
    '@excludeMatches': '@exclude-match',
    '@includeGlobs': '@include',
    '@excludeGlobs': '@exclude',
    '@runAt': '@runAt',
    'GM_fetch': 'GM.fetch',
  };

  static depList = Object.entries(this.deprecated).map(i => ['Warning', `${i[0]} is deprecated, use ${i[1]} instead`, i[0]]);

  static custom = [
    ['Info', 'GM.info is available without @grant', '@grant\\s+GM\\.info', true, true, true, '\\S'],
    ['Info', 'GM_info is available without @grant', '@grant\\s+GM_info', true, true, true, '\\S'],
    ['Error', 'window.close is not supported', '@grant\\s+window\\.close', true, true, true, '\\S'],
    ['Error', 'window.focus is not supported', '@grant\\s+window\\.focus', true, true, true, '\\S'],
    ['Error', 'window.onurlchange is not supported', '@grant\\s+window\\.onurlchange', true, true, true, '\\S'],
    ['Warning', 'GM.getResourceUrl is implemented differently (see Help for more information).', 'GM.getResourceUrl'],
    ['Warning', 'GM_getResourceURL is implemented differently (see Help for more information).', 'GM_getResourceURL'],
    ['Warning', `This type of resource is not supported for GM_getResourceText.`, '@resource\\s+.+\\.(jpe?g|png|gif|webp|svg)', true, true],
    ['Warning', 'Regular Expression has the worst performance.', '@(include|exclude)\\s+/.+/', true, true, true, '\\S'],
    ['error', 'Includes unexpected content e.g. ads, miners, etc.', '@antifeature\\s+.+', true, true, true, '\\S'],
  ];

  static validMatch = '(((https?|\\*)://(\\*|\\*\\.[^*:/]+|[^*:/]+)/.*)|file:///.+)$';
  static possibleMatch = '(\\*|(http[*s]*|file)://\\*|([*:]*//)?[^*:/^]+(/[^^$]*))?$';

  static useMatch = [
    ['Info', `This pattern would be better as @match.`, `@include\\s+${this.validMatch}`, true, true],
    ['Info', `This pattern would be better as @exclude-match.`, `@exclude\\s+${this.validMatch}`, true, true],
    ['Info', `It is recommended to convert to @match.`, `@include\\s+${this.possibleMatch}`, true, true],
    ['Info', `It is recommended to convert to @exclude-match.`, `@exclude\\s+${this.possibleMatch}`, true, true],
  ];

  static jsMarkers = [
    // ...this.unprocessed.map(i => ['Info', `${i} is not processed.`, i]),
    ...this.unsupported.map(i => ['Error', `${i} is not supported.`, i, true, false, true, '\\S']),
    ...this.custom,
    ...this.useMatch,
    ...this.depList,
  ];

  static cssMarkers = [
    ...this.useMatch,
    ...this.depList,
  ];

  static getMarkers(language) {
    return language === 'javascript' ? this.jsMarkers : this.cssMarkers;
  }
}

/*
Expected severity: ["off", 0, "warn", 1, "error", 2]
Options: ["always", "never", "ignore"] & ["smart", "allow-null"]
["error", "always", {"null": "ignore"}]
*/