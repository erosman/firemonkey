/* eslint-disable @stylistic/no-multi-spaces, @stylistic/key-spacing  */
import {App} from './app.js';

// ---------- API message handler (side effect) ------------
class OnMessage {

  // ---------- API message --------------------------------
  static {
    // message from api.js
    browser.runtime.onMessage.addListener((...e) => this.process(...e));
  }

  static async getStorage(key) {
    // object {key: value}
    return (await browser.storage.local.get(key))[key];
  }

  static async process(message, sender) {
    const {api, name, data: e} = message;
    if (!api) { return; }

    const id = `_${name}`;
    const tabId = sender.tab.id;

    // only set if in container/incognito
    const storeId = sender.tab.cookieStoreId !== 'firefox-default' && sender.tab.cookieStoreId;
    const logError = (e) => App.log(name, `${message.api} ➜ ${e}`, 'error');
    let script;

    switch (api) {
      // ---------- internal use only (not GM API) ---------
      case 'log':
        return App.log(name, e.message, e.type, e.updateURL);

      // ---------- GM API ---------------------------------

      // ---------- storage --------------------------------
      case 'getValues':
        script = await this.getStorage(id);

        // return the entire storage
        if (!e) { return script.storage; }

        // e is an object of {key: defaultValue}
        Object.keys(e).forEach(i => Object.hasOwn(script.storage, i) && (e[i] = script.storage[i]));
        return e;

      case 'setValues':
        script = await this.getStorage(id);

        // sendMessage to addValueChangeListener
        this.sendMessage(id, tabId, script.storage, e);

        // e is an object of {key: value}
        Object.assign(script.storage, e);

        // Promise with no arguments OR reject with error message
        return browser.storage.local.set({[id]: script});

      case 'deleteValues':
        script = await this.getStorage(id);

        // sendMessage to addValueChangeListener, convert array to Object { a: null, b: null, c: null }
        this.sendMessage(id, tabId, script.storage, Object.fromEntries(e.map(i => [i, null])));

        // e is an array [keys]
        e.forEach(i => delete script.storage[i]);

        // Promise with no arguments OR reject with error message
        return browser.storage.local.set({[id]: script});

      case 'listValues':
        script = await this.getStorage(id);
        return Object.keys(script.storage);

      case 'addValueChangeListener':
        // add to valueChange cache
        this.valueChange[id] ||= [];
        this.valueChange[id].push(sender.tab.id);
        return;

      case 'removeValueChangeListener':
        // remove from valueChange cache
        if (this.valueChange[id]) {
          this.valueChange[id] = this.valueChange[id].filter(i => i !== tabId);
          // clean up empty arrays
          !this.valueChange[id][0] && delete this.valueChange[id];
        }
        return;
      // ---------- /storage -------------------------------

      case 'download':
        // Promise with id OR reject with error message
        return browser.downloads.download({
          url: e.url,
          filename: e.filename || null,
          // Firefox for Android raises an error if saveAs is set to true.
          ...(!App.android && {saveAs: true}),
          // conflictAction: 'uniquify', // default (not with saveAs)
          // Firefox 92 (Released 2021-09-07)
          cookieStoreId: sender.tab.cookieStoreId,
          incognito: sender.tab.incognito,
        })
        // filter cancellation logging
        .catch(e => e.message !== 'Download canceled by the user' && logError(e));

      case 'notification':
        // Promise with notification's ID
        return browser.notifications.create('', {
          type: 'basic',
          iconUrl: e.image || 'image/icon.svg',
          title: name,
          message: e.text,
        });

      case 'openInTab':
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1817806
        // Support `openerTabId` in `tabs.create()` on Android
        const createObj = {url: e.url, active: e.active, openerTabId: sender.tab.id};
        App.android && delete createObj.openerTabId;
        // Promise with tabs.Tab OR reject with error message
        return browser.tabs.create(createObj).catch(logError);

      case 'setClipboard':
        // Promise resolve with value undefined OR reject with error message
        const type = e.type;
        if (type === 'text/plain') {
          return navigator.clipboard.writeText(e.data).catch(logError);
        }

        // all other types
        const blob = new Blob([e.data], {type});
        const data = [new ClipboardItem({[type]: blob})];
        return navigator.clipboard.write(data).catch(logError);

      case 'cookie.list':
        return browser.cookies.getAll({
          url: e.url,
          firstPartyDomain: e.firstPartyDomain || null,
          ...(e.domain && {domain: e.domain}),
          ...(e.partitionKey && {partitionKey: e.partitionKey}),
          ...(storeId && {storeId}),
        });

      case 'cookie.set':
        return browser.cookies.set({
          url: e.url,
          name: e.name,
          value: JSON.stringify(e.value),
          firstPartyDomain: e.firstPartyDomain || '',
          ...(e.domain && {domain: e.domain}),
          ...(e.httpOnly && {httpOnly: true}),
          ...(e.partitionKey && {partitionKey: e.partitionKey}),
          ...(storeId && {storeId}),
        });

      case 'cookie.delete':
        return browser.cookies.remove({
          url: e.url,
          name: e.name,
          firstPartyDomain: e.firstPartyDomain || '',
          ...(e.partitionKey && {partitionKey: e.partitionKey}),
          ...(storeId && {storeId}),
        });

      case 'fetch':
        return this.fetch(e, storeId, name);

      case 'xmlHttpRequest':
        return this.xmlHttpRequest(e, storeId);
    }
  }

