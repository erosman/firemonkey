// ---------- monaco theme ---------------------------------
export class Theme {

  static set(monaco) {
    // --- theme: vs | vs-dark | hc-black
    monaco.editor.defineTheme('vs-dark-fm', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#101828',
      },
    });
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    monaco.editor.setTheme(dark.matches ? 'vs-dark-fm' : 'vs');
    dark.addEventListener('change', e =>
      monaco.editor.setTheme(e.matches ? 'vs-dark-fm' : 'vs')
    );
  }
}