import {pref, App} from './app.js';
import {ProgressBar} from './progress-bar.js';
import {FS} from './fs.js';
import {Meta} from './meta.js';
import {RemoteUpdate} from './remote-update.js';
import {Pattern} from './pattern.js';
import {Color} from './color.js';
import {Editor, Linter} from './editor.js';
import {Group} from './group.js';
import {CustomValidity} from './custom-validity.js';
import {Nav} from './nav.js';
import './log.js';
import './i18n.js';

// ---------- user preferences -----------------------------
await App.getPref();

// ---------- options --------------------------------------
class Options {

  static {
    // --- add custom style
    pref.customOptionsCSS && document.querySelector('style').append(pref.customOptionsCSS);

    App.android && document.body.classList.add('android');

    // select the environment (not for sidebar.html)
    !document.body.matches('.sidebar') && this.initOptions();
  }

  // init on options page
  static initOptions() {
    document.querySelector('.options button[data-i18n="importFromUrl"]')
    .addEventListener('click', this.importFromUrl);
    // submit button
    document.querySelector('.options button[type="submit"]').addEventListener('click', () => this.check());

    this.globalExclude = document.getElementById('globalExclude');
    this.cspExclude = document.getElementById('cspExclude');
    this.advanced = document.querySelector('details.advanced');
    this.editorOptions = document.getElementById('editorOptions');
    this.linterOptions = document.getElementById('linterOptions');
    this.syncInput = document.getElementById('sync');

    // --- CustomValidity reset elements
    this.customNodes = [
     this.syncInput,
     this.globalExclude,
     this.cspExclude,
     this.editorOptions,
     this.linterOptions,
    ];



    this.init(['autoUpdateInterval', 'counter', 'sync', 'globalExclude', 'cspExclude',
      'editorOptions', 'linterOptions', 'customOptionsCSS', 'customPopupCSS']);
  }

  static init(keys = Object.keys(pref)) {
    // defaults to pref keys
    this.prefNode = document.querySelectorAll('#' + keys.join(', #'));

    this.process();
  }

  static process(save) {
    // 'save' is only set when clicking the button to save options
    this.prefNode.forEach(node => {
      // value: 'select-one', 'textarea', 'text', 'number'
      const attr = node.type === 'checkbox' ? 'checked' : 'value';
      save ? pref[node.id] = node[attr] : node[attr] = pref[node.id];
    });

    // update saved pref
    if (save) {
      ProgressBar.show();
      browser.storage.local.set(pref);
      this.sync(pref);
    }
  }

  static async sync(pref) {
    // sync not enabled
    if (!pref.sync) { return; }

    // save changes to sync
    const obj = {...pref};
    const ignore = ['autoUpdateInterval', 'autoUpdateLast', 'sync'];
    ignore.forEach(i => delete obj[i]);

    // remove older data
    await browser.storage.sync.clear();
    // set new data
    browser.storage.sync.set(obj)
    .catch(e => {
      CustomValidity.set(this.syncInput, `Sync: ${e}`);
      // disabling sync option to avoid repeated errors
      this.syncInput.checked = false;
      browser.storage.local.set({sync: false});
    });
  }

  static check() {
    // clear setCustomValidity
    CustomValidity.clear(this.customNodes);

    // --- check exclude patterns
    if (!this.validateMatchPattern(this.globalExclude)) { return; }
    if (!this.validateMatchPattern(this.cspExclude)) { return; }

    // --- check user options
    if (!this.validateJsonOptions(this.editorOptions)) { return; }
    if (!this.validateJsonOptions(this.linterOptions)) { return; }

    // validate user linter Options
    const error = this.linterOptions.value && Linter.validateUserOptions(this.linterOptions.value);
    if (error) {
      this.advanced.open = true;
      CustomValidity.set(this.linterOptions, error);
      return;
    }

    // update editor options with user options
    pref.editorOptions !== this.editorOptions.value && Editor.updateOptions(this.editorOptions.value);
    pref.linterOptions !== this.linterOptions.value && Linter.updateOptions(this.linterOptions.value);

    // check old values
    const cspExclude = this.cspExclude.value !== pref.cspExclude;
    const globalExclude = this.globalExclude.value !== pref.globalExclude;

    // --- save options
    this.process(true);

    // --- update cspExclude message to background.js
    cspExclude && browser.runtime.sendMessage({update: 'cspExclude', pref});

    // --- update globalExclude message to background.js
    globalExclude && browser.runtime.sendMessage({update: 'globalExclude', pref});
  }

