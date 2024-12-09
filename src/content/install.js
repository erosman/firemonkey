// ---------- Direct Installer -----------------------------
// URLs ending in user.js & user.css

// https://bugzilla.mozilla.org/show_bug.cgi?id=1451545
// Support loading content scripts as ES6 modules
// https://bugzilla.mozilla.org/show_bug.cgi?id=1536094
// Dynamic module import doesn't work in webextension content script (fixed in FF89)
// https://bugzilla.mozilla.org/show_bug.cgi?id=1803950
// Dynamic import fails in content script in MV3 extension

// alert/confirm/prompt not working in raw.githubusercontent.com | gist.githubusercontent.com

// https://bugzilla.mozilla.org/show_bug.cgi?id=1411641
// CSP 'sandbox' directive prevents content scripts from matching (fixed in FF128)
// https://bugzilla.mozilla.org/show_bug.cgi?id=1267027
// [meta] Page CSP should not apply to content inserted by content scripts (V2 issue)

class Install {

  static {
    // not on these URLs
    switch (location.hostname) {
      case 'gitee.com':
      case 'gitlab.com':
      case 'codeberg.org':
        location.pathname.includes('/raw/') && this.process();
        break;

      case 'update.greasyfork.org':
      case 'update.sleazyfork.org':
      // https://greasyfork.org/en/scripts/431691-bypass-all-shortlinks
      // https://update.greasyfork.org/scripts/431691/Bypass%20All%20Shortlinks.user.js
      // https://greasyfork.org/scripts/406535/

        const id = location.href.match(/\/scripts\/(\d+)/)?.[1];
        const back = id && `https://greasyfork.org/scripts/${id}/`;
        this.process(back);
        break;

      default:
        this.process();
    }
  }

  static process(back) {
    // add install DOM
    this.makeDOM();

    const text = document.body?.textContent?.trim() || '';
    const name = text.match(/\s*@name\s+([^\r\n]+)/)?.[1];
    if (!text || !name) {
      this.p.textContent = browser.i18n.getMessage('metaError');
      document.body.prepend(this.div);
      this.button.disabled = true;
      return;
    }

    this.p.innerText = browser.i18n.getMessage('installConfirm', name);
    this.button.addEventListener('click', () => {
      browser.runtime.sendMessage({api: 'install', name, text, updateURL: location.href});
      this.button.disabled = true;
      back && (location.href = back);
    });

    document.body.prepend(this.div);
  }

  static makeDOM() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = browser.runtime.getURL('content/install.css');
    document.head.append(link);

    this.div = document.createElement('div');
    this.div.className = 'fm';

    const h = document.createElement('h2');
    h.textContent = 'FireMonkey';

    this.p = document.createElement('p');

    this.button = document.createElement('button');
    this.button.textContent = browser.i18n.getMessage('install');

    this.div.append(h, this.p, this.button);
  }
}