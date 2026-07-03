// ---------- navigation -----------------------------------
export class Nav {

  static {
    document.querySelectorAll('nav input[name="nav"]').forEach(i =>
      this[i.parentElement.dataset.i18n] = i);

    [this.prams] = [...new URLSearchParams(location.search).entries()];
  }

  static get(pram = this.prams?.[0]) {
    if (!pram) { return; }

    this[pram] ? this[pram].checked = true : this.process(pram);
  }

  static process(pram) {
    switch (pram) {
      case 'newJS':
      case 'newCSS':
        this.scripts.checked = true;
        document.querySelector(`button[data-i18n^="${pram}"]`)?.click();
        break;

      case 'script':
        // in case there is # in the name (URLSearchParams decodes prams)
        const id = '_' + this.prams[1] + decodeURI(location.hash);
        const li = document.getElementById(id);
        if (li) {
          this.scripts.checked = true;
          li.click();
          li.scrollIntoView();
        }
        break;
    }
  }

  // --- help
  static {
    const help = document.querySelector('iframe[src="help.html"]').contentDocument;

    // --- data-link
    const helpLink = help.querySelector('.nav-link');
    document.querySelectorAll('[data-link]').forEach(i => i.addEventListener('click', e => {
      const {link} = e.target.dataset;
      if (!link) { return; }

      Nav.get('help');
      helpLink.href = link;
      helpLink.click();
    }));
  }

  // --- sidebar
  static {
    if (location.search === '?sidebar') {
      document.body.classList.add('sidebar');
      this.scripts.checked = true;
    }
  }
}