  static validateMatchPattern(elem) {
    elem.value = elem.value.trim();
    if (!elem.value) { return true; }

    // remove duplicates & sort to compare changes
    const array = [...new Set(elem.value.split(/\s+/))].sort();
    elem.value = array.join('\n');

    // use for loop to be able to break early
    for (const item of array) {
      const error = Pattern.hasError(item);
      if (error) {
        elem === this.cspExclude && (this.advanced.open = true);
        CustomValidity.set(elem, `${item}\n${error}`);
        return false;
      }
    }
    return true;
  }

  static validateJsonOptions(elem) {
    elem.value = elem.value.trim();
    if (!elem.value) { return true; }

    try {
      JSON.parse(elem.value);
      return true;
    }
    catch (e) {
      this.advanced.open = true;
      CustomValidity.set(elem, e);
      return false;
    }
  }

  static async importFromUrl() {
    const url = prompt(
      browser.i18n.getMessage('importFromUrlMessage'),
      localStorage.getItem('importFromUrl') || '')?.trim();
    if (!url) { return; }

    localStorage.setItem('importFromUrl', url);
    const data = await fetch(url).then(r => r.json()).catch(e => App.notify(`fetch: ${e}`));
    if (!data) { return; }

    // set options after the pref update, update page display
    Object.assign(pref, data);
    Options.process();
    Script.process();
  }
}
// ---------- /options -------------------------------------

// ---------- scripts --------------------------------------
class Script {

  static {
    // --- sidebar specific options
    if (document.body.matches('.sidebar')) {
      const sidebarOptions = {
        minimap: {enabled: false},
        wordWrap: 'on',
      };
      Editor.updateOptions(JSON.stringify(sidebarOptions));
    }

    // update editor options with user options
    Editor.updateOptions(pref.editorOptions);
    Linter.updateOptions(pref.linterOptions);

    this.docFrag = document.createDocumentFragment();
    this.liTemplate = document.createElement('li');
    this.navUL = document.querySelector('aside ul');
    this.legend = document.querySelector('.scripts legend');
    this.box = document.querySelector('.scripts .editor');

    this.saveButton = document.querySelector('.scripts button[data-i18n="save"]');
    this.updateButton = document.querySelector('.scripts button[data-i18n="update|title"]');
    this.uploadButton = document.querySelector('.scripts button[data-i18n="upload|title"]');

    this.enable = document.getElementById('enable');
    this.enable.addEventListener('change', () => this.toggleEnable());
    Meta.enable = this.enable;

    this.autoUpdate = document.getElementById('autoUpdate');
    this.autoUpdate.addEventListener('change', () => this.toggleAutoUpdate());
    Meta.autoUpdate = this.autoUpdate;

    // --- User Variables
    this.userVar = document.querySelector('ul.user-var');
    Meta.userVar = this.userVar;
    document.querySelector('button.user-var').addEventListener('click', () => this.resetUserVar());

    // --- User Metadata
    this.userMeta = document.getElementById('userMeta');
    this.userMeta.value = '';
    Meta.userMeta = this.userMeta;

    const userMetaSelect = document.getElementById('userMetaSelect');
    userMetaSelect.selectedIndex = 0;
    userMetaSelect.addEventListener('change', e => {
      this.userMeta.value = (this.userMeta.value + '\n' + e.target.value).trim();
      e.target.selectedIndex = 0;
    });

    this.settings = document.getElementById('settings');

    // --- Storage
    this.storage = document.getElementById('storage');
    this.storage.value = '';

    // --- buttons
    document.querySelectorAll('.scripts button[data-i18n]').forEach(i =>
      i.addEventListener('click', e => this.processButtons(e)));

    // --- Import/Export Script
    document.getElementById('fileScript').addEventListener('change', e => this.processFileSelect(e));

    // --- unsaved changes
    window.addEventListener('beforeunload', e => this.unsavedChanges() && e.preventDefault());

    // --- update on changes to the storage (storage.local.onChanged FF101)
    browser.storage.local.onChanged.addListener(e => this.onChanged(e));

    // --- CustomValidity reset elements
    this.customNodes = [
      this.saveButton,
      this.updateButton,
      this.uploadButton,
      this.autoUpdate,
      this.storage,
    ];

    this.process();
  }

