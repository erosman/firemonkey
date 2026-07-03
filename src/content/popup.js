import {pref, App} from './app.js';
import {Meta} from './meta.js';
import {Match} from './match.js';
import {Group} from './group.js';
import './scratchpad.js';
import './i18n.js';

// ---------- user preferences -----------------------------
await App.getPref();

// ---------- popup ----------------------------------------
class Popup {

  static {
    // --- add custom style
    pref.customPopupCSS && document.querySelector('style').append(pref.customPopupCSS);

    // --- Scripts
    this.liTemplate = document.querySelector('section.main template').content.firstElementChild;
    this.ulTab = document.querySelector('ul.tab');
    this.ulOther = document.querySelector('ul.other');

    this.docFrag = document.createDocumentFragment();
    document.querySelectorAll('.main button').forEach(i =>
      i.addEventListener('click', e => this.processButtons(e)));

    this.process();

    // App.android && document.body.classList.add('android');
  }

  static processButtons(e) {
    const [action] = e.target.dataset.i18n.split('|');
    switch (action) {
      case 'options':
        browser.runtime.openOptionsPage();
        break;

      case 'newJS':
      case 'newCSS':
        browser.tabs.create({
          url: `/content/options.html?${action}&url=${encodeURIComponent(this.tab.url)}&container=${this.tab.cookieStoreId.substring(8)}`
        });
        break;

      case 'help':
        browser.tabs.create({url: '/content/options.html?help'});
        break;
    }
    window.close();
  }

  static async process() {
    [this.tab] = await browser.tabs.query({currentWindow: true, active: true});
    // active tab id
    const tabId = this.tab.id;

    // make find script list
    this.setSearch(this.tab.url);

    const [Tab, Other, frames] = await Match.process(this.tab, pref);
    // display frame count
    document.querySelector('span.frame').textContent = frames;

    Tab.forEach(i => this.docFrag.append(this.addScript(pref[i])));
    this.ulTab.append(this.docFrag);
    Other.forEach(i => this.docFrag.append(this.addScript(pref[i])));
    this.ulOther.append(this.docFrag);

    // check commands if there are active scripts in tab & has registerMenuCommand FM 2.45
    Info.getMenuCommand(Tab, tabId);

    // add click listener if it has children
    [this.ulTab, this.ulOther].forEach(i =>
      i.children[0] && i.addEventListener('click', e => this.getClick(e)));
  }

  static getClick(e) {
    const li = e.target.closest('li');
    switch (true) {
      case !li?.id:
        break;

      case e.target.matches('.flag'):
        this.toggleState(li);
        break;

      case e.target.matches('.name'):
        Info.show(li);
        break;
    }
  }

  static addScript(i) {
    const li = this.liTemplate.cloneNode(true);
    li.id = '_' + i.name;
    li.classList.add(i.js ? 'js' : 'css');
    i.enabled || li.classList.add('disabled');
    i.group?.[0] && li.classList.add('group');
    const sp = li.children;
    sp[1].textContent = i.name;

    if (i.error) {
      sp[0].textContent = '✘';
      sp[0].style.color = '#f00';
    }
    return li;
  }

  static toggleState(li) {
    const id = li.id;
    li.classList.toggle('disabled');
    pref[id].enabled = !li.matches('.disabled');

    const obj = {[id]: pref[id]};

    // --- process @group
    const gIds = Group.set(pref, id);
    gIds.forEach(i => obj[i] = pref[i]);

    // update saved pref
    browser.storage.local.set(obj);

    // update scripts message to background.js
    browser.runtime.sendMessage({update: 'script', pref, ids: Object.keys(obj)});
  }

  // --- set Find scripts for this site
  static setSearch(url) {
    // check for acceptable url
    url = URL.parse(url);
    if (!url) { return; }

    const domain = url.protocol.startsWith('http') ? url.hostname.replace(/^www\./, '') : '';
    document.querySelectorAll('.find a').forEach(i => i.href = i.href.replace(/;domain;/, domain));
  }
}
// ---------- /popup ---------------------------------------

