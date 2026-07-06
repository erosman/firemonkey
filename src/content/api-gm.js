/* eslint-disable no-global-assign, no-console */
/* global API */

// FM2.53 map to window object as a temporary workaround, not necessary in MV3
// https://bugzilla.mozilla.org/show_bug.cgi?id=1715249
fetch = window.fetch.bind(window);
XMLHttpRequest = window.XMLHttpRequest;

// Trusted Types (Firefox 148) Tinyfill
if (typeof trustedTypes === 'undefined') {
  trustedTypes = {createPolicy: (n, rules) => rules};
}

// ---------- GM API ---------------------------------------
// API is set in MV2 api.js in browser.userScripts.onBeforeScript
// initUserScript is set in userscript.js in preparation for MV3
// data is also available via MV2 api.js
globalThis.initUserScript = data => {
  GM.init(data, API);

  // run only once & remove from global scope
  delete globalThis.initUserScript;
  delete globalThis.API;
  delete GM.init;
};

class GM {

  static #script = {};

  // ---------- map GM functions ---------------------------
  static init(data, API) {
    // --- GM info: available without @grant
    this.info = data.info;
    globalThis.GM_info = this.info;

    // --- private script object
    const {name} = this.info.script;
    this.#script = {
      name,
      id: `_${name}`,
      connect: this.info.script.connects || [], // FM3.0
      injectInto: this.info.injectInto,
      onMessage: API.onMessage,
      resourceData: data.resourceData,
      resource: this.info.script.resources,
      sendMessage: e => API.sendMessage({...e, name: this.#script.name}),
      sourceURL: `\n\n//# sourceURL=${data.FMUrl}userscript/page/${encodeURI(name)}-`,
      storage: {},
      // {key: callback}
      valueChange: {},
      // registerMenuCommand script Command
      command: {},

      // cache regex in include/exclude
      matchLocation: true,
    };

    // --- support 'self' in @connect
    if (this.#script.connect.includes('self')) {
      this.#script.connect = this.#script.connect.filter(i => i !== 'self');
      this.#script.connect.push(location.hostname.replace(/^www\./, ''));
    }

    // getDirectory (FF111, Ch86) not reliable due to:
    // Support Bucket File System (OPFS) in Private Browsing Mode (PBM)
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1975760
    // this.info.isIncognito = await navigator.storage.getDirectory().then(() => false).catch(() => true);
    // isIncognito is not currently available in MV3 UserScripts API
    this.info.isIncognito = !!API.isIncognito;

    // --- process @grant
    // clone to maintain the original
    const grant = this.#resolveDependencies([...this.info.script.grant]);

    // directly mapped APIs
    const api = [
      'addElement',
      'addScript',
      'addStyle',
      'addValueChangeListener',
      'download',
      'fetch',
      'getResourceText',
      'log',
      'notification',
      'openInTab',
      'popup',
      'registerMenuCommand',
      'removeValueChangeListener',
      'setClipboard',
      'unregisterMenuCommand',
    ];

    api.forEach(i => {
      grant.includes(`GM_${i}`) && (globalThis[`GM_${i}`] = this[i].bind(this));
      grant.includes(`GM.${i}`) || delete this[i];
    });

    // GM_ renamed APIs
    const GM_api = [
      'deleteValue',
      'deleteValues',
      'getValue',
      'getValues',
      'listValues',
      'setValue',
      'setValues',

      // http -> Http
      'xmlhttpRequest',
      'xmlHttpRequest',

      // URL -> Url
      'getResourceURL',
      'getResourceUrl',
    ];
    GM_api.forEach(i => {
      grant.includes(`GM_${i}`) ? globalThis[`GM_${i}`] = this[`GM_${i}`].bind(this) : delete this[`GM_${i}`];
      grant.includes(`GM.${i}`) || delete this[i];
    });

    // unsafeWindow implementation
    grant.includes('unsafeWindow') && (globalThis.unsafeWindow = window.wrappedJSObject);

    // synch/async GM cookie object
    grant.includes('GM_cookie') ? globalThis.GM_cookie = this.GM_cookie : delete this.GM_cookie;
    grant.includes('GM.cookie') || delete this.cookie;

    // add onMessage listener
    const needListener = ['GM_registerMenuCommand', 'GM.registerMenuCommand',
      'GM_addValueChangeListener', 'GM.addValueChangeListener'];

    needListener.some(i => grant.includes(i)) &&
      this.#script.onMessage(this.#onMessage.bind(this));

    // cache matchLocation
    this.#getMatchLocation();
  }

  static #resolveDependencies(grant) {
    // default DOM GM. (needed in userscript.js)
    const def = [
      'addElement',
      'addScript',
      'addStyle',
    ];
    grant.push(...def.map(i => `GM.${i}`));

    // direct dependencies
    const direct = [
      'addValueChangeListener',
      'download',
      'fetch',
      'getResourceText',
      'log',
      'notification',
      'openInTab',
      'popup',
      'registerMenuCommand',
      'removeValueChangeListener',
      'setClipboard',
      'unregisterMenuCommand',

      'cookie',
      'setValues',
      'deleteValues'
    ];

    const dep = {
      // indirect dependencies
      'GM.getValue': 'GM.getValues',
      'GM.setValue': 'GM.setValues',
      'GM.deleteValue': 'GM.deleteValues',

      'GM_deleteValue': 'GM.deleteValues',
      'GM_setValue': 'GM.setValues',
      'GM_xmlhttpRequest': 'GM.xmlHttpRequest',
      'GM_getResourceURL': 'GM.getResourceUrl',

      // direct dependencies
      ...Object.fromEntries(direct.map(i => [`GM_${i}`, `GM.${i}`])),
    };

    // add grant
    Object.entries(dep).forEach(([k, v]) => {
      grant.includes(k) && grant.push(v);
    });

    // remove duplicates
    return [...new Set(grant)];
  }

