// ============================================================
// КОНФИГУРАЦИЯ — заполнить перед деплоем на Bitrix24.Sites
// ============================================================

const B24_CONFIG = {
  // URL входящего вебхука (из Разработчикам → Входящие вебхуки)
  WEBHOOK_URL: 'https://b24-o39xce.bitrix24.ru/rest/1/652ceckhh8zdjel2/',

  // Домен портала (без слеша в конце)
  PORTAL_DOMAIN: 'https://b24-o39xce.bitrix24.ru',

  // OAuth токен — заполняется автоматически когда приложение открывается
  // внутри Bitrix24 (Local App). Не трогать вручную.
  AUTH_TOKEN: null,

  // ID отдела сопровождения в Bitrix24.
  // Найти: открой в браузере https://b24-o39xce.bitrix24.ru/rest/1/tljrsgdpcnxpyrkd/department.get
  // Найди свой отдел в списке и вставь его ID сюда.
  // Только руководитель именно этого отдела будет видеть админку.
  SUPPORT_DEPARTMENT_ID: null, // например: 5

  // ID папки на Диске для файлов клиентов (получим автоматически)
  DISK_FOLDER_ID: null,

  // Интервал polling сообщений в миллисекундах (5000 = 5 секунд)
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
    },
    CONTACT: {
      PASSWORD_HASH: 'UF_CRM_1778536160219',
    },
  },

  // Маппинг ID значений поля "Тариф подписки" → название
  // Берётся из crm.company.fields → UF_CRM_1778533804303 → items
  SUB_TYPE_MAP: {
    '45': 'Стандарт',
    '47': 'Профессиональный',
    '49': 'Энтерпрайз',
  },

  // Обратный маппинг: название → ID (для сохранения)
  SUB_TYPE_REVERSE_MAP: {
    'Стандарт':        '45',
    'Профессиональный': '47',
    'Энтерпрайз':      '49',
  },
};