  // update pref & scripts when options page is open (from popup, update, install, sync)
  static onChanged(changes) {
    Object.keys(changes).forEach(item => {
      pref[item] = changes[item].newValue;
      if (!item.startsWith('_')) { return; }

      const {oldValue, newValue} = changes[item];
      const id = item;

      // enabled/disabled
      if (oldValue && newValue && newValue.enabled !== oldValue.enabled) {
        const li = document.getElementById(id);
        li && li.classList.toggle('disabled', !newValue.enabled);
        if (id === this.box.id) {
          this.legend.classList.toggle('disabled', !newValue.enabled);
          this.enable.checked = newValue.enabled;
        }
      }

      // check script storage
      if (id === this.box.id && newValue?.storage !== oldValue?.storage) {
        this.storage.value = Object.keys(pref[id].storage).length ?
          JSON.stringify(pref[id].storage, null, 2) : '';
      }
    });
  }

  static processButtons(e) {
    const [action] = e.target.dataset.i18n.split('|');
    switch (action) {
      case 'save':
        CustomValidity.clear(this.customNodes);
        return this.saveScript();

      case 'update':
        return this.updateScript();

      case 'delete':
        CustomValidity.clear(this.customNodes);
        return this.deleteScript();

      case 'newJS':
      case 'newCSS':
        CustomValidity.clear(this.customNodes);
        return this.newScript(action);

      case 'export':
        return this.exportScript(e);

      case 'upload':
        return this.uploadScript();
    }
  }

  static process() {
    // clear data
    this.navUL.textContent = '';

    App.getIds(pref).sort(Intl.Collator().compare).forEach(i => this.addScript(pref[i]));
    this.navUL.append(this.docFrag);

    // refresh previously loaded content
    if (this.box.id) {
      // this.box.value = '';
      Editor.set();
      document.getElementById(this.box.id).click();
    }
  }

  static template = {
    js:
`// ==UserScript==
// @name             A
// @match            *://*/*
// @version          1.0
// ==/UserScript==`,

    css:
`/*
==UserCSS==
@name             A
@match            *://*/*
@version          1.0
==/UserCSS==
*/`
  };

  static async newScript(id) {
    const type = id === 'newJS' ? 'js' : 'css';
    const {box, legend} = this;
    // start disabled to avoid registering incomplete script on save
    this.enable.checked = false;
    // remove on, single or multi-select
    document.querySelectorAll('aside li.on').forEach(i => i.classList.remove('on'));

    if (this.unsavedChanges()) { return; }

    box.id = '';
    box.dataset.updateURL = '';
    legend.textContent = '';
    legend.className = type;
    legend.textContent = browser.i18n.getMessage(id);
    this.userMeta.value = '';
    this.storage.value = '';

    const text = pref.template[type] ?
      await this.processTemplate(pref.template[type]) : this.template[type];

    Editor.set(text);
  }

  // check url passed from popup or toolbar context-menu
  static async processTemplate(str) {
    // process date
    str = str.replaceAll('{{date}}', new Date().toISOString().substring(0, 10));

    // sidebar | options.js
    let url, container;
    if (document.body.matches('.sidebar')) {
      const [tab] = await browser.tabs.query({currentWindow: true, active: true});
      url = tab.url;
      container = tab.cookieStoreId.substring(8);
    }
    else {
      const params = new URLSearchParams(location.search);
      url = params.get('url');
      container = params.get('container');
    }

    // URL.parse() FF126
    url = URL.parse(url);
    if (!url) { return str; }

    const obj = {
      container,
      hash: url.hash,
      host: url.host,
      hostname: url.hostname,
      href: url.href,
      origin: url.origin,
      password: url.password,
      pathname: url.pathname,
      port: url.port,
      protocol: url.protocol,
      search: url.search,
      username: url.username,
    };

    Object.entries(obj).forEach(([k, v]) => str = str.replaceAll(`{{${k}}}`, v));
    return str;
  }

