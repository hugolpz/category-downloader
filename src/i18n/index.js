import Banana from 'banana-i18n';
import { ref } from 'vue';

/**
 * Interface translations. Messages live in ./<code>.json (Banana format: `$1` parameters, `{{PLURAL:$1|one|other}}`),
 * `en.json` is the source, `qqq.json` documents each message for translators. To add a language: add its file and
 * one line to LANGUAGES. To translate: edit ./<code>.json on GitHub (the pencil icon beside the language selector).
 */

/** Languages offered in the selector: code, name in that language, and text direction. */
export const LANGUAGES = [
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
  { code: 'hi', name: 'हिन्दी', dir: 'ltr' },
  { code: 'id', name: 'Bahasa Indonesia', dir: 'ltr' },
  { code: 'pt', name: 'Português', dir: 'ltr' },
  { code: 'sw', name: 'Kiswahili', dir: 'ltr' },
  { code: 'uk', name: 'Українська', dir: 'ltr' },
  { code: 'zh', name: '中文', dir: 'ltr' },
];
export const DEFAULT_LOCALE = 'en';
export const STORAGE_KEY = 'selectedLocale';
/** Where translators contribute. */
export const TRANSLATE_URL = (code) => `https://github.com/hugolpz/category-downloader/edit/main/src/i18n/${code}.json`;

// Every message file, loaded up front (a few KB each). `@metadata` is not a message.
const files = import.meta.glob('./[a-z][a-z].json', { eager: true, import: 'default' });
const messages = Object.fromEntries(Object.entries(files).map(([path, m]) => [path.slice(2, 4), m]));

const isSupported = (code) => LANGUAGES.some((l) => l.code === code);
const banana = new Banana(DEFAULT_LOCALE, { messages, finalFallback: DEFAULT_LOCALE });

/** The current interface language (reactive: templates using `t` update when it changes). */
export const locale = ref(DEFAULT_LOCALE);

/** How many messages a language still lacks compared with English (0 = complete). */
export const missingCount = (code) =>
  Object.keys(messages[DEFAULT_LOCALE]).filter((k) => k !== '@metadata' && !(k in (messages[code] ?? {}))).length;

/** The translation of `key` in the current language, English if missing. `params` fill `$1`, `$2`… */
export function t(key, ...params) {
  void locale.value; // dependency for Vue
  return banana.i18n(key, ...params);
}

/** Choose the language: `?uselang=xx` in the address, else the saved choice, else English. */
export function detectLocale(search = globalThis.location?.search ?? '') {
  const fromUrl = new URLSearchParams(search).get('uselang');
  if (isSupported(fromUrl)) return fromUrl;
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (isSupported(saved)) return saved;
  } catch {
    /* storage can be blocked: fine */
  }
  return DEFAULT_LOCALE;
}

/** Switch language: messages, `<html lang dir>` and (when `save`) the saved choice. */
export function setLocale(code, { save = true } = {}) {
  if (!isSupported(code)) code = DEFAULT_LOCALE;
  banana.setLocale(code);
  locale.value = code;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code;
    document.documentElement.dir = LANGUAGES.find((l) => l.code === code).dir;
  }
  if (save) {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, code);
    } catch {
      /* best effort */
    }
  }
}

setLocale(detectLocale(), { save: false });
