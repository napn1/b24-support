// ============================================================
// API — обёртка над Bitrix24 REST API
// Все запросы идут через PHP прокси — вебхук скрыт от клиента
// ============================================================

const B24_API = {

  // Базовый запрос к REST API через прокси
  async call(method, params = {}, retryCount = 0) {
    const MAX_RETRIES = 3; // Максимум 3 попытки
    const RETRY_DELAY = 1000; // Начальная задержка 1 секунда
    
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
        // Обработка истёкшего токена
        if ((data.error === 'EXPIRED_TOKEN' || data.error === 'expired_token') && retryCount === 0) {
          console.warn('Token expired, refreshing...');
          const refreshed = await this.refreshToken();
          if (refreshed) {
            console.log('Token refreshed, retrying request...');
            return await this.call(method, params, retryCount + 1);
          } else {
            console.error('Failed to refresh token');
            return null;
          }
        }
        
        // Обработка превышения лимита запросов
        if (data.error === 'QUERY_LIMIT_EXCEEDED') {
          if (retryCount < MAX_RETRIES) {
            const delay = RETRY_DELAY * Math.pow(2, retryCount); // Экспоненциальная задержка
            console.warn(`Query limit exceeded, retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(r => setTimeout(r, delay));
            return await this.call(method, params, retryCount + 1);
          } else {
            console.error('Query limit exceeded, max retries reached');
            return null;
          }
        }
        
        console.error(`B24 API error [${method}]:`, data.error, data.error_description);
        return null;
      }
      return data.result;
    } catch (err) {
      // Повтор при сетевых ошибках
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAY * Math.pow(2, retryCount); // Экспоненциальная задержка: 1s, 2s, 4s
        console.warn(`Network error [${method}], retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`, err.message);
        await new Promise(r => setTimeout(r, delay));
        return await this.call(method, params, retryCount + 1);
      } else {
        console.error(`B24 API fetch error [${method}] - max retries reached:`, err);
        return null;
      }
    }
  },

  // Обновить токен доступа
  async refreshToken() {
    if (typeof BX24 === 'undefined' || !BX24.refreshAuth) {
      console.error('BX24.refreshAuth not available');
      return false;
    }

    return new Promise((resolve) => {
      BX24.refreshAuth((auth) => {
        if (auth && auth.access_token) {
          B24_CONFIG.AUTH_TOKEN = auth.access_token;
          console.log('Token refreshed successfully');
          resolve(true);
        } else {
          console.error('Failed to refresh token');
          resolve(false);
        }
      });
    });
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
    const companyData = await this.getCompany(companyId);
    if (companyData) {
      const existingChatId = companyData[B24_CONFIG.CRM_FIELDS.COMPANY.CHAT_ID];
      if (existingChatId) {
        const test = await this.call('im.dialog.messages.get', {
          DIALOG_ID: `chat${existingChatId}`,
          LIMIT: 1,
        });
        if (test !== null) {
          return { ID: parseInt(existingChatId) };
        }
        // Чат удалён — очистить поле и создать новый
        await this.updateCompany(companyId, {
          [B24_CONFIG.CRM_FIELDS.COMPANY.CHAT_ID]: '',
        });
      }
    }

    const chatTitle = `Компания: ${companyName}`;
    const newChatId = await this.call('im.chat.add', {
      TYPE: 'CHAT',
      TITLE: chatTitle,
      DESCRIPTION: `Чат сопровождения для компании ${companyName} (ID: ${companyId})`,
      MESSAGE: 'Чат создан. Здесь будут все обращения от клиента.',
    });

    if (newChatId && companyData) {
      // Добавить специалиста если назначен
      const specialistId = companyData[B24_CONFIG.CRM_FIELDS.COMPANY.SPECIALIST];
      if (specialistId) {
        await this.addUserToChat(newChatId, specialistId);
      }
      
      // Добавить всех руководителей отдела "Сопровождение" (по должности "Руководитель ТП")
      try {
        const departments = await this.call('department.get', {});
        if (departments && departments.length > 0) {
          const dept = departments.find(d => d.NAME === 'Сопровождение');
          if (dept) {
            const deptUsers = await this.call('user.get', {
              filter: { UF_DEPARTMENT: dept.ID },
              select: ['ID', 'WORK_POSITION'],
            });
            let headIds = [];
            if (deptUsers) {
              deptUsers.forEach(u => {
                if (u.WORK_POSITION && u.WORK_POSITION.includes('Руководитель ТП')) headIds.push(String(u.ID));
              });
            }
            // Fallback на im.department.managers.get
            if (headIds.length === 0) {
              const mgr = await this.call('im.department.managers.get', { ID: [dept.ID], USER_DATA: 'N' });
              if (mgr) headIds = Object.values(mgr).flat().map(id => String(id));
            }
            for (const headId of headIds) {
              if (String(headId) !== String(specialistId)) {
                await this.addUserToChat(newChatId, headId);
              }
            }
          }
        }
      } catch (e) {
        console.error('Ошибка добавления руководителей в чат:', e);
      }
    }

    return newChatId ? { ID: newChatId } : null;
  },

  // Получить историю сообщений чата
  // Сначала пробуем KV через Worker, fallback к Bitrix24 API
  async getChatMessages(chatId) {
    try {
      const resp = await fetch(B24_CONFIG.PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getMessages', chatId }),
      });
      const data = await resp.json();
      if (data.ok && data.messages) {
        const count = Object.keys(data.messages).length;
        if (count > 0) {
          return { messages: data.messages };
        }
      }
    } catch (e) {
      console.warn('[getChatMessages] KV error, falling back:', e);
    }

    // Fallback: прямой запрос к Bitrix24
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
      HIDE_HISTORY: 'N',
    });
  },

  // Удалить пользователя из чата
  async removeUserFromChat(chatId, userId) {
    return await this.call('im.chat.user.delete', {
      CHAT_ID: chatId,
      USER_ID: userId,
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
      'ID', 'TITLE',
      B24_CONFIG.CRM_FIELDS.COMPANY.CHAT_ID,
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