  static addScript(item) {
    const li = this.liTemplate.cloneNode(true);
    li.id = `_${item.name}`;
    li.classList.add(item.js ? 'js' : 'css');
    item.enabled || li.classList.add('disabled');
    item.group?.[0] && li.classList.add('group');
    item.error && li.classList.add('error');
    li.textContent = item.name;
    li.title = item.name;
    this.docFrag.append(li);
    li.addEventListener('click', e => this.showScript(e));
  }

  static showScript(e) {
    // already on
    if (e.target.matches('.on')) { return; }

    if (this.unsavedChanges()) { return; }

    // hide settings
    this.settings.checked = false;

    // clear setCustomValidity
    CustomValidity.clear(this.customNodes);

    const {box} = this;
    const li = e.target;
    li.classList.add('on');

    // --- multi-select
    // Ctrl multi-select
    if (e.ctrlKey) { return; }
    // Shift multi-select
    else if (e.shiftKey) {
      if (!box.id) { return; }
      window.getSelection().removeAllRanges();
      let st = false, end = false;
      document.querySelectorAll('aside li').forEach(i => {
        const stEnd = i === li || i.id === box.id;
        if (!st && stEnd) { st = true; }
        else if (st && stEnd) { end = true; }
        !stEnd && i.classList.toggle('on', st && !end);
        // remove hidden items
        i.matches('.on') && window.getComputedStyle(i).display === 'none' && i.classList.remove('on');
      });
      return;
    }

    // --- reset others
    document.querySelectorAll('aside li.on').forEach(i => i !== li && i.classList.remove('on'));

    const id = li.id;
    box.id = id;
    box.dataset.updateURL = pref[id].updateURL;
    this.legend.textContent = pref[id].name;
    this.legend.className = li.matches('.js') ? 'js' : 'css';
    pref[id].enabled || this.legend.classList.add('disabled');

    // --- i18n
    const [lang, generic] = App.getLanguage();
    // fallback to primary language
    const i18nName = pref[id].i18n.name[lang] || pref[id].i18n.name[generic];
    // i18n if different
    if (i18nName !== pref[id].name) {
      const sp = document.createElement('span');
      sp.textContent = i18nName;
      this.legend.append(sp);
    }

    this.enable.checked = pref[id].enabled;
    this.autoUpdate.checked = pref[id].autoUpdate;

    Editor.set(pref[id].js || pref[id].css);

    // pref[id].error && App.notify(pref[id].error, id);
    pref[id].error && CustomValidity.set(this.saveButton, pref[id].error);
    this.userMeta.value = pref[id].userMeta || '';

    // this.storage.parentElement.style.display = pref[id].js ? 'list-item' : 'none';
    this.storage.value = Object.keys(pref[id].storage).length ? JSON.stringify(pref[id].storage, null, 2) : '';

    // --- userVar
    this.showUserVar(id);
  }