  static #getMatchLocation() {
    // ----- Regex include/exclude workaround
    const {matches, includes, excludes, includeGlobs} = this.info.script;
    if (!includes[0] && !excludes[0]) { return; }

    const isMatch = arr => arr.some(i => new RegExp(i, 'i').test(location.href));
    const prepareMatch = i => '^' +
      i.replace(/[.+?^$(){}|[\]\\]/g, '\\$&')
        .replace('*://', '^https?://')
        .replace('://*\\.', '://(.+\\.)?')
        .replaceAll('*', '.*') + '$';

    const prepareGlob = i =>
      i.replace(/[.+^$(){}|[\]\\]/g, '\\$&')
        .replaceAll('*', '.*')
        .replaceAll('?', '.');

    switch (true) {
      case excludes[0] && isMatch(excludes.map(i => i.slice(1, -1))):
      case includes[0] && !isMatch(includes) &&
            !isMatch(includeGlobs.map(i => prepareGlob(i))) &&
            !isMatch(matches.map(i => prepareMatch(i))):
        this.#script.matchLocation = false;
        break;
    }
  }
  // ---------- /map GM functions --------------------------

  // ---------- auxiliary functions ------------------------
  static async initScript(checkGrant) {
    // the rejected promise only rejects the async function when its awaited
    if (!this.#script.matchLocation) { await Promise.reject(); }

    if (!checkGrant) { return; }

    // check if sync get storage APIs are granted (last check)
    const {grant} = this.info.script;
    if (['GM_getValue', 'GM_getValues', 'GM_listValues'].some(i => grant.includes(i))) {
        this.#script.storage = await this.#script.sendMessage({
        api: 'getValues',
        data: null,
      });
    }

    // remove default APIs
    const addElement = ['GM_addElement', 'GM.addElement'].some(i => grant.includes(i));
    const addScript = ['GM_addScript', 'GM.addScript'].some(i => grant.includes(i));
    const addStyle = ['GM_addStyle', 'GM.addStyle'].some(i => grant.includes(i));
    !addScript && delete this.addScript;
    !addStyle && delete this.addStyle;
    !addScript && !addStyle && !addElement && delete this.addElement;

    // run only once
    delete this.initScript;
  }

  // --- log via background
  static #log(message, type = 'error') {
    this.#script.sendMessage({
      api: 'log',
      data: {message, type},
    });
  }

  static #checkURL(url) {
    // using try/catch to log the error
    try { url = new URL(url, location.href); }
    catch (e) {
      this.#log(`checkURL ${url} ➜ ${e}`);
      return;
    }

    // check protocol
    if (!['http:', 'https:', 'blob:'].includes(url.protocol)) {
      this.#log(`checkURL ${url} ➜ Unsupported Protocol ${url.protocol}`);
      return;
    }

    // check @connect
    if (this.#script.connect[0] &&
      !this.#script.connect.some(i => url.hostname === i || url.hostname.endsWith(`.${i}`))) {
      this.#log(`checkURL ${url} ➜ Disallowed by @connect`);
      return;
    }

    return url.href;
  }

  // from popup.js & api-message.js
  static #onMessage(e) {
    switch (true) {
      // --- addValueChangeListener from api-message.js
      // {id, changes: {key: {oldValue, newValue}}}
      case e.id === this.#script.id:
        Object.entries(e.changes).forEach(([k, v]) => {
          // (key, oldValue, newValue, remote)
          this.#script.valueChange[k] && this.#script.valueChange[k](k, v.oldValue, v.newValue, true);
        });
        break;

      // --- script Command registerMenuCommand
      // from popup.js to send command list
      case Object.hasOwn(e, 'listCommand'):
        const command = Object.keys(this.#script.command);
        // command[0] && this.#script.sendMessage({/* name: this.#script.name, */ command});
        command[0] && this.#script.sendMessage({command});
        break;

      // from popup.js to execute command
      case e.name === this.#script.name && Object.hasOwn(e, 'command'):
        this.#script.command[e.command]();
        break;
    }
  }

    // --- prepare request headers
  static #prepareInit(init) {
    Object.entries(init.headers || {}).forEach(([key, value]) => {
      // no empty value
      if (/Cookie|Host|Origin|Referer/i.test(key) && value) {
        // capitalise
        const name = key.charAt(0).toUpperCase() + key.substring(1).toLowerCase();
        // set a new FM header
        init.headers[`FM-${name}`] = value;
        // delete original header
        delete init.headers[key];
      }
    });

    // Error: Function object could not be cloned.
    Object.keys(init).forEach(i => typeof init[i] === 'function' && delete init[i]);
  }
  // ---------- /auxiliary functions -----------------------

  // ---------- GM default functions -----------------------
  static addScript(str) {
    this.addElement('script', {textContent: str});
  }

  static addStyle(str) {
    this.addElement('style', {textContent: str});
  }

  static addElement(a, b, c) {
    // (parent, tag, attr) | (tag, attr)
    if (!a || !b) { return; }

    let [parentElement, tagName, attributes] = c ? [a, b, c] : [, a, b];
    tagName = tagName.toLowerCase();
    const script = tagName === 'script';

    // set parentElement
    parentElement ||= ['link', 'meta'].includes(tagName) ? document.head :
      ['script', 'style'].includes(tagName) ? document.head || document.body || document.documentElement :
      document.body || document.documentElement;

    const elem = document.createElement(tagName);
    elem.dataset.src = `${this.#script.name}.user.js`;

    if (script) {
      // prepare text & tidy up
      let text = attributes.textContent || attributes.innerText || attributes.innerHTML;
      ['innerText', 'innerHTML'].forEach(i => delete attributes[i]);

      if (text) {
        this.#script.injectInto !== 'page' && (text += this.#script.sourceURL + Math.random().toString(36).substring(2) + '.js');
        // Trusted Types (Firefox 148)
        const p = trustedTypes.createPolicy('fm-policy', {createScript: s => s});
        attributes.textContent = p.createScript(text);
      }
    }

    Object.entries(attributes)?.forEach(([key, value]) =>
      ['textContent', 'innerText', 'innerHTML'].includes(key) ? elem[key] = value : elem.setAttribute(key, value));

    try {
      // append() returns undefined, appendChild() returns the node
      const el = script ? parentElement.append(elem) : parentElement.appendChild(elem);
      // userscript may track UUID in element's textContent
      script && el.remove();
      return el;
    }
    catch (e) {
      this.#log(`addElement ➜ ${tagName} ${e}`);
    }
  }
  // ---------- /GM default functions ----------------------

  // ---------- GM grant functions -------------------------

  // ---------- sync storage -------------------------------
  static GM_getValue(key, defaultValue) {
    if (typeof key !== 'string') { return; }

    return Object.hasOwn(this.#script.storage, key) ?
      this.#script.storage[key] : defaultValue;
  }

  static GM_getValues(obj) {
    // nullish | array | object
    if (obj && typeof obj !== 'object') { return; }

    // return the entire storage
    if (!obj) { return this.#script.storage; }

    if (Array.isArray(obj)) {
      // Object {a: undefined, b: undefined, ...}
      obj = Object.fromEntries(obj.map(i => [i]));
    }

    Object.keys(obj).forEach(i =>
      Object.hasOwn(this.#script.storage, i) && (obj[i] = this.#script.storage[i]));

    return obj;
  }

  static GM_setValue(key, value) {
    if (typeof key !== 'string') { return; }

    this.#script.storage[key] = value;
    this.setValues({key: value});
  }

  static GM_setValues(obj) {
    if (typeof obj !== 'object') { return; }

    this.#script.storage = {...this.#script.storage, ...obj};
    this.setValues(obj);
  }

  static GM_deleteValue(key) {
    if (typeof key !== 'string') { return; }

    delete this.#script.storage[key];
    this.deleteValues([key]);
  }

  static GM_deleteValues(keys) {
    if (!Array.isArray(keys)) { return; }

    keys.forEach(i => delete this.#script.storage[i]);
    this.deleteValues(keys);
  }

  static GM_listValues() {
    return Object.keys(this.#script.storage);
  }
  // ---------- /sync storage ------------------------------

  // ---------- async storage ------------------------------
  static async getValue(key, defaultValue) {
    if (typeof key !== 'string') { return; }

    const response = this.getValues({[key]: defaultValue});
    // return Object.values(response)[0];
    return response[key];
  }

  static async getValues(obj) {
    // nullish | array | object
    if (obj && typeof obj !== 'object') { return; }

    if (Array.isArray(obj)) {
      // Object {a: undefined, b: undefined, ...}
      obj = Object.fromEntries(obj.map(i => [i]));
    }

    return this.#script.sendMessage({
      api: 'getValues',
      data: obj,
    });
  }

  static setValue(key, value) {
    if (typeof key !== 'string') { return; }

    return this.setValues({[key]: value});
  }

  static async setValues(obj) {
    if (typeof obj !== 'object') { return; }

    return this.#script.sendMessage({
      api: 'setValues',
      data: obj,
    });
  }

  static async deleteValue(key) {
    if (typeof key !== 'string') { return; }

    return this.deleteValues([key]);
  }

  static async deleteValues(keys) {
    if (!Array.isArray(keys)) { return; }

    return this.#script.sendMessage({
      api: 'deleteValues',
      data: [keys],
    });
  }

  static async listValues() {
    return this.#script.sendMessage({
      api: 'listValues',
    });
  }

  // storage.onChanged not available here in MV3
  static addValueChangeListener(key, callback) {
    this.#script.sendMessage({
      api: 'addValueChangeListener',
    });
    // App.addListener();
    this.#script.valueChange[key] = callback;
    return key;
  }

  static removeValueChangeListener(key) {
    this.#script.sendMessage({
      api: 'removeValueChangeListener',
    });
    delete this.#script.valueChange[key];
  }
  // ---------- /storage ---------------------------------

  // ---------- script command registerMenuCommand -------
  static registerMenuCommand(text, onclick, accessKey) {
    this.#script.command[text] = onclick;
  }

  static unregisterMenuCommand(text) {
    delete this.#script.command[text];
  }
  // ---------- /script command registerMenuCommand ------

  // ---------- other background functions ---------------
  static async download(url, filename) {
    // --- check url
    url = this.#checkURL(url);
    if (!url) { return Promise.reject(); }

    return this.#script.sendMessage({
      api: 'download',
      data: {url, filename},
    });
  }

  static async notification(text, title, image, onclick) {
    // GM|TM|VM: (text, title, image, onclick)
    // TM|VM: {text, title, image, onclick}
    const txt = text?.text || text;
    if (typeof txt !== 'string' || !txt.trim()) { return; }
    return this.#script.sendMessage({
      api: 'notification',
      data: typeof text === 'string' ? {text, title, image, onclick} : text,
    });
  }

  // opt = open_in_background
  // GM opt: boolean
  // TM|VM opt: boolean OR object {active: true/false}
  static async openInTab(url, opt) {
    // convert to object
    opt = typeof opt === 'object' && opt !== null ? opt : {active: !opt};
    const obj = {
      url,
      active: Object.hasOwn(opt, 'active') ? opt.active : true,
    };
    // Error: Return value not accessible to the userScript
    // resolve -> tab object | reject -> undefined
    const tab = await this.#script.sendMessage({
      api: 'openInTab',
      data: obj,
    });
    // true/false
    return !!tab;
  }

  // As the API is only available to Secure Contexts, it cannot be used from
  // a content script running on http:-pages, only https:-pages.
  // See also: https://github.com/w3c/webextensions/issues/378
  static async setClipboard(data, type) {
    // VM type: string MIME type e.g. 'text/plain'
    // TM type: string e.g. 'text' or 'html'
    // TM type: object e.g. {type: 'text', mimetype: 'text/plain'}
    // defaults to 'text/plain'
    type = type?.mimetype || type?.type || type || 'text/plain';

    // fix short type
    if (type === 'text') { type = 'text/plain'; }
    else if (type === 'html') { type = 'text/html'; }

    return this.#script.sendMessage({
      api: 'setClipboard',
      data: {data, type},
    });
  }

  static async fetch(url, init = {}) {
    // check url
    url &&= this.#checkURL(url);
    if (!url) { return; }

    // exclude credentials in request, ignore credentials sent back in response (e.g. Set-Cookie header)
    init.anonymous && (init.credentials = 'omit');
    delete init.anonymous;

    this.#prepareInit(init);

    const response = await this.#script.sendMessage({
      api: 'fetch',
      data: {url, init},
    });

    if (!response) { return; }

    const blob = response.blob;
    const methods = {
      arrayBuffer: async () => await blob?.arrayBuffer(),
      blob: async () => blob,
      formData: async () => await blob?.formData(),
      json: async () => {
        try { return JSON.parse(await blob?.text()); }
        catch { return null; }
      },
      text: async () => await blob?.text(),
    };

    return {
      ...response,
      ...methods,
    };
  }

  // GM.xmlHttpRequest returns Promise
  static async xmlHttpRequest(init = {}) {
    // check url
    const url = init.url && this.#checkURL(init.url);
    if (!url) { return; }

    init.url = url;
    init.anonymous && (init.mozAnon = true);
    delete init.anonymous;

    this.#prepareInit(init);

    const response = await this.#script.sendMessage({
      api: 'xmlHttpRequest',
      data: init,
    });
    if (!response) { throw 'There was an error with the xmlHttpRequest request.'; }

    // convert text responseXML to XML DocumentFragment
    response.responseXML &&= document.createRange().createContextualFragment(response.responseXML);

    return response;
  }

  // GM_xmlhttpRequest returns callback
  static async GM_xmlhttpRequest(init = {}) {
    // clone init to maintain the original
    const response = await this.xmlHttpRequest({...init});

    // callback: onload | onerror | ontimeout | onabort
    const callback = response.callback;
    delete response.callback;
    init[callback](response);
  }

  // GM.cookie returns Promise
  static cookie = {
    async list(obj = {}) {
      if (typeof obj !== 'object') { return; }
      // Error: Permission denied to set cookie
      if (!/^https?:\/\//.test(location.href)) { return; }

      let response = await GM.#script.sendMessage({
        api: 'cookie.list',
        data: {
          url: location.href,
          ...(obj.domain && {domain: obj.domain}),
          ...(obj.firstPartyDomain && {firstPartyDomain: obj.firstPartyDomain}),
          ...(obj.name && {name: obj.name}),
          ...(obj.partitionKey && typeof obj.partitionKey === 'object' && {partitionKey: obj.partitionKey}),
          ...(obj.path && {path: obj.path}),
          ...(obj.secure && {secure: true}),
          ...(obj.session && {session: true}),
        },
      });
      // clean-up the returned objects, remove 'httpOnly: true' cookies
      response = structuredClone(response.filter(i => !i.httpOnly));
      // prevent storeId snooping
      response.forEach(i => delete i.storeId);
      return response;
    },

    async set(obj) {
      if (!obj || typeof obj !== 'object') { return; }
      if (!obj.name || !obj.value) { return; }
      // Error: Permission denied to set cookie
      if (!/^https?:\/\//.test(location.href)) { return; }

      let response = await GM.#script.sendMessage({
        api: 'cookie.set',
        data: {
          url: location.href,
          name: obj.name,
          value: obj.value,
          ...(obj.domain && {domain: obj.domain}),
          ...(obj.expirationDate && {expirationDate: obj.expirationDate}),
          ...(obj.firstPartyDomain && {firstPartyDomain: obj.firstPartyDomain}),
          ...(obj.httpOnly && {httpOnly: true}),
          ...(obj.partitionKey && typeof obj.partitionKey === 'object' && {partitionKey: obj.partitionKey}),
          ...(obj.path && {path: obj.path}),
          ...(obj.secure && {secure: true}),
        },
      });
      response = structuredClone(response);
      response && delete response.storeId;
      return response;
    },

    async delete(obj) {
      if (!obj || typeof obj !== 'object') { return; }
      if (!obj.name) { return; }
      // Error: Permission denied to set cookie
      if (!/^https?:\/\//.test(location.href)) { return; }

      // not returning cookie to prevent storeId snooping
      let response = await GM.#script.sendMessage({
        api: 'cookie.delete',
        data: {
          url: location.href,
          name: obj.name,
          ...(obj.firstPartyDomain && {firstPartyDomain: obj.firstPartyDomain}),
          ...(obj.partitionKey && typeof obj.partitionKey === 'object' && {partitionKey: obj.partitionKey}),
        },
      });
      response = structuredClone(response);
      response && delete response.storeId;
      return response;
    },
  };

  // GM_cookie returns callback
  static GM_cookie = {
    async list(obj, callback) {
      callback(await GM.cookie.list());
    },

    async set(obj, callback) {
      callback(await GM.cookie.set(obj));
    },

    async delete(obj, callback) {
      callback(await GM.cookie.delete(obj));
    },
  };
  // ---------- /other background functions ----------------

  // ---------- other functions ----------------------------
  static getResourceText(resourceName) {
    return this.#script.resourceData[resourceName] || '';
  }

  static getResourceUrl(resourceName) {
    return this.#script.resource[resourceName];
  }

  static GM_getResourceURL(resourceName) {
    return this.getResourceUrl(resourceName);
  }

  static log = console.log;
  // ---------- /other functions ---------------------------

  // ---------- popup --------------------------------------
  static popup() {
    // Custom tags must contain a hyphen (-), start with an ASCII character (a-z),
    // and be all lowercase for them to be valid.
    const host = document.createElement('gm-popup');
    // closed: inaccessible from the outside
    const shadow = host.attachShadow({mode: 'closed'});

    const style = document.createElement('style');
    style.textContent = this.#popupCSS;
    shadow.append(style);

    const dialog = document.createElement('dialog');
    shadow.append(dialog);

    // close button
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '✕';
    dialog.append(close);
    close.addEventListener('click', () => dialog.close());

    document.body.append(host);

    return dialog;
  }

  static #popupCSS = `
