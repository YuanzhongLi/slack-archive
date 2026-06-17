import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import ja from './locales/ja';

i18n.use(initReactI18next).init({
  resources: {
    ja: { translation: ja },
    en: { translation: en },
  },
  lng: (typeof localStorage !== 'undefined' ? localStorage.getItem('i18nextLng') : null) ?? 'ja',
  fallbackLng: 'ja',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