  static showUserVar(id) {
    // reset
    this.userVar.textContent = '';
    delete this.userVar.dataset.reset;
    const tmp = this.liTemplate.cloneNode();
    tmp.append(document.createElement('label'), document.createElement('input'));
    const sel = document.createElement('select');
    const output = document.createElement('output');

    Object.entries(pref[id].userVar).forEach(([key, val]) => {
      // user value
      if (!Object.hasOwn(val, 'user')) { return; }

      const li = tmp.cloneNode(true);
      const el = li.children;
      switch (val.type) {
        case 'text':
          el[0].textContent = val.label;
          el[1].dataset.id = key;
          el[1].type = val.type;
          el[1].value = val.user;
          el[1].dataset.default = val.value;
          break;

        case 'color':
          el[0].textContent = val.label;
          el[1].dataset.id = key;
          el[1].type = val.type;
          el[1].value = Color.get(val.user);
          el[1].dataset.default = val.value;
          break;

        case 'checkbox':
          el[0].textContent = val.label;
          el[1].dataset.id = key;
          el[1].type = val.type;
          el[1].checked = Boolean(val.user);
          el[1].dataset.default = val.value;
          break;

        case 'number':
          el[0].textContent = val.label;
          el[1].dataset.id = key;
          el[1].type = 'number';
          el[1].value = val.user;
          val.value[1] !== null && (el[1].min = val.value[1]);
          val.value[2] !== null && (el[1].max = val.value[2]);
          el[1].step = val.value[3];
          el[1].dataset.default = val.value[0];
          break;

        case 'range':
          li.append(output.cloneNode());
          li.classList.add('range');
          el[0].textContent = val.label;
          el[1].dataset.id = key;
          el[1].type = val.type;
          el[1].value = val.user;
          val.value[1] !== null && (el[1].min = val.value[1]);
          val.value[2] !== null && (el[1].max = val.value[2]);
          el[1].step = val.value[3];
          el[1].dataset.default = val.value[0];
          el[1].addEventListener('input',
            e => el[2].textContent = e.target.value + (val.value[4] || ''));
          el[2].textContent = val.user + (val.value[4] || '');
          break;

        case 'select':
        case 'dropdown':
        case 'image':
          el[1].remove();
          li.append(sel.cloneNode());
          el[0].textContent = val.label;
          el[1].dataset.id = key;
          // add option
          Array.isArray(val.value) ?
            val.value.forEach(item => el[1].append(new Option(item.replace(/\*$/, ''), item))) :
             Object.entries(val.value).forEach(([k, v]) => el[1].append(new Option(k.replace(/\*$/, ''), v)));
          el[1].value = val.user;

          el[1].dataset.default =
            Array.isArray(val.value) ? val.value.find(item => item.endsWith('*')) || val.value[0] :
              val.value[Object.keys(val.value).find(item => item.endsWith('*')) || Object.keys(val.value)[0]];
          break;
      }
      this.docFrag.append(li);
    });
    this.userVar.append(this.docFrag);
  }

  static resetUserVar() {
    if (!this.userVar.children[0]) { return; }

    this.userVar.dataset.default = 'true';
    this.userVar.querySelectorAll('input, select').forEach(i => {
      const val = i.type === 'checkbox' ? i.checked + '' : i.value;
      if (val !== i.dataset.default) {
        switch (i.type) {
          case 'checkbox':
            i.checked = i.dataset.default === '1';
            break;

          case 'range':
            i.value = i.dataset.default;
            i.dispatchEvent(new Event('input'));
            break;

          default:
            i.value = i.dataset.default;
        }
        i.parentElement.classList.add('default');
      }
    });
  }

  static unsavedChanges() {
    // disregard white space changes
    const noSpace = str => str.replace(/[\s\u200b-\u200d\ufeff]+/g, '');

    const text = noSpace(Editor.get());
    if (!text) { return; }

    const id = this.box.id;
    const type = this.legend.matches('.js') ? 'js' : 'css';
    let target = id ? pref[id][type] : pref.template[type] || this.template[type];
    target = noSpace(target);

    switch (true) {
      // new script
      case !id && text === target:
      // existing script
      case id && text === target && noSpace(this.userMeta.value) === noSpace(pref[id].userMeta):
        return false;

      default:
        return !confirm(browser.i18n.getMessage('discardConfirm'));
    }
  }

  static toggleEnable() {
    const enabled = this.enable.checked;

    const multi = document.querySelectorAll('aside li.on');
    if (!multi[0]) { return; }

    this.box.id && this.legend.classList.toggle('disabled', !enabled);

    const obj = {};
    multi.forEach(i => {
      pref[i.id].enabled = enabled;
      i.classList.toggle('disabled', !enabled);
      obj[i.id] = pref[i.id];

      // --- process @group
      const gIds = Group.set(pref, i.id);
      gIds.forEach(g => obj[g] = pref[g]);
    });

    // update saved pref
    browser.storage.local.set(obj);

    // update scripts message to background.js
    browser.runtime.sendMessage({update: 'script', pref, ids: Object.keys(obj)});
  }

  static toggleAutoUpdate() {
    const id = this.box.id;
    if (!id) { return; }

    if (pref[id].updateURL && pref[id].version) {
      pref[id].autoUpdate = this.autoUpdate.checked;
    }
    else {
      this.autoUpdate.checked = false;
      CustomValidity.set(this.autoUpdate, browser.i18n.getMessage('updateUrlError'));
      return;
    }

    // update saved pref
    browser.storage.local.set({[id]: pref[id]});
  }

