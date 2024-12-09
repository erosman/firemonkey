// ---------- UserStyle Parser -------------------------
export class UserStyle {

  static process(data, str) {
    // split all sections
    str.split(/@-moz-document\s+/).slice(1).forEach(moz => {
      const st = moz.indexOf('{');
      const end = moz.lastIndexOf('}');
      if (st === -1 || end === -1) { return; }

      const rule = moz.substring(0, st).trim();
      let css = moz.substring(st + 1, end).trim();

      // process preprocessor
      data.preprocessor && (css = this.preprocessor(css, data.preprocessor, data.userVar));

      const obj = {
        matches: [],
        css: css.trim()
      };

      const r = rule.split(/\s*[\s()'",]+\s*/);             // split into pairs
      for (let i = 0; i < r.length; i += 2) {
        if (!r[i + 1]) { break; }
        const func = r[i];
        const value = r[i + 1];

        switch (func) {
          case 'domain': obj.matches.push(`*://*.${value}/*`); break;
          case 'url': obj.matches.push(value); break;
          case 'url-prefix':
            obj.matches.push(value + (value.split(/:?\/+/).length > 2 ? '*' : '/*')); // fix no path
            break;

          // convert basic regexp, ignore the rest
          case 'regexp':
            switch (value) {
              case '.*':                                    // catch-all
                obj.matches.push('*://*/*');
                break;
              case 'http:.*':
                obj.matches.push('http://*/*');
                break;
              case 'https:.*':
                obj.matches.push('https://*/*');
                break;
            }
            break;
        }
      }

      obj.matches[0] && data.style.push(obj);
    });
  }
}