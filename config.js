// ============================================================
// КОНФИГУРАЦИЯ — клиентский сайт (GitHub Pages)
// Вебхук НЕ хранится здесь — все запросы идут через прокси
// ============================================================

const B24_CONFIG = {
  // Cloudflare Worker прокси — скрывает вебхук от клиента
  PROXY_URL: 'https://green-tooth-89e0.chuckychug.workers.dev/',

  // Вебхук не используется на клиентском сайте
  WEBHOOK_URL: null,

  // Домен портала
  PORTAL_DOMAIN: 'https://b24-o39xce.bitrix24.ru',

  // OAuth токен — не используется на клиентском сайте
  AUTH_TOKEN: null,

  // Интервал polling сообщений в миллисекундах
  POLLING_INTERVAL: 5000,

  // Максимальный размер файла в байтах (10 МБ)
  MAX_FILE_SIZE: 10 * 1024 * 1024,

  // Разрешённые типы файлов
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

  // Коды пользовательских полей CRM
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
    '45': 'Стандарт',
    '47': 'Профессиональный',
    '49': 'Энтерпрайз',
  },

  SUB_TYPE_REVERSE_MAP: {
    'Стандарт':         '45',
    'Профессиональный': '47',
    'Энтерпрайз':       '49',
  },
};