// ---------- info + run/undo ------------------------------
class Info {

  static {
    // --- Info
    this.navInfo = document.querySelector('input#info');
    this.infoDL = document.querySelector('.info dl');
    this.commandList = document.querySelector('.command dl');

    this.dtTemp = document.createElement('dt');
    this.ddTemp = document.createElement('dd');
    this.aTemp = document.createElement('a');
    this.aTemp.target = '_blank';

    this.docFrag = document.createDocumentFragment();
    document.querySelectorAll('.info button').forEach(i =>
      i.addEventListener('click', e => this.processButtons(e)));
  }

  static processButtons(e) {
    const parentId = e.target.parentElement.id;
    const id = e.target.dataset.i18n;
    switch (id) {
      case 'edit':
        browser.tabs.create({url: '/content/options.html?script=' + parentId.substring(1)});
        window.close();
        break;

      case 'run':
        this.run(parentId);
        break;

      case 'undo':
        this.undo(parentId);
        break;
    }
  }

  static show(li) {
    // reset
    this.infoDL.textContent = '';
    this.infoDL.previousElementSibling.className = '';
    this.infoDL.previousElementSibling.classList.add(...li.classList);

    const id = li.id;
    // deep clone pref object
    const script = structuredClone(pref[id]);
    // show homepage/support/etc
    Object.assign(script, this.getMetadata(script));

    script.size = new Intl.NumberFormat().format(((script.js || script.css).length / 1024).toFixed(1)) + ' KB';

    const infoArray = [
      'name', 'description', 'author', 'version', 'size', 'license', 'require', 'group',
      'matches', 'excludeMatches', 'includes', 'excludes', 'includeGlobs', 'excludeGlobs',
      'grant', 'container', 'injectInto', 'unwrap', 'connect', 'runAt', 'error',
      'homepage', 'support', 'updateURL', 'antifeature',
    ];

    // --- i18n
    const [lang, generic] = App.getLanguage();

    infoArray.forEach(item => {
      if (!script[item]) { return; }

      const arr = Array.isArray(script[item]) ? script[item] :
        typeof script[item] === 'string' ? script[item].split(/\r?\n/) : [script[item]];
      if (!arr[0]) { return; }

      switch (item) {
        // i18n if different
        case 'name':
        case 'description':
          // fallback to primary language
          const i18n = script.i18n[item][lang] || script.i18n[item][generic];
          i18n && i18n !== script[item] && arr.push(i18n);
          break;

        case 'homepage':
        case 'support':
        case 'updateURL':
          const a = this.aTemp.cloneNode();
          a.href = script[item];
          a.textContent = decodeURI(script[item]);
          arr[0] = a;
          break;

        case 'injectInto':
          item = 'inject-into';
          break;

        case 'grant':
        case 'connect':
          arr.sort();
          break;

        case 'runAt':
          item = 'run-at';
          arr[0] = arr[0].replace('_', '-');
          break;
      }

      const dt = this.dtTemp.cloneNode();
      item === 'error' && dt.classList.add('error');
      dt.textContent = item;
      this.docFrag.append(dt);

      arr.forEach(i => {
        const dd = this.ddTemp.cloneNode();
        dd.append(i);
        dd.children[0] && (dd.style.opacity = 0.8);
        this.docFrag.append(dd);
      });
    });

    this.infoDL.append(this.docFrag);
    const edit = document.querySelector('div.edit');
    edit.id = id;
    // only for CSS
    edit.children[2].disabled = !!script.js;
    edit.children[2].disabled && (edit.children[2].title = browser.i18n.getMessage('undoDisabled'));

    // navigate slide to info page
    this.navInfo.checked = true;
  }

