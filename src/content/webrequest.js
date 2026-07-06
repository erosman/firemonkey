// ---------- webRequest -----------------------------------
// https://github.com/w3c/webextensions/issues/786
// Proposal: Allow extension contexts to set forbidden headers in fetch() API
export class WebRequest {

  static FMUrl = browser.runtime.getURL('');

  static {
    browser.webRequest.onBeforeSendHeaders.addListener(e => this.onBeforeSendHeaders(e),
      {urls: ['<all_urls>'], types: ['xmlhttprequest']},
      ['blocking', 'requestHeaders']
    );
  }

  static init(pref) {
    browser.webRequest.onHeadersReceived.removeListener(this.onHeadersReceived);

    // only when urls are set by the user
    const urls = pref.cspExclude.split(/\s+/);
    if (!urls[0]) { return; }

    browser.webRequest.onHeadersReceived.addListener(this.onHeadersReceived,
      {urls, types: ['main_frame', 'sub_frame']},
      ['blocking', 'responseHeaders']
    );
  }

  static onBeforeSendHeaders(e) {
    // not from FireMonkey
    if (!e.originUrl?.startsWith(this.FMUrl)) { return; }

    const cookies = [];
    // userscript + contextual cookies
    e.requestHeaders = e.requestHeaders.filter(i => {
      i.name.startsWith('FM-') && (i.name = i.name.substring(3));
      if (!/^(Cookie|Contextual-Cookie)$/i.test(i.name)) { return true; }

      cookies.push(i.value);
    });

    // merge all Cookie headers
    cookies[0] && e.requestHeaders.push({name: 'Cookie', value: cookies.join('; ')});

    return {requestHeaders: e.requestHeaders};
  }

  static onHeadersReceived(e) {
    e.responseHeaders.forEach(i => {
      if (/content-security-policy/i.test(i.name)) {
        // enable js/css insertion
        i.value = i.value.replace(/(script|style)-src(-elem|-attr)? [^;]+/g, `$& 'unsafe-inline' *`)
                          .replace(/(font|img)-src [^;]+/g, '$& data: blob: *');
      }
    });

    return {responseHeaders: e.responseHeaders};
  }
}