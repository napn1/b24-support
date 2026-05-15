// ============================================================
// РљРћРќР¤РР“РЈР РђР¦РРЇ вЂ” РєР»РёРµРЅС‚СЃРєРёР№ СЃР°Р№С‚ (GitHub Pages)
// Р’РµР±С…СѓРє РќР• С…СЂР°РЅРёС‚СЃСЏ Р·РґРµСЃСЊ вЂ” РІСЃРµ Р·Р°РїСЂРѕСЃС‹ РёРґСѓС‚ С‡РµСЂРµР· РїСЂРѕРєСЃРё
// ============================================================

const B24_CONFIG = {
  // Cloudflare Worker РїСЂРѕРєСЃРё вЂ” СЃРєСЂС‹РІР°РµС‚ РІРµР±С…СѓРє РѕС‚ РєР»РёРµРЅС‚Р°
  PROXY_URL: 'https://green-tooth-89e0.chuckychug.workers.dev/',

  // Р’РµР±С…СѓРє РЅРµ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РЅР° РєР»РёРµРЅС‚СЃРєРѕРј СЃР°Р№С‚Рµ
  WEBHOOK_URL: null,

  // Р”РѕРјРµРЅ РїРѕСЂС‚Р°Р»Р°
  PORTAL_DOMAIN: 'https://b24-o39xce.bitrix24.ru',

  // OAuth С‚РѕРєРµРЅ вЂ” РЅРµ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РЅР° РєР»РёРµРЅС‚СЃРєРѕРј СЃР°Р№С‚Рµ
  AUTH_TOKEN: null,

  // РРЅС‚РµСЂРІР°Р» polling СЃРѕРѕР±С‰РµРЅРёР№ РІ РјРёР»Р»РёСЃРµРєСѓРЅРґР°С…
  POLLING_INTERVAL: 5000,

  // РњР°РєСЃРёРјР°Р»СЊРЅС‹Р№ СЂР°Р·РјРµСЂ С„Р°Р№Р»Р° РІ Р±Р°Р№С‚Р°С… (10 РњР‘)
  MAX_FILE_SIZE: 10 * 1024 * 1024,

  // Р Р°Р·СЂРµС€С‘РЅРЅС‹Рµ С‚РёРїС‹ С„Р°Р№Р»РѕРІ
  ALLOWED_FILE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],

  // РљРѕРґС‹ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРёС… РїРѕР»РµР№ CRM
  CRM_FIELDS: {
    COMPANY: {
      SPECIALIST:  'UF_CRM_1778533990',
      SUB_START:   'UF_CRM_1778533649906',
      SUB_END:     'UF_CRM_1778533665841',
      SUB_TYPE:    'UF_CRM_1778533804303',
      HOURS_TOTAL: 'UF_CRM_1778533869612',
      HOURS_USED:  'UF_CRM_1778533917701',
      SUB_STATUS:  'UF_CRM_1778534011792',
      CHAT_ID:     'UF_CRM_1778865481908',
    },
    CONTACT: {
      PASSWORD_HASH: 'UF_CRM_1778536160219',
    },
  },

  SUB_TYPE_MAP: {
    '45': 'РЎС‚Р°РЅРґР°СЂС‚',
    '47': 'РџСЂРѕС„РµСЃСЃРёРѕРЅР°Р»СЊРЅС‹Р№',
    '49': 'Р­РЅС‚РµСЂРїСЂР°Р№Р·',
  },

  SUB_TYPE_REVERSE_MAP: {
    'РЎС‚Р°РЅРґР°СЂС‚':         '45',
    'РџСЂРѕС„РµСЃСЃРёРѕРЅР°Р»СЊРЅС‹Р№': '47',
    'Р­РЅС‚РµСЂРїСЂР°Р№Р·':       '49',
  },
};
