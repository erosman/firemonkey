// ---------- Locale Maker ---------------------------------
// Locale Maker with "downloads" permission can save the generated locale in folders
// minimum version Firefox 128 (released 2024-07-09)

class LocaleMaker {

  static {
    // --- select
    this.select = document.querySelector('select');
    this.select.addEventListener('change', e => this.showTarget(e));

    this.showSource();
  }

  static async showSource() {
    // --- source language: default locale
    const src = browser.runtime.getManifest().default_locale;
    if (!src) {
      alert('"default_locale" is not set');
      return;
    }

    // --- get default locale first to display
    const data = await this.get(src);
    if (!data) {
      alert('"default_locale" is not available');
      return;
    }

    const docFrag = document.createDocumentFragment();
    const template = document.querySelector('template').content;

    Object.entries(data).forEach(([key, value]) => {
      const row = template.cloneNode(true);
      const [label, input] = row.children;
      label.textContent = this.showSpecial(value.message);
      input.id = key;
      // keep extension name
      if (key === 'extensionName') {
        input.value = label.textContent;
        input.disabled = true;
      }
      docFrag.append(row);
    });

    // main content
    document.querySelector('main').append(docFrag);

    // cache inputs
    this.inputs = document.querySelectorAll('main input');
  }

  static async showTarget(e) {
    if (!e.target.value) { return; }

    const data = await this.get(e.target.value);
    if (!data) { return; }

    this.inputs.forEach(i =>
      data[i.id] && (i.value = this.showSpecial(data[i.id].message)));
  }

  static showSpecial(str = '') {
    return JSON.stringify(str).slice(1, -1);
  }

  static async get(lang) {
    return fetch(`/_locales/${lang}/messages.json`)
    .then(r => r.json())
    .catch(() => {});
    // suppress error
  }

  // ---------- import export ------------------------------
  static {
    document.getElementById('export').addEventListener('click', () => this.export());
    document.getElementById('file').addEventListener('change', e => {
      FS.import(e).then(data => data && this.showTarget(data));
    });
  }

  static export() {
    let data = {};
    this.inputs.forEach(i => i.value && (data[i.id] = {message: JSON.parse(`"${i.value}"`)}));
    data = JSON.stringify(data, null, 2);
    const filename = this.select.value ? this.select.value + '/messages.json' : 'messages.json';
    FS.writeFile({data, filename, saveAs: true, type: 'application/json'});
  }
}

// ---------- import export --------------------------------
class FS {

  static async import(e) {
    const file = e.target.files[0];
    switch (true) {
      case !file:
        this.notify('There was an error with the operation.');
        return;

      // check file MIME type
      case !['text/plain', 'application/json'].includes(file.type):
        this.notify('Unsupported File Format.');
        return;
    }

    const data = await this.readFile(e.target.files[0]);
    try { return JSON.parse(data); }
    catch (e) { alert(e); }
  }

  // --- read file
  static readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = e => reject(e);
      reader.readAsText(file);
    });
  }

  // ----- write file
  static writeFile({data, filename, saveAs, type = 'text/plain'}) {
    if (!browser.downloads) {
      const a = document.createElement('a');
      a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(data);
      a.setAttribute('download', filename);
      a.dispatchEvent(new MouseEvent('click'));
      return;
    }

    const android = navigator.userAgent.includes('Android');
    const blob = new Blob([data], {type});
    browser.downloads.download({
      url: URL.createObjectURL(blob),
      filename,
      // Firefox for Android raises an error if saveAs is set to true
      ...(!android && saveAs && {saveAs: true}),
    })
    .catch(() => {});
    // catch() to suppress error: Download canceled by the user
  }
}