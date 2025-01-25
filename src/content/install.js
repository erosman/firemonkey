// ---------- Direct Installer -----------------------------
// URLs ending in user.js & user.css
// alert/confirm/prompt not working in raw.githubusercontent.com | gist.githubusercontent.com
/* global CodeMirror */

class Install {

  static {
    // not on these URLs
    switch (location.hostname) {
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

    let updateURL = location.href;
    let text = this.pre.textContent.trim();
    const name = text.match(/\s*@name\s+([^\r\n]+)/)?.[1];
    if (!text || !name) {
      this.p.textContent = browser.i18n.getMessage('metaError');
      this.install.disabled = true;
      return;
    }

    this.p.innerText = browser.i18n.getMessage('installConfirm', name);
    this.install.addEventListener('click', () => {
      browser.runtime.sendMessage({api: 'install', name, text, updateURL});
      this.install.disabled = true;
      this.convert.disabled = true;
      back && (typeof back === 'string' ? location.href = back : history.back());
    });

    // highlight syntax
    this.highlight(text);

    // https://bugzilla.mozilla.org/show_bug.cgi?id=1536094
    // Dynamic module import doesn't work in webextension content scripts (fixed in FF89)
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1803950
    // Dynamic import fails in content script in MV3 extension
    // --- convert to UserCSS
    if (location.pathname.endsWith('.user.css')) {
      const {UserStyle} = await import(browser.runtime.getURL('content/userstyle.js'));
      const userCSS = UserStyle.process(text, this.convertedFrom);
      if (userCSS) {
        this.convert.style.visibility = 'visible';
        this.convert.addEventListener('click', () => {
          text = userCSS;
          this.highlight(text);
          this.convert.disabled = true;
          updateURL = '';                                     // disable remote update
        });
      }
    }
  }

  static addDOM() {
    const div = document.createElement('div');
    div.className = 'fm';

    const h = document.createElement('h2');
    h.textContent = 'FireMonkey';

    this.p = document.createElement('p');

    this.install = document.createElement('button');
    this.install.textContent = browser.i18n.getMessage('install');
    this.install.className = 'install';

    this.convert = this.install.cloneNode();
    this.convert.textContent = browser.i18n.getMessage('convertToUserCSS');
    this.convert.className = 'convert';

    const p = this.p.cloneNode();
    p.className = 'buttons';
    p.append(this.convert, this.install);

    div.append(h, this.p, p);
    document.body.prepend(div);

    // add a second pre
    this.cm = document.createElement('pre');
    this.cm.className = 'cm-s-default';
    document.body.appendChild(this.cm);
  }

  static highlight(text) {
    this.pre.style.display = 'none';
    this.cm.textContent = '';

    globalThis.GM = {};                                     // avoid GM is not defined
    const mode = /==UserScript==/i.test(text) ? 'javascript' : 'css';
    CodeMirror.runMode(text, mode, this.cm, {tabSize: 2});
  }
}