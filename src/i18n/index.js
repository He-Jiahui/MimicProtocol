import zhCN from './zh-CN.js';
import { GEAR_PREFIX, RARITY } from '../sim/data.js';

export const LANGUAGE_KEY = 'mimicprotocol.language.v1';
export const LANGUAGES = { en: 'English', 'zh-CN': '简体中文' };

let language = 'en';

export function selectLanguage(preferred, browserLanguage) {
  if (Object.hasOwn(LANGUAGES, preferred)) return preferred;
  return /^zh(?:-|$)/i.test(browserLanguage || '') ? 'zh-CN' : 'en';
}

export function setLanguage(locale) {
  language = selectLanguage(locale);
  return language;
}

export function message(source, values) {
  return { source, values };
}

// Both control schemes describe the same event. The HUD chooses when displaying it,
// so a queued radio line also follows an input change.
export function controlHint(source, touch, values) {
  return { source, touch, values };
}

export function t(text, values) {
  const source = typeof text === 'object' && text !== null ? text.source : text;
  const args = typeof text === 'object' && text !== null ? text.values : values;
  if (typeof source !== 'string') return '';
  const localized = language === 'zh-CN' && Object.hasOwn(zhCN, source) ? zhCN[source] : source;
  return args ? localized.replace(/\{(\w+)\}/g, (token, key) => {
    if (!Object.hasOwn(args, key)) return token;
    const value = args[key];
    if (Array.isArray(value)) return value.map((entry) => t(entry)).join(' + ');
    return typeof value === 'object' && value !== null ? t(value) : String(value);
  }) : localized;
}

export function upper(text) {
  return t(text).toUpperCase();
}

// A sealed piece is named by its quality alone: slot and name stay hidden until Process.
export function itemName(item) {
  if (item.unid && item.kind === 'gear') return t('Sealed {quality} equipment', { quality: t(RARITY[item.rarity]?.name || 'Common') });
  if (language === 'en' || (item.kind !== 'gear' && item.kind !== 'pack')) return t(item.name);
  // Packs migrated from v1 backpacks keep their rolled name, so match any quality prefix.
  const prefix = item.starter ? 'Issue' : GEAR_PREFIX.find((p) => item.name?.startsWith(`${p} `));
  if (!prefix || !item.name?.startsWith(`${prefix} `)) return t(item.name);
  return t('{prefix} {item}', { prefix: t(prefix), item: t(item.name.slice(prefix.length + 1)) });
}
