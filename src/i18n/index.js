import zhCN from './zh-CN.js';
import { GEAR_PREFIX, SLOT_LABEL } from '../sim/data.js';

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

export function itemName(item, revealName = false) {
  if (item.unid && !revealName && SLOT_LABEL[item.slot]) return t('Unidentified {item}', { item: t(SLOT_LABEL[item.slot]) });
  if (language === 'en' || item.kind !== 'gear') return t(item.name);
  const prefix = item.starter ? 'Issue' : GEAR_PREFIX[item.rarity];
  if (!prefix || !item.name?.startsWith(`${prefix} `)) return t(item.name);
  return t('{prefix} {item}', { prefix: t(prefix), item: t(item.name.slice(prefix.length + 1)) });
}