  static deleteScript() {
    const {box} = this;
    const multi = document.querySelectorAll('aside li.on');
    if (!multi[0]) { return; }

    if (multi.length > 1 ?
      !confirm(browser.i18n.getMessage('deleteMultiConfirm', multi.length)) :
      !confirm(browser.i18n.getMessage('deleteConfirm', box.id.substring(1)))) {
      return;
    }

    const deleted = [];
    multi.forEach(i => {
      const id = i.id;
      // remove from menu list
      i.remove();
      delete pref[id];
      deleted.push(id);
      App.log(id.substring(1), 'Deleted');
    });
    // delete script
    browser.storage.local.remove(deleted);

    // update scripts message to background.js
    browser.runtime.sendMessage({update: 'script', pref, ids: deleted});

    // --- reset box
    Editor.set();
    box.id = '';
    this.enable.checked = false;
    this.autoUpdate.checked = false;
    this.legend.className = 'js';
    this.legend.textContent = browser.i18n.getMessage('scripts');
  }

  static async saveScript() {
    const {box} = this;

    // --- Trim Trailing Spaces
    const regex = /[ ]+(?=\r?\n)/g;
    this.userMeta.value = this.userMeta.value.trim().replace(regex, '');

    Editor.editor.trigger('keyboard', 'editor.action.trimTrailingWhitespace', null);
    const value = Editor.get().trim();
    if (!value) { return; }

    // --- check metadata
    const data = Meta.get(value, pref);
    if (!data) {
      CustomValidity.set(this.saveButton, browser.i18n.getMessage('metaError'));
      return;
    }

    // --- check if patterns are valid match pattern
    const error = [];
    [...data.matches, ...data.excludeMatches].forEach(i => {
      const e = Pattern.hasError(i);
      e && error.push(`${i} ➜ ${e}`);
    });

    if (error[0]) {
      CustomValidity.set(this.saveButton, error.join('\n'));
      return;
    }

    // --- check name
    if (!data.name) {
      CustomValidity.set(this.saveButton, browser.i18n.getMessage('noNameError'));
      return;
    }

    // --- check matches
    if (!data.matches[0] && !data.includes[0] && !data.includeGlobs[0]) {
      // allow no matches but disable
      data.enabled = false;
    }
    // set id as _name
    const id = `_${data.name}`;

    // --- new script
    if (!box.id) {
      // check if name exists
      if (pref[id] && !confirm(browser.i18n.getMessage('nameError'))) { return; }

      this.addScript(data);
      const index = [...this.navUL.children].findIndex(i => Intl.Collator().compare(i.id, id) > 0);
      index !== -1 ? this.navUL.insertBefore(this.docFrag, this.navUL.children[index]) :
        this.navUL.append(this.docFrag);
      this.navUL.children[index !== -1 ? index : 0].classList.add('on');
    }
    else {
      // --- check name change
      if (id !== box.id) {
        // check if name exists
        if (pref[id] && !confirm(browser.i18n.getMessage('nameError'))) { return; }

        // copy to new id
        pref[id] = pref[box.id];
        // delete old id
        delete pref[box.id];
        // remove old data
        browser.storage.local.remove(box.id);

        // update script message to background.js
        browser.runtime.sendMessage({update: 'script', pref, ids: [box.id]});
      }

      // --- copy storage to data
      data.storage = pref[id].storage;

      // --- check for Web Install, set install URL
      if (!data.updateURL && pref[id].updateURL) {
        data.updateURL = pref[id].updateURL;
        data.autoUpdate = true;
      }

      // --- update menu list
      const li = document.querySelector('aside li.on');
      // reset error
      li.classList.remove('error');
      li.textContent = data.name;
      li.id = id;
    }

    // --- check storage, JS only
    if (data.js) {
      if (!this.storage.value.trim()) {
        // clear storage
        data.storage = {};
      }
      else {
        let storage;
        try {
          storage = JSON.parse(this.storage.value);
        }
        catch (e) {
          this.settings.checked = true;
          CustomValidity.set(this.storage, e);
          return;
        }

        // must be an Object, not an array
        if (Array.isArray(storage)) {
          this.settings.checked = true;
          CustomValidity.set(this.storage, 'Storage must be an Object');
          return;
        }
        data.storage = storage;
      }
    }

    // --- update box & legend
    box.id = id;
    this.legend.textContent = data.name;
    // save to pref
    pref[id] = data;
    // update saved pref
    browser.storage.local.set({[id]: pref[id]});

    // update scripts
    browser.runtime.sendMessage({update: 'script', pref, ids: [id]});

    // --- userVar
    this.showUserVar(id);

    // --- progress bar
    ProgressBar.show();
  }

