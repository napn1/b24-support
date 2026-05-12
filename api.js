// ============================================================
// API — обёртка над Bitrix24 REST API
// Все запросы идут через PHP прокси — вебхук скрыт от клиента
// ============================================================

const B24_API = {

  // Базовый запрос к REST API через прокси
  async call(method, params = {}) {
    let url;
    let body;

    if (B24_CONFIG.AUTH_TOKEN) {
      // OAuth режим (Local App внутри Bitrix24) — напрямую с токеном
      url = `${B24_CONFIG.PORTAL_DOMAIN}/rest/${method}`;
      body = JSON.stringify({ ...params, auth: B24_CONFIG.AUTH_TOKEN });
    } else if (B24_CONFIG.PROXY_URL) {
      // Прокси режим — токен скрыт на сервере
      url = B24_CONFIG.PROXY_URL;
      body = JSON.stringify({ method, params });
    } else {
      // Fallback: прямой вебхук (только для разработки)
      url = B24_CONFIG.WEBHOOK_URL + method;
      body = JSON.stringify(params);
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const data = await response.json();
      if (data.error) {
        if (data.error === 'QUERY_LIMIT_EXCEEDED') {
          await new Promise(r => setTimeout(r, 2000));
          return null;
        }
        console.error(`B24 API error [${method}]:`, data.error, data.error_description);
        return null;
      }
      return data.result;
    } catch (err) {
      console.error(`B24 API fetch error [${method}]:`, err);
      return null;
    }
  },

  // ─── АВТОРИЗАЦИЯ ────────────────────────────────────────────

  // Найти контакт по email
  async findContactByEmail(email) {
    const result = await this.call('crm.contact.list', {
      filter: { EMAIL: email },
      select: [
        'ID', 'NAME', 'LAST_NAME', 'EMAIL',
        'COMPANY_ID',
        B24_CONFIG.CRM_FIELDS.CONTACT.PASSWORD_HASH,
      ],
    });
    return result && result.length > 0 ? result[0] : null;
  },

  // Получить компанию по ID
  async getCompany(companyId) {
    return await this.call('crm.company.get', { id: companyId });
  },

  // ─── СООБЩЕНИЯ (через обычный мессенджер) ──────────────────

  // Получить или создать групповой чат для компании
  async getOrCreateCompanyChat(companyId, companyName) {
    // Сначала проверяем — есть ли уже сохранённый ChatID в комментариях компании
    const companyData = await this.getCompany(companyId);
    if (companyData && companyData.COMMENTS) {
      const match = companyData.COMMENTS.match(/ChatID:\s*(\d+)/);
      if (match) {
        console.log('[getOrCreateCompanyChat] found existing chatId:', match[1]);
        return { ID: parseInt(match[1]) };
      }
    }

    // Чата нет — создаём новый
    const chatTitle = `Компания: ${companyName}`;
    const newChatId = await this.call('im.chat.add', {
      TYPE: 'CHAT',
      TITLE: chatTitle,
      DESCRIPTION: `Чат сопровождения для компании ${companyName} (ID: ${companyId})`,
      MESSAGE: 'Чат создан. Здесь будут все обращения от клиента.',
    });

    console.log('[getOrCreateCompanyChat] created new chat:', newChatId);
    return newChatId ? { ID: newChatId } : null;
  },

  // Получить историю сообщений чата
  // Всегда запрашиваем последние 100 сообщений и фильтруем новые по ID на клиенте
  async getChatMessages(chatId) {
    return await this.call('im.dialog.messages.get', {
      DIALOG_ID: `chat${chatId}`,
      LIMIT: 100,
    });
  },

  // Отправить сообщение в чат
  // fromName сохраняется как префикс [Имя]: — единственный способ
  // идентифицировать отправителя через один вебхук
  async sendMessage(chatId, text, fromName = 'Клиент') {
    return await this.call('im.message.add', {
      DIALOG_ID: `chat${chatId}`,
      MESSAGE: `[${fromName}]: ${text}`,
    });
  },

  // Добавить пользователя (специалиста) в чат
  async addUserToChat(chatId, userId) {
    return await this.call('im.chat.user.add', {
      CHAT_ID: chatId,
      USERS: [userId],
    });
  },

  // ─── ФАЙЛЫ ──────────────────────────────────────────────────

  // Загрузить файл на Диск Bitrix24 в папку компании
  async uploadFile(folderId, fileName, fileBase64) {
    return await this.call('disk.folder.uploadfile', {
      id: folderId,
      data: { NAME: fileName },
      fileContent: fileBase64,
    });
  },

  // Найти или создать папку компании на Диске
  async getOrCreateCompanyFolder(parentFolderId, companyName) {
    // Ищем существующую папку
    const list = await this.call('disk.folder.getchildren', {
      id: parentFolderId,
      filter: { NAME: companyName },
    });
    if (list && list.length > 0) return list[0];

    // Создаём новую
    return await this.call('disk.folder.addsubfolder', {
      id: parentFolderId,
      data: { NAME: companyName },
    });
  },

  // ─── CRM ────────────────────────────────────────────────────

  // Создать контакт (новый пользователь клиента)
  async createContact(fields) {
    return await this.call('crm.contact.add', { fields });
  },

  // Обновить контакт
  async updateContact(id, fields) {
    return await this.call('crm.contact.update', { id, fields });
  },

  // Создать компанию
  async createCompany(fields) {
    return await this.call('crm.company.add', { fields });
  },

  // Обновить компанию
  async updateCompany(id, fields) {
    return await this.call('crm.company.update', { id, fields });
  },

  // Получить список всех компаний (для руководителя)
  // Загружает все страницы если компаний больше 50
  async getCompanies(filter = {}) {
    const select = [
      'ID', 'TITLE', 'COMMENTS',
      B24_CONFIG.CRM_FIELDS.COMPANY.SUB_START,
      B24_CONFIG.CRM_FIELDS.COMPANY.SUB_END,
      B24_CONFIG.CRM_FIELDS.COMPANY.SUB_TYPE,
      B24_CONFIG.CRM_FIELDS.COMPANY.HOURS_TOTAL,
      B24_CONFIG.CRM_FIELDS.COMPANY.HOURS_USED,
      B24_CONFIG.CRM_FIELDS.COMPANY.SUB_STATUS,
      B24_CONFIG.CRM_FIELDS.COMPANY.SPECIALIST,
    ];

    let all = [];
    let start = 0;

    while (true) {
      const result = await this.call('crm.company.list', {
        filter,
        select,
        start,
      });

      if (!result || result.length === 0) break;
      all = all.concat(result);

      // Bitrix24 возвращает максимум 50 за раз
      if (result.length < 50) break;
      start += 50;
    }

    return all;
  },

  // Получить контакты компании
  async getCompanyContacts(companyId) {
    return await this.call('crm.company.contact.items.get', {
      id: companyId,
    });
  },

  // ─── ПОЛЬЗОВАТЕЛИ ПОРТАЛА ───────────────────────────────────

  // Получить список сотрудников отдела (для назначения специалиста)
  async getDepartmentUsers(departmentId) {
    return await this.call('user.get', {
      filter: { UF_DEPARTMENT: departmentId },
      select: ['ID', 'NAME', 'LAST_NAME', 'EMAIL', 'PERSONAL_PHOTO'],
    });
  },
};
