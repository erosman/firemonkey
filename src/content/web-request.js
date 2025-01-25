// ---------- webRequest (Side Effect) ---------------------
class WebRequest {

  static FMUrl = browser.runtime.getURL('');

  static {
    browser.webRequest.onBeforeSendHeaders.addListener(e => this.onBeforeSendHeaders(e),
      {urls: ['<all_urls>'], types: ['xmlhttprequest']},
      ['blocking', 'requestHeaders']
    );
  }

  static onBeforeSendHeaders(e) {
    if (!e.originUrl?.startsWith(this.FMUrl)) { return; }   // not from FireMonkey

    const cookies = [];
    const idx = [];
    e.requestHeaders.forEach((i, index) => {                // userscript + contextual cookies
      if (i.name.startsWith('FM-')) {
        i.name = i.name.substring(3);
        if (['Cookie', 'Contextual-Cookie'].includes(i.name)) {
           i.value && cookies.push(i.value);
           idx.push(index);
        }
      }
      else if (i.name === 'Cookie') {                       // original Firefox cookie
        cookies.push(i.value);
        idx.push(index);
      }
    });

    idx[0] && (e.requestHeaders = e.requestHeaders.filter((item, index) => !idx.includes(index))); // remove entries
    cookies[0] && e.requestHeaders.push({name: 'Cookie', value: cookies.join('; ')}); // merge all Cookie headers

    return {requestHeaders: e.requestHeaders};
  }
}