  static getMetadata(script) {
    const meta = (script.js || script.css).match(Meta.regEx)[2];

    const regex = /@(\S+)[^\S\r\n]*(.*)/g;
    let m = meta.matchAll(regex);
    // always returns an array
    m = [...m].map(i => [i[1], i[2]]);

    // convert to obj
    const obj = Object.fromEntries(m);

    // get antifeature
    const antifeature = m.filter(i => i[0] === 'antifeature').map(i => i[1]);
    antifeature[0] && (obj.antifeature = antifeature);

    // keep stored data
    Object.keys(obj).forEach(i => script[i] && delete obj[i]);

    // look for @homepage @homepageURL @website and @source
    obj.homepage ||= obj.homepageURL || obj.website || obj.source;
    // make homepage from updateURL
    const url = script.updateURL;
    switch (true) {
      case !!obj.homepage || !url:
        break;

      case url.startsWith('https://update.greasyfork.org/scripts/'):
      case url.startsWith('https://update.sleazyfork.org/scripts/'):
        obj.homepage = url.replace('://update.', '://').replace(/(\/scripts\/\d+\/).+/, '$1');
        break;

      case url.startsWith('https://greasyfork.org/scripts/'):
      case url.startsWith('https://sleazyfork.org/scripts/'):
        obj.homepage = url.replace(/\/code.+/, '');
        break;

      case url.startsWith('https://openuserjs.org/install/'):
        obj.homepage = url.replace('/install/', '/scripts/').replace(/\.user\.js/, '');
        break;

      case url.startsWith('https://userstyles.org/styles/'):
        obj.homepage = url.replace(/userjs\/|\.(user\.js|css)$/, '');
        break;

      case url.startsWith('https://cdn.jsdelivr.net/gh/'):
        obj.homepage = 'https://github.com/' + url.substring(28).replace('@', '/tree/').replace(/\/[^/]+\.user\.js/, '');
        break;

      case url.startsWith('https://github.com/'):
        obj.homepage = url.replace('/raw/', '/tree/').replace(/\/[^/]+\.user\.js/, '');
        break;
    }

    return obj;
  }

  static run(id) {
    const i = pref[id];
    const code = Meta.prepare(i.js || i.css);
    // in case of userStyle
    if (!code.trim()) { return; }

    (i.js ? browser.tabs.executeScript({code}) : browser.tabs.insertCSS({code, cssOrigin: i.origin || 'author'}))
    .catch(e => App.notify(`${id.substring(1)}: ${e}`));
  }

  static undo(id) {
    const item = pref[id];
    // only for userCSS
    if (!item.css) { return; }

    const code = Meta.prepare(item.css);
    // e.g. in case of userStyle
    if (!code.trim()) { return; }

    browser.tabs.removeCSS({code, cssOrigin: item.origin || 'author'})
    .catch(e => App.notify(`${id.substring(1)}: ${e}`));
  }

  // ---------- script commands ----------------------------
  static getMenuCommand(Tab, tabId) {
    // --- check commands if there are active scripts in tab & has registerMenuCommand v2.45
    if (Tab.some(item => pref[item].enabled &&
      ['GM_registerMenuCommand', 'GM.registerMenuCommand'].some(i => pref[item].grant?.includes(i)))) {
      browser.runtime.onMessage.addListener((message, sender) =>
        sender.tab.id === tabId && this.addCommand(tabId, message));
      browser.tabs.sendMessage(tabId, {listCommand: []});
    }
  }

  static addCommand(tabId, message) {
    // {name, command: Object.keys(command)}
    if (!message.command?.[0]) { return; }

    const dl = this.commandList;
    const dt = this.dtTemp.cloneNode();
    dt.textContent = message.name;
    this.docFrag.append(dt);

    message.command.forEach(i => {
      const dd = this.ddTemp.cloneNode();
      dd.textContent = i;
      dd.addEventListener('click', () => {
        browser.tabs.sendMessage(tabId, {name: message.name, command: i});
        window.close();
      });
      this.docFrag.append(dd);
    });
    dl.append(this.docFrag);
  }
}
// ---------- /info + run/undo -----------------------------