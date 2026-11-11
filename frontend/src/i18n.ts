import en from './locales/en.json';

type Vars = Record<string, string | number>;
export type TranslationKey = keyof typeof en;

export function t(key: TranslationKey, vars: Vars = {}) {
  let value = en[key];
  for (const [name, replacement] of Object.entries(vars)) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}
