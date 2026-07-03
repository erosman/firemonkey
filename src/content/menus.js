// ---------- context menu (side effect) -------------------
class Menus {

  static {
    // menus is not supported on Android
    browser.menus && this.init();
  }

 static init() {
    // icons do not change in light/dark
    const contextMenus = [
      {id: 'options'},
      {id: 'scripts'},
      {id: 'newJS'},
      {id: 'newCSS'},
      {id: 'help'},
      {id: 'log'},
      // {id: 'localeMaker', icons: {16: '/locale-maker/locale-maker.svg'}, title: 'Locale Maker'},
    ];

    contextMenus.forEach(i => {
      if (i.id) {
        // always use the same ID for i18n
        i.title ||= browser.i18n.getMessage(i.id);
      }
      i.contexts = ['browser_action'];
      browser.menus.create(i);
    });

    // prepare for manifest v3
    browser.menus.onClicked.addListener(this.process);
  }

  static process(info, tab) {
    switch (info.menuItemId) {
      case 'options':
        browser.runtime.openOptionsPage();
        break;

      case 'newJS':
      case 'newCSS':
        browser.tabs.create({url: `/content/options.html?${info.menuItemId}&url=${tab.url}`});
        break;

      case 'scripts':
      case 'help':
      case 'log':
        browser.tabs.create({url: `/content/options.html?${info.menuItemId}`});
        break;

      // case 'localeMaker':
      //   browser.tabs.create({url: '/locale-maker/locale-maker.html'});
      //   break;
    }
  }
}