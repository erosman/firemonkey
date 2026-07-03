// ---------- direct installer -----------------------------
// URLs ending in user.js & user.css
// alert/confirm/prompt not working in raw.githubusercontent.com | gist.githubusercontent.com
/* global CodeMirror */

class Install {

  static {
    switch (location.hostname) {
      // only some URLs
      case 'gitee.com':
      case 'gitlab.com':
      case 'codeberg.org':
        location.pathname.includes('/raw/') && this.process();
        break;

      case 'raw.githubusercontent.com':
      case 'gist.githubusercontent.com':
        this.process(true);
        break;

      case 'update.greasyfork.org':
      case 'update.sleazyfork.org':
        const back = location.href.replace('://update.', '://').replace(/(\/scripts\/\d+\/).+/, '$1');
        this.convertedFrom = back;
        this.process(back);
        break;

      case 'userstyles.world':
        this.convertedFrom = location.href.replace('/api/', '/').replace('.user.css', '/');
        this.process();
        break;

      default:
        this.process();
    }
  }

  static async process(back) {
    this.pre = document.querySelector('pre');
    if (!this.pre) { return; }

    // add install DOM
    this.addDOM();

    const updateURL = location.href;
    const text = this.pre.textContent.trim();
    const name = text.match(/\s*@name\s+([^\r\n]+)/)?.[1];
    if (!text || !name) {
      this.p.textContent = browser.i18n.getMessage('metaError');
      this.install.disabled = true;
      return;
    }

    this.p.innerText = browser.i18n.getMessage('installConfirm', name);

    this.install.addEventListener('click', () => {
      browser.runtime.sendMessage({install: true, name, text, updateURL});
      this.install.disabled = true;
      back && (typeof back === 'string' ? location.href = back : history.back());
    });

    // highlight syntax
    this.highlight(text);
  }

  static addDOM() {
    const div = document.createElement('div');
    div.className = 'fm';

    const h = document.createElement('h2');
    h.textContent = 'FireMonkey';

    this.p = document.createElement('p');

    this.install = document.createElement('button');
    this.install.textContent = browser.i18n.getMessage('install');

    div.append(h, this.p, this.install);
    document.body.prepend(div);

    // add a second pre
    this.cm = document.createElement('pre');
    this.cm.className = 'cm-s-default';
    document.body.append(this.cm);
  }

  static highlight(text) {
    this.pre.style.display = 'none';
    this.cm.textContent = '';
    const mode = /==UserScript==/i.test(text) ? 'javascript' : 'css';
    CodeMirror.runMode(text, mode, this.cm, {tabSize: 2});
  }
}