// ---------- monaco environment (side effect) -------------
globalThis.MonacoEnvironment = {
  getWorkerUrl: function (moduleId, label) {
    if (label === 'json') {
      return '/lib/monaco-editor/vs/language/json/json.worker.js';
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return '/lib/monaco-editor/vs/language/css/css.worker.js';
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return '/lib/monaco-editor/vs/language/html/html.worker.js';
    }
    if (label === 'typescript' || label === 'javascript') {
      return '/lib/monaco-editor/vs/language/typescript/ts.worker.js';
    }
    return '/lib/monaco-editor/vs/editor/editor.worker.js';
  }
};