:host, *, ::before, ::after {
  box-sizing: border-box;
}

:host {
  color-scheme: light dark;

  --color: light-dark(#000, #fff);
  --bg: light-dark(#fff, #000);
  --border: light-dark(#ddd, #777);
}

.close {
  display: block;
  margin-left: auto;
  padding: 0.3em 0.5em;
  border-radius: 2em;
  border: 0;

  &:not(:hover) {
    background-color: transparent;
  }
}

:is(.panel-left, .panel-right, .panel-top, .panel-bottom) {
  margin: 0;
  position: fixed;
}

dialog {
  color: var(--color);
  background-color: var(--bg);
  padding: 0.5em;
  z-index: 100;
  border-color: var(--border);
  border-width: 0;
  animation: center 0.5s ease-in-out;

  &.panel-top {
    top: 0;
    left: 0;
    width: 100vw;
    border-bottom-width: 1px;
    animation-name: panel-top;
  }

  &.panel-bottom {
    bottom: 0;
    left: 0;
    width: 100vw;
    border-top-width: 1px;
    animation-name: panel-bottom;
  }

  &.panel-left {
    top: 0;
    left: 0;
    height: 100vh;
    border-right-width: 1px;
    animation-name: panel-left;
  }

  &.panel-right {
    top: 0;
    right: 0;
    left: unset;
    height: 100vh;
    border-left-width: 1px;
    animation-name: panel-right;
  }
}

@keyframes center {
    0% { transform: scaleY(0); }
  100% { transform: scaleY(1); }
}

@keyframes panel-top {
    0% { transform: translateY(-100%); }
  100% { transform: translateY(0); }
}

@keyframes panel-bottom {
    0% { transform: translateY(100%); }
  100% { transform: translateY(0); }
}

@keyframes panel-left {
    0% { transform: translateX(-100%); }
  100% { transform: translateX(0); }
}

@keyframes panel-right {
    0% { transform: translateX(100%); }
  100% { transform: translateX(0); }
}

`;
}