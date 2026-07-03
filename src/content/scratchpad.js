import {App} from './app.js';

// ---------- scratchpad (side effect) ---------------------
class Scratchpad {

  static {
    this.js = document.querySelector('#js');
    this.css = document.querySelector('#css');
    this.origin = document.querySelector('#origin');

    // recall previous values
    this.js.value = localStorage.getItem('scratchpadJS') || '';
    this.css.value = localStorage.getItem('scratchpadCSS') || '';

    // remember entered values
    this.js.addEventListener('change', () => localStorage.setItem('scratchpadJS', this.js.value.trim()));
    this.css.addEventListener('change', () => localStorage.setItem('scratchpadCSS', this.css.value.trim()));

    document.querySelectorAll('.scratchpad button').forEach(i =>
      i.addEventListener('click', e => this.processButtons(e)));
  }

  static processButtons(e) {
    const id = e.target.dataset.i18n;
    switch (id) {
      case 'run':
        e.target.id === 'run-js' ? this.runJS() : this.runCSS();
        break;

      case 'undo':
        this.undo();
        break;
      }
  }

  static runJS() {
    const code = this.js.value.trim();
    if (!code) { return; }

    browser.tabs.executeScript({code})
    .catch(e => App.notify(`JavaScript: ${e}`));
  }

  static runCSS() {
    const code = this.css.value.trim();
    if (!code) { return; }

    browser.tabs.insertCSS({code, cssOrigin: this.origin.value})
    .catch(e => App.notify(`CSS: ${e}`));
  }

  static undo() {
    const code = this.css.value.trim();
    if (!code) { return; }

    browser.tabs.removeCSS({code, cssOrigin: this.origin.value})
    .catch(e => App.notify(`CSS: ${e}`));
  }
}