  static checkStorage() {

  }

  // --- Remote Update
  // manual update, also for disabled and disabled autoUpdate
  static async updateScript() {
    const {box} = this;
    if (!box.id) { return; }

    const id = box.id;

    if (!pref[id].updateURL || !pref[id].version) {
      CustomValidity.set(this.updateButton, browser.i18n.getMessage('updateUrlError'));
      return;
    }

    // to RemoteUpdate in remote-update.js, returns text or undefined
    const text = await RemoteUpdate.get(pref[id]);
    text && this.processResponse(text, pref[id].name, pref[id].updateURL);
  }

  static processResponse(text, name, updateURL) {
    const data = Meta.get(text, pref);
    if (!data) {
      App.notify(`${name}: Update Meta Data error`);
      return;
    }

    // set id as _name
    const id = `_${data.name}`;
    const oldId = `_${name}`;

    // --- check version (version is checked in getMeta for when metaURL is set)
    // if (!App.higherVersion(data.version, pref[id].version)) {
    //   // App.notify(browser.i18n.getMessage('noNewUpdate'), name);
    //   CustomValidity.set(this.updateButton, browser.i18n.getMessage('noNewUpdate'));
    //   return;
    // }

    // --- check name change
    if (data.name !== name) {
      // name has changed & name already exists
      if (pref[id]) {
        App.notify(`${name}: Update new name already exists`);
        return;
      }

      // copy to new id
      pref[id] = pref[oldId];
      // delete old id
      delete pref[oldId];
      // remove old data
      browser.storage.local.remove(oldId);

      // update scripts message to background.js
      browser.runtime.sendMessage({update: 'script', pref, ids: [oldId]});
    }

    // --- log message to display in Options -> Log
    App.log(data.name,
      `Updated version ${pref[id].version} ➜ ${data.version}`, '', updateURL);

    // --- diff viewer
    const diff = {
      name: data.name,
      oldValue: pref[id].js || pref[id].css,
      newValue: data.js || data.css,
      oldVersion: pref[id].version,
      newVersion: data.version,
      language: data.js ? 'js' : 'css',
    };
    browser.storage.session.set({diff})
    .then(() => browser.tabs.create({url: '/content/diff.html'}));
    App.notify(browser.i18n.getMessage('scriptUpdated', data.version), name);

    // save to pref
    pref[id] = data;

    // update saved pref
    browser.storage.local.set({[id]: pref[id]});

    // update scripts message to background.js
    browser.runtime.sendMessage({update: 'script', pref, ids: [id]});

    // clear box to avoid unsavedChanges warning
    Editor.set();

    // update page display
    this.process();
  }

