// ---------- MV2 userScripts Privileged API ---------------
// MV3 userScripts context only defines runtime.sendMessage, runtime.connect
browser.userScripts.onBeforeScript.addListener(script => {
  // ----- MV2 browser API bridge
  const API = {
    // --- cloneInto wrapper for object methods
    cloneIntoBridge(obj, target, options = {}) {
      return cloneInto(options.cloneFunctions ? obj.wrappedJSObject : obj, target, options);
    },

    // --- prepare return value, check if it is primitive value
    prepare(value) {
      // used in fetch & xmlHttpRequest, cant be done in MV2 api-gm.js
      if (value &&
            (Object.hasOwn(value, 'headers') ||
              (Object.hasOwn(value, 'response') && typeof value.response !== 'string'))
      ) {
        return cloneInto(value, window);
      }

      return ['object', 'function'].includes(typeof value) && value !== null ? script.export(value) : value;
    },

    async sendMessage(e) {
      const response = await browser.runtime.sendMessage(e);
      // 'this' is sandbox (not API)
      return API.prepare(response);
    },

    onMessage(callback) {
      browser.runtime.onMessage.addListener(e => callback(script.export(e)));
    },

    // isIncognito is not currently available in MV3
    isIncognito: browser.extension.inIncognitoContext,
  };

  script.defineGlobals({
    API,
    // Firefox functions, available in MV3 USER_SCRIPT world
    cloneInto: API.cloneIntoBridge,
    createObjectIn,
    exportFunction,
  });
});