  // https://bugzilla.mozilla.org/show_bug.cgi?id=1670278
  // Enable extensions to send network requests (fetch) with a specific cookieStoreId (container tab context)
  // if privacy.firstparty.isolate = true
  // Error: First-Party Isolation is enabled, but the required 'firstPartyDomain' attribute was not set.
  static async addCookie(url, headers, storeId) {
    // add contextual cookies, only in container/incognito
    const cookies = await browser.cookies.getAll({
      url,
      storeId,
      firstPartyDomain: null,
    });
    const str = cookies?.map(i => `${i.name}=${i.value}`).join('; ');
    str && (headers['FM-Contextual-Cookie'] = str);
  }

  static async fetch(e, storeId, name) {
    // not anonymous AND in container/incognito
    if (e.init.credentials !== 'omit' && storeId) {
      e.init.credentials = 'omit';
      await this.addCookie(e.url, e.init.headers, storeId);
    }
    // clean up
    Object.keys(e.init.headers || {})[0] || delete e.init.headers;

    return fetch(e.url, e.init)
      .then(async response => {
        // --- build response object
        const obj = {headers: {}};
        response.headers.forEach((value, name) => obj.headers[name] = value);
        ['bodyUsed', 'ok', 'redirected', 'status', 'statusText', 'type', 'url'].forEach(i => obj[i] = response[i]);

        if (e.init.method === 'HEAD') { return obj; }

        obj.blob = await response.blob();
        return obj;
      })
      .catch(e => App.log(name, `fetch ${e.url} ➜ ${e}`, 'error'));
  }

  static async xmlHttpRequest(e, storeId) {
    // not anonymous AND in container/incognito
    if (!e.mozAnon && storeId) {
      e.mozAnon = true;
      await this.addCookie(e.url, e.headers, storeId);
    }
    // clean up
    Object.keys(e.headers || {})[0] || delete e.headers;

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest({mozAnon: e.mozAnon});
      // open(method, url, async, user, password)
      xhr.open(e.method || 'GET', e.url, true, e.user, e.password);
      e.overrideMimeType && xhr.overrideMimeType(e.overrideMimeType);
      xhr.responseType = e.responseType;
      e.timeout && (xhr.timeout = e.timeout);
      Object.hasOwn(e, 'withCredentials') && (xhr.withCredentials = e.withCredentials);
      e.headers && Object.keys(e.headers).forEach(i => xhr.setRequestHeader(i, e.headers[i]));
      xhr.send(e.data);

      xhr.onload =      () => resolve(this.makeResponse(xhr, 'onload'));
      xhr.onerror =     () => resolve(this.makeResponse(xhr, 'onerror'));
      xhr.ontimeout =   () => resolve(this.makeResponse(xhr, 'ontimeout'));
      xhr.onabort =     () => resolve(this.makeResponse(xhr, 'onabort'));
      xhr.onprogress =  () => {};
    });
  }

  static makeResponse(xhr, callback) {
    return {
      callback,
      readyState:       xhr.readyState,
      response:         xhr.response,
      responseHeaders:  xhr.getAllResponseHeaders(),
      // responseText is only available if responseType is '' or 'text'.
      responseText:     ['', 'text'].includes(xhr.responseType) ? xhr.responseText : null,
      responseType:     xhr.responseType,
      responseURL:      xhr.responseURL,
      // responseXML is only available if responseType is '' or 'document'.
      // cant pass XMLDocument ➜ Error: An unexpected apiScript error occurred
      responseXML:      ['', 'document'].includes(xhr.responseType) ? xhr.responseText : null,
      status:           xhr.status,
      statusText:       xhr.statusText,
      timeout:          xhr.timeout,
      withCredentials:  xhr.withCredentials,
      // finalUrl is clone of responseURL for GM|TM|VM compatibility
      finalUrl:         xhr.responseURL,
    };
  }
  // ---------- /API message -------------------------------

  // ---------- addValueChangeListener ---------------------
  // { [id]: [tabId] }
  static valueChange = {};

  static {
    // clean-up valueChange
    browser.tabs.onUpdated.removeListener((...e) => this.removeTabId(...e));
    browser.tabs.onRemoved.addListener((...e) => this.removeTabId(...e));
  }

  static removeTabId(tabId) {
    Object.keys(this.valueChange).forEach(i => {
      this.valueChange[i] = this.valueChange[i].filter(i => i !== tabId);
      // clean up empty arrays
      !this.valueChange[i][0] && delete this.valueChange[i];
    });
  }

  static sendMessage(id, tabId, oldObj, newObj) {
    // no listener for this script id
    if (!this.valueChange[id]) { return; }

    // {key: {oldValue, newValue}}
    const changes = {};
    Object.entries(newObj).forEach(([k, v]) => {
      changes[k] = {
        oldValue: oldObj[k],
        newValue: v,
      };
    });

    // not sending to the tab that made the change
    this.valueChange[id].filter(i => i !== tabId).forEach(i => {
        browser.tabs.sendMessage(i, {id, changes})
        .catch(() => {});
        // catch() to suppress error
    });
  }
  // ---------- /addValueChangeListener --------------------
}