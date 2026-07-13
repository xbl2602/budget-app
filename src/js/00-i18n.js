/* ============================================================
   GLOBAL TRANSLATION ENGINE — i18n
   ============================================================ */
(function() {
'use strict';

const I18N_DICT = {};
const DEFAULT_LOCALE = 'zh';
let currentLocale = DEFAULT_LOCALE;

/**
 * Register translation entries into the dictionary.
 * @param {Object} entries - e.g. { 'key': { zh: '中文', en: 'English' } }
 */
function addI18nEntries(entries) {
  if (!entries || typeof entries !== 'object') return;
  Object.keys(entries).forEach(function(key) {
    if (entries[key] && typeof entries[key] === 'object') {
      if (!I18N_DICT[key]) I18N_DICT[key] = {};
      var locales = entries[key];
      Object.keys(locales).forEach(function(locale) {
        if (locale === 'zh' || locale === 'en') {
          I18N_DICT[key][locale] = String(locales[locale]);
        }
      });
    }
  });
}

/**
 * Translate a key into the current locale.
 * Supports {0}, {1}, ... parameter interpolation.
 * Returns '??key??' if the key is not found.
 * @param {string} key
 * @param {...*} args
 * @returns {string}
 */
function __(key) {
  var entry = I18N_DICT[key];
  var translation;

  if (entry && entry[currentLocale] !== undefined) {
    translation = entry[currentLocale];
  } else if (entry && entry[DEFAULT_LOCALE] !== undefined) {
    // Fallback to default locale
    translation = entry[DEFAULT_LOCALE];
  } else {
    return '??' + key + '??';
  }

  // Parameter interpolation
  var args = Array.prototype.slice.call(arguments, 1);
  if (args.length > 0) {
    translation = String(translation).replace(/\{(\d+)\}/g, function(match, index) {
      var idx = parseInt(index, 10);
      return idx < args.length ? String(args[idx]) : match;
    });
  }

  return translation;
}

/**
 * Set the locale and reload the page.
 * @param {string} locale - 'zh' or 'en'
 */
function setLocale(locale) {
  if (locale !== 'zh' && locale !== 'en') {
    console.warn('[i18n] Invalid locale:', locale, '— must be "zh" or "en"');
    return;
  }
  try {
    localStorage.setItem('budgetAppLocale', locale);
  } catch (e) {
    console.warn('[i18n] Could not write to localStorage:', e);
  }
  location.reload();
}

/**
 * Return the current active locale.
 * @returns {string} 'zh' or 'en'
 */
function getCurrentLocale() {
  return currentLocale;
}

/**
 * Apply translations to all [data-i18n] elements in the DOM.
 * Also sets <html lang="zh-CN"|"en"> and translates <title> if it has data-i18n.
 */
function applyI18nToDOM() {
  // Set html lang
  var htmlEl = document.documentElement;
  if (htmlEl) {
    htmlEl.setAttribute('lang', currentLocale === 'zh' ? 'zh-CN' : 'en');
  }

  // Translate all [data-i18n] elements
  var elements = document.querySelectorAll('[data-i18n]');
  Array.prototype.forEach.call(elements, function(el) {
    var key = el.getAttribute('data-i18n');
    if (!key) return;

    // Gather any data-i18n-arg-{n} attributes for interpolation
    var args = [];
    var argIndex = 0;
    while (true) {
      var argVal = el.getAttribute('data-i18n-arg-' + argIndex);
      if (argVal === null) break;
      args.push(argVal);
      argIndex++;
    }

    var translation = __.apply(null, [key].concat(args));
    el.textContent = translation;
  });

  // Translate <title> if it has data-i18n
  var titleEl = document.querySelector('title[data-i18n]');
  if (titleEl) {
    var key = titleEl.getAttribute('data-i18n');
    var titleArgs = [];
    var argIndex = 0;
    while (true) {
      var argVal = titleEl.getAttribute('data-i18n-arg-' + argIndex);
      if (argVal === null) break;
      titleArgs.push(argVal);
      argIndex++;
    }
    titleEl.textContent = __.apply(null, [key].concat(titleArgs));
  }

  // Handle data-i18n-title (for title attribute translation)
  document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-title');
    el.setAttribute('title', __(key));
  });
}

// === DEFAULT TRANSLATIONS ===
addI18nEntries({
  'app.name': { zh: '记账软件', en: 'Budget Tracker' },
  'nav.overview': { zh: '总览', en: 'Overview' },
  'nav.add': { zh: '记账', en: 'Add Record' },
  'nav.records': { zh: '流水', en: 'Records' },
  'nav.categories': { zh: '分类', en: 'Categories' },
  'nav.stats': { zh: '统计', en: 'Statistics' },
  'nav.report': { zh: '报告', en: 'Reports' },
  'nav.whatif': { zh: '假设分析', en: 'What-If Analysis' },
  'nav.settings': { zh: '设置', en: 'Settings' },
  'btn.guide': { zh: '页面引导', en: 'Page Guide' }
});

// === EXPORTS ===
window.__ = __;
window.setLocale = setLocale;
window.getCurrentLocale = getCurrentLocale;
window.addI18nEntries = addI18nEntries;
window.applyI18nToDOM = applyI18nToDOM;

// === INITIALIZATION ===
(function init() {
  try {
    var saved = localStorage.getItem('budgetAppLocale');
    if (saved === 'en' || saved === 'zh') {
      currentLocale = saved;
    }
  } catch (e) {
    // localStorage unavailable — stick with default
  }
})();

})();
