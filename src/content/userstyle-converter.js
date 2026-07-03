import {Pattern} from './pattern.js';

// ---------- convert userstyle to userCSS -----------------
// convert if standard CSS and global/single section
export class UserStyleConverter {

  static canConvert(str) {
    // check meta
    const meta = str.match(/==(UserStyle)==(.+?)==\/\1==/is)?.[1];
    const p = str.split(/@-moz-document|@document/);
    switch (true) {
      // check UserStyle
      case !meta:
      // no @var checkbox in CSS
      case /@(var|advanced)\s+checkbox/.test(meta):
      // no @var|@advanced if @preprocessor less|stylus, @type is used by some userStyles
      case /@(var|advanced)\s+\S+/.test(meta) && /@(preprocessor|type)\s+(less|stylus)\s/i.test(meta):
      // multiple segments
      case p.length > 2:
      // has regexp() rule
      case /\sregexp\s*\(.+\)/.test(str):
        return false;
    }

    return true;
  }

  static get(str, updateURL = '') {
    if (!this.canConvert(str)) { return; }

    // replace UserStyle with UserCSS
    str = str.replace(/==(\/)?UserStyle==/gi, '==$1UserCSS==');

    // remove updateURL (until userCSS is supported by user style sites)
    str = str.replace(/@(downloadURL|installURL|updateURL)\s.+[\r\n]+/gi, '');

    const p = str.split(/@-moz-document|@document/);
    // global: no @-moz-document
    if (!p[1]) {
      return str;
    }

    // convert each segment
    const [css, matches, includes] = this.convert(p[1]);
    // spreading an empty array/object doesn't add any element/property
    const arr = [
      '@compatible       FireMonkey',
      `@converted-from   ${updateURL}`,
      ...matches.map(i => `@match            ${i}`),
      ...includes.map(i => `@includes         ${i}`),
      '==/UserCSS==',
    ];

    p[0] = p[0].replace('==/UserCSS==', arr.join('\n'));
    return [p[0], css].join('\n');
  }

  static convert(str) {
    const matches = [];
    const includes = [];
    const [rules, css] = this.getByIndex(str, '{', '}');

    // remove quotes and whitespace, split ','
    rules.replace(/['"\s]/g, '').split(',').forEach(i => {
      const [func, value] = this.getByIndex(i, '(', ')');
      if (!func || !value) { return ''; }

      const sort = (p) => (Pattern.validMatchPattern(p) ? matches : includes).push(p);

      switch (func) {
        case 'url':
          // Matches an exact URL
          sort(value);
          break;

        case 'url-prefix':
          // Matches if the document URL starts with the value provided
          sort(value + '*');
          break;

        case 'domain':
          // Matches if the document URL is on the domain provided (or a subdomain of it)
          sort(`*://*.${value}/*`);
          break;

        case 'regexp':
          // Matches if the document URL is matched by the regular expression provided.
          // The expression must match the entire URL.
          includes.push(`/${value}/`);
          break;
      }
    });

    return [css, matches, includes];
  }

  static getByIndex(str, a, b) {
    const start = str.indexOf(a);
    const end = str.lastIndexOf(b);
    const before = str.substring(0, start).trim();
    const middle = str.substring(start + 1, end).trim();
    return [before, middle];
  }
}