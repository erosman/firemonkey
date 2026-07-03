
import {monaco} from '/lib/monaco-editor/monaco.js';
import {Theme} from './editor-theme.js';
import './editor-env.js';
import './i18n.js';

// ---------- Diff Viewer (side effect) --------------------
class Diff {

  static {
    // from options.js -> updateScript()
    browser.storage.session.get('diff')
    .then(r => this.process(r.diff));
  }

  static process(data = {}) {
    const {name, oldValue, newValue, oldVersion, newVersion, language} = data;
    if (!oldValue || !newValue) { return; }

    // remove stored data or keep the last one ?
    // browser.storage.sync.remove('diff');

    const legend = document.querySelector('legend');
    legend.textContent = `${name} (${oldVersion} ➜ ${newVersion})`;
    legend.className = language;

    const box = document.querySelector('.editor');
    const lang = language === 'js' ? 'javascript' : 'css';

    const original = monaco.editor.createModel(oldValue, lang);
    const modified = monaco.editor.createModel(newValue, lang);

    Theme.set(monaco);

    const diffEditor = monaco.editor.createDiffEditor(box, {
      originalEditable: true,
      automaticLayout: true,
      readOnly: true,
      readOnlyMessage: {
        value: 'This diff view is read-only.',
        isTrusted: true,
      },
    });

    diffEditor.setModel({original, modified});
  }
}