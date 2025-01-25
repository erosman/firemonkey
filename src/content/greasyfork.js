// ---------- Greasy Fork ----------------------------------
// runs on greasyfork.org & sleazyfork.org
class GreasyFork {

  static {
    this.check();
  }

  static async check() {
    // get id from location
    const id = location.pathname.match(/\/scripts\/(\d+)/)?.[1];
    const hostname = location.hostname;

    const FM = {
      version: browser.runtime.getManifest().version,
    };

    if (id) {
      const result = await browser.storage.local.get();
      const item = Object.values(result).find(i =>
        i.updateURL?.startsWith(`https://update.${hostname}/scripts/${id}/`) || // new update URL format
        i.updateURL?.startsWith(`https://${hostname}/scripts/${id}-`)           // old update URL format
      );

      if (item?.js) {
        FM.installedScriptVersion = item.version;
      }
      else if (item?.css) {
        /==UserStyle==/i.test(item.css) ?
          FM.installedStyleVersion = item.version :
            FM.installedCSSVersion = item.version;
      }
    }

    // set window.external
    window.wrappedJSObject.external.FireMonkey = cloneInto(FM, window);
  }
}