// ---------- UserStyle to UserCSS converter ---------------
// convert if standard CSS and global/single section
/* global css_beautify */

export class UserStyle {

  static process(text, convertedFrom) {
    this.convertedFrom = convertedFrom;

    // check meta
    const meta = text.match(/==(UserStyle)==(.+?)==\/\1==/is)?.[2];
    switch (true) {
      case !meta:                                           // check UserStyle
      // no @var checkbox in CSS
      case /@(var|advanced)\s+checkbox/.test(meta):
      // no @var|@advanced if @preprocessor less|stylus, @type is used by some userStyles
      case /@(var|advanced)\s+\S+/.test(meta) && /@(preprocessor|type)\s+(less|stylus)\s/i.test(meta):
        return;
    }

    const p = text.split(/@-moz-document|@document/);
    // no multiple segments:UserCSS only supports a single segment
    // other segments are kept but not processed
    if (p.length > 2) { return; }

    // remove updateURL (until userCSS is supported by user style sites)
    text = text.replace(/@(downloadURL|installURL|updateURL)\s.+[\r\n]+/gi, '');

    // global: no @-moz-document
    if (!p[1]) {
      // check if it has @match|@include
      // public UserStyles should not be suitable for file:///*
      const matches = /@(match|include)\s+\S+/.test(text) ? [] : ['*://*/*'];
      return this.addMatches(this.beautify(text), matches);
    }

    // find & remove @-moz-document rule
    let rules;
    const pat = /((?:@-moz-document|@document)\s.+?\))\s*{(.+)}/s; // dotAll flag /s FF78
    text = text.replace(pat, (match, m1, css) => {
      rules = m1;
      // empty @-moz-document rule: remove the closing curly bracket } at the start
      css = css.replace(/^\s+}/, '');
      return css;
    });

    // count the number of { }, add a closing } to avoid some errors
    text.split('{').length > text.split('}').length && (text += '}');

    // remove commented rules
    rules = rules.replace(/\s\/\*.*?\*\/\s/gs, ' ');

    const [matches, includes] = this.convertRules(rules);
    if (!matches[0] && !includes[0]) { return; }

    return this.addMatches(this.beautify(text), matches, includes);
  }

  static addMatches(str, matches, includes) {
    return str.replace(/==UserStyle==/i, '==UserCSS==')
              .replace(/==\/UserStyle==/i, this.getMatches(matches, includes) + '\n==/UserCSS==');
  }

  static getMatches(matches = [], includes = []) {
    // spreading an empty array/object doesn't add any element/property
    const arr = [
      '\n@compatible       FireMonkey',
      `\n@converted-from   ${this.convertedFrom || location.href}`,
      ...matches.map(i => `\n@match            ${i}`),
      ...includes.map(i => `\n@include          ${i}`),
    ];
    return arr.join('');
  }

  static beautify(text = '') {
    const options = {
      'indent_size': 2,
      'selector-separator-newline': false,
      'space_around_combinator': true,
    };

    return css_beautify(text, options);
  }

  static convertRules(rules = '') {
    let matches = [];
    let includes = [];
    const pattern = /(url|url-prefix|domain|regexp)\s*\(['"]([^'"]+)['"]\)/;
    const isUrl = str => /^https?:\/\/.+/.test(str) && !str.includes('*');
    const hasPath = str => str.split(/\/+/).length > 2;
    // match pattern host must not include a port number
    const hasPort = str => /^https?:\/\/[^/]+:\d+/.test(str);

    rules.split(/(?<=\)\s*),/).forEach(i => {
      let [, func, value] = i.match(pattern) || [];
      if (!value) { return; }

      // https://developer.mozilla.org/docs/Web/CSS/@document
      switch (func) {
        case 'url':
          // Matches an exact URL
          isUrl(value) && (hasPort(value) ? includes.push(value) : matches.push(value));
          break;

        case 'url-prefix':
          // Matches if the document URL starts with the value provided
          if (!isUrl(value)) { break; }

          // check for port & pathname
          if (hasPort(value)) {
            hasPath(value) ? includes.push(`${value}*`) : includes.push(`${value}/*`);
          }
          else {
            hasPath(value) ? matches.push(`${value}*`) : includes.push(`${value}*/*`);
          }
          break;

        case 'domain':
          // Matches if the document URL is on the domain provided (or a subdomain of it)
          value = value.replace(/^www\./, '');              // subdomain is covered in matches
          !value.includes('*') && matches.push(`*://*.${value}/*`);
          break;

        case 'regexp':
          // Matches if the document URL is matched by the regular expression provided. The expression must match the entire URL.
          // convert few basic regexp
          switch (true) {
            // not allowed: chrome-extension://.* | moz-extension://.* | ^\\w+-extension://.+
            // Stylus allows them for its own internal page
            case /^[^:]+-extension:/.test(value):
              break;

            // catch-all
            case ['.*', '.+'].includes(value):
              // public UserStyles should not be suitable for file:///*
              matches.push('*://*/*');
              break;

            case ['http:.*', 'http:.+'].includes(value):
              matches.push('http://*/*');
              break;

            case ['https:.*', 'https:.+'].includes(value):
              matches.push('https://*/*');
              break;

            default:
              // attempt to convert regexp to Glob
              includes.push(...this.regexToGlob(value));
          }
          break;
      }
    });

    // check if include can be converted to match
    includes = includes.filter(i => {
      const m = this.includeToMatch(i);
      return m ? !matches.push(m) : true;
    });

    // catch all
    if (matches.includes('*://*/*')) {
      matches = ['*://*/*'];
      includes = [];
    }

    // remove duplicates
    matches = [...new Set(matches)];
    includes = [...new Set(includes)];

    return [matches, includes];
  }

  // https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts
  // "include_globs": ["*example.com/???s/*"], "exclude_globs": ["*bar*"],
  static regexToGlob(str) {
    str = str.replace(/^\^|\$$/g, '')                       // assertions: stating ^ and ending $
              .replace(/\(\?(=|!|<=|=!).+?\)/g, '')         // assertions: lookahead, negative lookahead, lookbehind, Negative lookbehind
              .replace(/\(\?:/g, '(')                       // non-capturing group
              .replace(/\(([^|)]+)\)(?!\?)/g, '$1')         // useless group, not followed by ?
              .replaceAll('(http|https)', 'http*')
              .replaceAll('(https|http)', 'http*')
              .replaceAll('http.', 'http*')                 // http.
              .replace(/http[^:]{2,}:/g, 'http*:')          // https? | http(s)? | http(s?) | http.*
              .replace(/\{[^}]+\}/g, '+')                   // quantifiers {n,m}
              .replace(/\([^)]+\)\?/g, '*')                 // optional group (...)?
              .replace(/\[[^\]]+\][+*]/g, '*')              // range [...]+ [...]*
              // .replace(/[^\\)\]]\?/g, '*')                  // optional single x?
              .replaceAll('+', '*')
              .replace(/(?<!\\)\.([*?])/g, '$1')            // .* .?
              .replace(/\\{1,}([/:])/g, '$1')               // unnecessary escape \/ \:
              .replace(/\\{1,}([.?])/g, '$1')               // unescape literal \. \?
              .replace(/\\{1,}[dws][+*]?/gi, '*')           // character classes: \d \D \w \W \s \S
              .replace(/([*?]){2,}/g, '$1');                // remove repeated * ?

    // process piped group (no sub-groups), limit the number of recursion
    let n = 0;
    while (n < 5 && /\([^)]+\|[^)]+\)/.test(str)) {
      str = str.split('!!').map(i => this.expandGroup(i)).join('!!');
      n++;
    }
    // final clean up
    str = str.replace(/([*?]){2,}/g, '$1');                 // remove repeated * ?

    // always return an array
    // check if it still has escaped characters
    if (str.includes('(') || str.includes(')') || str.includes('|') || str.includes('\\')) { return []; }
    return str.split('!!');
  }

  static expandGroup(str) {
    // replace piped group
    return str.replace(/(.*?)\((.+?)\)(.*)/, (match, before, m, after) =>
      m.split('|').map(i => before + i + after).join('!!')
    );
  }

  // static includeToMatch(str) {
  //   let [scheme, host, ...path] = str.split(/:?\/+/);
  //   scheme === 'http*' && (scheme = '*');                   // http*:// to *://

  //   switch (true) {
  //     case !['*', 'http', 'https'].includes(scheme):        // unacceptable scheme
  //     case !str.includes('://'):                            // URL fragment
  //     case !host:                                           // URL fragment
  //     case host.includes('?') || host.includes('*'):        // no wildcard in host
  //     case /:\d+$/.test(host):                              // no port in host
  //       return;
  //   }

  //   path.length || path.push('');                           // add pathname if missing
  //   return scheme + '://' + [host, ...path].join('/');
  // }

  static includeToMatch(str) {
    str.startsWith('http*:') && (str = str.substring(4));   // http*:// to *://
    str.split(/\/+/).length > 2 || (str += '/');            // add path if missing
    return this.validMatchPattern(str) ? str : null;
  }

  // --- test match pattern validity
  static validMatchPattern(p) {
    return p === '<all_urls>' ||
          /^(https?|\*):\/\/(\*|\*\.[^*:/]+|[^*:/]+)\/.*$/i.test(p) ||
          /^file:\/\/\/.+$/i.test(p);
  }
}