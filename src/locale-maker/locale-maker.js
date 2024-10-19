// ---------- Locale Maker ---------------------------------
// Locale Maker requires "downloads" permission to save the generated locale in folders
// minimum version Firefox 93 (released 2021-10-05)

class LocaleMaker {

  static {
    // --- import/export
    document.getElementById('file').addEventListener('change', e => this.import(e));
    document.getElementById('export').addEventListener('click', () => this.export());
    document.getElementById('exportAll').addEventListener('click', () => this.exportAll());

    // --- select
    this.locales = {};
    this.select = document.querySelector('#locale');
    this.select.addEventListener('change', e => {
      if (!e.target.value) { return; }
      const lang = e.target.value;
      this.locales[lang] && this.setLocale(this.locales[lang]);
    });

    // --- main content
    this.content = document.querySelector('div.content')

    // --- help popup
    const details = document.querySelector('details');
    document.body.addEventListener('click', e =>
      !details.contains(e.explicitOriginalTarget) && (details.open = false)
    );

    this.process();
    this.getPaste();
  }

  static getPaste() {
    document.body.addEventListener('paste', e => {
      if (e.target.nodeName !== 'INPUT') { return; }

      const text = e.clipboardData.getData('text/plain');
      const lines = text.trim().split(/[\r\n]+/);
      if (!lines[0]) { return; }

      e.preventDefault();
      const idx = [...this.inputs].indexOf(e.target);
      this.inputs.forEach((item, index) => index >= idx && lines[0] && (item.value = lines.shift().trim()));
    });
  }

  static get(lang) {
    return fetch(`/_locales/${lang}/messages.json`)
    .then(response => response.json())
    .catch(() => {});                                       // suppress error
  }

  static async process() {
    // --- default locale
    this.defaultLocale = browser.runtime.getManifest().default_locale;
    if (!this.defaultLocale) {
      alert('"default_locale" is not set');
      return;
    }

    // --- get default locale first to display
    const data = await this.get(this.defaultLocale);
    if (!data) {
      alert('"default_locale" is not available');
      return;
    }

    this.locales[this.defaultLocale] = data;
    this.showDefault(data);

    // --- get other available locales
    [...this.select.options].forEach(item => {
      if (!item.value) { return; }

      const lang = item.value;
      if (lang === this.defaultLocale) {
        item.prepend('✅ ');
        return;
      }

      this.get(lang).then(data => {
        if (data) {
          item.prepend('✔ ');
          this.locales[lang] = data;
        }
      });
    });
  }

  static showDefault(data) {
    const docFrag = document.createDocumentFragment();
    const rowTemplate = document.querySelector('template').content;

    Object.entries(data).forEach(([key, value]) => {
      if (key === 'extensionName') {
        document.title += ' - ' + value.message;
        return;                                             // keep extension name
      }

      const row = rowTemplate.cloneNode(true);
      row.children[0].textContent = this.showSpecial(value.message);
      row.children[1].id = key;
      docFrag.appendChild(row);
    });
    this.content.appendChild(docFrag);

    // --- cache inputs
    this.inputs = document.querySelectorAll('.content input');
  }

  static setLocale(data) {
    this.inputs.forEach(item => item.value = data[item.id] ? this.showSpecial(data[item.id].message) : '');
  }

  static showSpecial(str) {
    return JSON.stringify(str).slice(1, -1);
  }

  // ---------- Import/Export ------------------------------
  static import(e) {
    const file = e.target.files[0];
    switch (true) {
      case !file:
        this.notify('There was an error with the operation.');
        return;

      case !['text/plain', 'application/json'].includes(file.type): // check file MIME type
        this.notify('Unsupported File Format.');
        return;
    }

    const reader  = new FileReader();
    reader.onloadend = () => {
      try { this.setLocale(JSON.parse(reader.result)); }    // Parse JSON
      catch(e) { alert(e.message ); }                       // display the error
    };
    reader.onerror = () => alert('There was an error with reading the file.');
    reader.readAsText(file);
  }

  static export() {
    const defaultLocale = this.locales[this.defaultLocale];
    if (!defaultLocale) { return; }

    let data = this.deepClone(defaultLocale);
    this.inputs.forEach(item => item.value && (data[item.id].message = JSON.parse(`"${item.value}"`))); // update from inputs
    const filename = this.select.value ? this.select.value + '/messages.json' : 'messages.json';
    data = JSON.stringify(data, null, 2);
    this.saveFile({data, filename});
  }

  static exportAll() {
    const defaultLocale = this.locales[this.defaultLocale];
    if (!defaultLocale) { return; }

    const locales = this.deepClone(this.locales);
    const defaultString = JSON.stringify(defaultLocale);
    const folder = !browser.downloads ? '' : 'locale-maker/';

    Object.entries(locales).forEach(([lang, langData]) => {
      let data = JSON.parse(defaultString);                 // deep clone
      Object.entries(langData).forEach(([key, value]) => key !== 'extensionName' && value && (data[key] = value));
      const filename = `${folder}${lang}/messages.json`;
      data = JSON.stringify(data, null, 2);
      this.saveFile({data, filename, saveAs: false});
    });
  }

  static saveFile({data, filename, saveAs = true, type = 'text/plain'}) {
    if (!browser.downloads) {
      const a = document.createElement('a');
      a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(data);
      a.setAttribute('download', filename);
      a.dispatchEvent(new MouseEvent('click'));
      return;
    }

    const blob = new Blob([data], {type});
    browser.downloads.download({
      url: URL.createObjectURL(blob),
      filename,
      saveAs,
      conflictAction: 'uniquify'
    })
    .catch(() => {});                                       // Suppress Error: Download canceled by the user
  }

  static deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
  // ---------- /Import/Export -----------------------------
}