  static uploadScript() {
    const {box} = this;
    if (!box.id) { return; }

    const id = box.id;

    if (!pref[id].uploadURL) {
      CustomValidity.set(this.uploadButton, browser.i18n.getMessage('uploadUrlError'));
      return;
    }

    fetch(pref[id].uploadURL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/javascript',
      },
      body: pref[id].js || pref[id].css,
    })
    .then(() => App.notify(browser.i18n.getMessage('uploadSuccess')))
    .catch(e => alert(`fetch: ${e}`));
  }

  // ---------- import script ------------------------------
  static processFileSelect(e) {
    // --- check for Stylus import
    if (e.target.files[0].type === 'application/json') {
      this.processFileSelectStylus(e);
      return;
    }

    this.fileLength = e.target.files.length;
    this.obj = {};

    [...e.target.files].forEach(file => {
      switch (true) {
        // check file MIME type CSS/JS
        case !['text/css', 'application/x-javascript'].includes(file.type):
          App.notify(browser.i18n.getMessage('fileTypeError'));
          return;
      }

      FS.readFile(file)
      .then(this.readDataScript)
      .catch(alert);
    });
  }

  static readDataScript(text) {
    // --- check meta data
    const data = Meta.get(text, pref);
    // data.error ?
    if (!data || data.error) {
      App.notify(browser.i18n.getMessage('metaError'));
      return;
    }

    // set id as _name
    let id = `_${data.name}`;

    // --- check name
    if (pref[id]) {
      const dataType = data.js ? 'js' : 'css';
      const targetType = pref[id].js ? 'js' : 'css';
      // same name exist in another type
      if (dataType !== targetType) {
        data.name += ` (${dataType})`;
        id = `_${data.name}`;
        // name already exists
        if (pref[id]) {
          App.notify(`${data.name}: Update new name already exists`);
          return;
        }
      }
    }

    // --- log message to display in Options -> Log
    const message = pref[id] ?
      `Updated version ${pref[id].version} ➜ ${data.version}` :
      `Installed version ${data.version}`;
    App.log(data.name, message, '', data.updateURL);

    // save to pref
    pref[id] = data;
    this.obj[id] = pref[id];

    // --- update storage after all files are processed
    // one less file to process
    this.fileLength--;
    // not 0 yet
    if (this.fileLength) { return; }

    // update page display
    this.process();
    // update saved pref
    browser.storage.local.set(this.obj);

    // update scripts message to background.js
    browser.runtime.sendMessage({update: 'script', pref, ids: [id]});
  }
  // ---------- /import script -----------------------------

  // ---------- import stylus ------------------------------
  // updated with export from Stylus 2.3.14
  static processFileSelectStylus(e) {
    const file = e.target.files[0];
    FS.readFile(file)
    .then(this.prepareStylus)
    .catch(alert);
  }

  static prepareStylus(data) {
    let importData;
    try { importData = JSON.parse(data); }
    catch (e) {
      alert(e);
      return;
    }

    const obj = {};
    importData.forEach(i => {
      // --- test validity
      if (!i.name || !i.sourceCode) {
        alert(browser.i18n.getMessage('error'));
        return;
      }

      const data = Meta.get(i.sourceCode, pref);
      // new Stylus "updateUrl": null, | old Stylus "updateUrl": "",
      data.updateUrl = i.updateUrl || '';
      data.enabled = i.enabled;

      // update user var
      Object.entries(i.usercssData.vars).forEach(([key, val]) => {
        // null or user has set a value
        val.value && data.userVar[key] && (data.userVar[key].user = val.value);
      });

      if (pref[`_${data.name}`]) { data.name += ' (Stylus)'; }

      const id = `_${data.name}`;
      pref[id] = data;
      obj[id] = pref[id];
    });

    // update saved pref
    browser.storage.local.set(obj);

    // update scripts message to background.js
    browser.runtime.sendMessage({update: 'script', pref, ids: Object.keys(obj)});

    // update page display
    this.process();
  }
  // ---------- /import stylus -----------------------------

  // ---------- export -------------------------------------
  static exportScript(e) {
    const multi = e.ctrlKey ? App.getIds(pref) :
      [...document.querySelectorAll('aside li.on')].map(i => i.id);
    if (!multi[0]) { return; }

    // disable multi on Android
    if (App.android && multi.length > 1) { return; }

    // single vs multiple script export
    const savAs = multi.length === 1;
    const folder = savAs ? '' : 'FireMonkey_' + new Date().toISOString().substring(0, 10) + '/';

    multi.forEach(id => {
      const ext = pref[id].js ? '.js' : '.css';
      const data = pref[id].js || pref[id].css;
      this.export(data, ext, pref[id].name, folder, savAs);
    });
}

  static export(data, ext, name, folder = '', saveAs = true) {
    navigator.userAgent.includes('Windows') && (data = data.replace(/\r?\n/g, '\r\n'));
    // removing disallowed characters
    const filename = folder + name.replace(/[<>:"/\\|?*]/g, '') + '.user' + ext;
    FS.writeFile({data, filename, saveAs});
  }
}
// ---------- /scripts -------------------------------------

// ---------- import/export preferences --------------------
document.getElementById('export').addEventListener('click', () => FS.export(pref));
document.getElementById('file').addEventListener('change', e => {
  FS.import(e).then(data => {
    if (!data) { return; }

    // set options after the pref update, update page display
    Object.assign(pref, data);
    Options.process();
    Script.process();
  });
});
// ---------- /import/export preferences -------------------

// ---------- navigation -----------------------------------
Nav.get();