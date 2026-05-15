// ============================================================
// API вЂ” РѕР±С‘СЂС‚РєР° РЅР°Рґ Bitrix24 REST API
// Р’СЃРµ Р·Р°РїСЂРѕСЃС‹ РёРґСѓС‚ С‡РµСЂРµР· PHP РїСЂРѕРєСЃРё вЂ” РІРµР±С…СѓРє СЃРєСЂС‹С‚ РѕС‚ РєР»РёРµРЅС‚Р°
// ============================================================

const B24_API = {

  // Р‘Р°Р·РѕРІС‹Р№ Р·Р°РїСЂРѕСЃ Рє REST API С‡РµСЂРµР· РїСЂРѕРєСЃРё
  async call(method, params = {}) {
    let url;
    let body;

    if (B24_CONFIG.AUTH_TOKEN) {
      // OAuth СЂРµР¶РёРј (Local App РІРЅСѓС‚СЂРё Bitrix24) вЂ” РЅР°РїСЂСЏРјСѓСЋ СЃ С‚РѕРєРµРЅРѕРј
      url = `${B24_CONFIG.PORTAL_DOMAIN}/rest/${method}`;
      body = JSON.stringify({ ...params, auth: B24_CONFIG.AUTH_TOKEN });
    } else if (B24_CONFIG.PROXY_URL) {
      // РџСЂРѕРєСЃРё СЂРµР¶РёРј вЂ” С‚РѕРєРµРЅ СЃРєСЂС‹С‚ РЅР° СЃРµСЂРІРµСЂРµ
      url = B24_CONFIG.PROXY_URL;
      body = JSON.stringify({ method, params });
    } else {
      // Fallback: РїСЂСЏРјРѕР№ РІРµР±С…СѓРє (С‚РѕР»СЊРєРѕ РґР»СЏ СЂР°Р·СЂР°Р±РѕС‚РєРё)
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

  // в”Ђв”Ђв”Ђ РђР’РўРћР РР—РђР¦РРЇ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  // РќР°Р№С‚Рё РєРѕРЅС‚Р°РєС‚ РїРѕ email
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

  // РџРѕР»СѓС‡РёС‚СЊ РєРѕРјРїР°РЅРёСЋ РїРѕ ID
  async getCompany(companyId) {
    return await this.call('crm.company.get', { id: companyId });
  },

  // в”Ђв”Ђв”Ђ РЎРћРћР‘Р©Р•РќРРЇ (С‡РµСЂРµР· РѕР±С‹С‡РЅС‹Р№ РјРµСЃСЃРµРЅРґР¶РµСЂ) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  // РџРѕР»СѓС‡РёС‚СЊ РёР»Рё СЃРѕР·РґР°С‚СЊ РіСЂСѓРїРїРѕРІРѕР№ С‡Р°С‚ РґР»СЏ РєРѕРјРїР°РЅРёРё
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
        // Р§Р°С‚ СѓРґР°Р»С‘РЅ вЂ” РѕС‡РёСЃС‚РёС‚СЊ РїРѕР»Рµ Рё СЃРѕР·РґР°С‚СЊ РЅРѕРІС‹Р№
        await this.updateCompany(companyId, {
          [B24_CONFIG.CRM_FIELDS.COMPANY.CHAT_ID]: '',
        });
      }
    }

    const chatTitle = `РљРѕРјРїР°РЅРёСЏ: ${companyName}`;
    const newChatId = await this.call('im.chat.add', {
      TYPE: 'CHAT',
      TITLE: chatTitle,
      DESCRIPTION: `Р§Р°С‚ СЃРѕРїСЂРѕРІРѕР¶РґРµРЅРёСЏ РґР»СЏ РєРѕРјРїР°РЅРёРё ${companyName} (ID: ${companyId})`,
      MESSAGE: 'Р§Р°С‚ СЃРѕР·РґР°РЅ. Р—РґРµСЃСЊ Р±СѓРґСѓС‚ РІСЃРµ РѕР±СЂР°С‰РµРЅРёСЏ РѕС‚ РєР»РёРµРЅС‚Р°.',
    });

    if (newChatId && companyData) {
      const specialistId = companyData[B24_CONFIG.CRM_FIELDS.COMPANY.SPECIALIST];
      if (specialistId) {
        await this.addUserToChat(newChatId, specialistId);
      }
    }

    return newChatId ? { ID: newChatId } : null;
  },

  // РџРѕР»СѓС‡РёС‚СЊ РёСЃС‚РѕСЂРёСЋ СЃРѕРѕР±С‰РµРЅРёР№ С‡Р°С‚Р°
  // РЎРЅР°С‡Р°Р»Р° РїСЂРѕР±СѓРµРј KV С‡РµСЂРµР· Worker, fallback Рє Bitrix24 API
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

    // Fallback: РїСЂСЏРјРѕР№ Р·Р°РїСЂРѕСЃ Рє Bitrix24
    return await this.call('im.dialog.messages.get', {
      DIALOG_ID: `chat${chatId}`,
      LIMIT: 100,
    });
  },

  // РћС‚РїСЂР°РІРёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ РІ С‡Р°С‚
  // fromName СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ РєР°Рє РїСЂРµС„РёРєСЃ [РРјСЏ]: вЂ” РµРґРёРЅСЃС‚РІРµРЅРЅС‹Р№ СЃРїРѕСЃРѕР±
  // РёРґРµРЅС‚РёС„РёС†РёСЂРѕРІР°С‚СЊ РѕС‚РїСЂР°РІРёС‚РµР»СЏ С‡РµСЂРµР· РѕРґРёРЅ РІРµР±С…СѓРє
  async sendMessage(chatId, text, fromName = 'РљР»РёРµРЅС‚') {
    return await this.call('im.message.add', {
      DIALOG_ID: `chat${chatId}`,
      MESSAGE: `[${fromName}]: ${text}`,
    });
  },

  // Р”РѕР±Р°РІРёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (СЃРїРµС†РёР°Р»РёСЃС‚Р°) РІ С‡Р°С‚
  async addUserToChat(chatId, userId) {
    return await this.call('im.chat.user.add', {
      CHAT_ID: chatId,
      USERS: [userId],
    });
  },

  // РЈРґР°Р»РёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РёР· С‡Р°С‚Р°
  async removeUserFromChat(chatId, userId) {
    return await this.call('im.chat.user.delete', {
      CHAT_ID: chatId,
      USER_ID: userId,
    });
  },

  // в”Ђв”Ђв”Ђ Р¤РђР™Р›Р« в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  // Р—Р°РіСЂСѓР·РёС‚СЊ С„Р°Р№Р» РЅР° Р”РёСЃРє Bitrix24 РІ РїР°РїРєСѓ РєРѕРјРїР°РЅРёРё
  async uploadFile(folderId, fileName, fileBase64) {
    return await this.call('disk.folder.uploadfile', {
      id: folderId,
      data: { NAME: fileName },
      fileContent: fileBase64,
    });
  },

  // РќР°Р№С‚Рё РёР»Рё СЃРѕР·РґР°С‚СЊ РїР°РїРєСѓ РєРѕРјРїР°РЅРёРё РЅР° Р”РёСЃРєРµ
  async getOrCreateCompanyFolder(parentFolderId, companyName) {
    // РС‰РµРј СЃСѓС‰РµСЃС‚РІСѓСЋС‰СѓСЋ РїР°РїРєСѓ
    const list = await this.call('disk.folder.getchildren', {
      id: parentFolderId,
      filter: { NAME: companyName },
    });
    if (list && list.length > 0) return list[0];

    // РЎРѕР·РґР°С‘Рј РЅРѕРІСѓСЋ
    return await this.call('disk.folder.addsubfolder', {
      id: parentFolderId,
      data: { NAME: companyName },
    });
  },

  // в”Ђв”Ђв”Ђ CRM в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  // РЎРѕР·РґР°С‚СЊ РєРѕРЅС‚Р°РєС‚ (РЅРѕРІС‹Р№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РєР»РёРµРЅС‚Р°)
  async createContact(fields) {
    return await this.call('crm.contact.add', { fields });
  },

  // РћР±РЅРѕРІРёС‚СЊ РєРѕРЅС‚Р°РєС‚
  async updateContact(id, fields) {
    return await this.call('crm.contact.update', { id, fields });
  },

  // РЎРѕР·РґР°С‚СЊ РєРѕРјРїР°РЅРёСЋ
  async createCompany(fields) {
    return await this.call('crm.company.add', { fields });
  },

  // РћР±РЅРѕРІРёС‚СЊ РєРѕРјРїР°РЅРёСЋ
  async updateCompany(id, fields) {
    return await this.call('crm.company.update', { id, fields });
  },

  // РџРѕР»СѓС‡РёС‚СЊ СЃРїРёСЃРѕРє РІСЃРµС… РєРѕРјРїР°РЅРёР№ (РґР»СЏ СЂСѓРєРѕРІРѕРґРёС‚РµР»СЏ)
  // Р—Р°РіСЂСѓР¶Р°РµС‚ РІСЃРµ СЃС‚СЂР°РЅРёС†С‹ РµСЃР»Рё РєРѕРјРїР°РЅРёР№ Р±РѕР»СЊС€Рµ 50
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

      // Bitrix24 РІРѕР·РІСЂР°С‰Р°РµС‚ РјР°РєСЃРёРјСѓРј 50 Р·Р° СЂР°Р·
      if (result.length < 50) break;
      start += 50;
    }

    return all;
  },

  // РџРѕР»СѓС‡РёС‚СЊ РєРѕРЅС‚Р°РєС‚С‹ РєРѕРјРїР°РЅРёРё
  async getCompanyContacts(companyId) {
    return await this.call('crm.company.contact.items.get', {
      id: companyId,
    });
  },

  // в”Ђв”Ђв”Ђ РџРћР›Р¬Р—РћР’РђРўР•Р›Р РџРћР РўРђР›Рђ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  // РџРѕР»СѓС‡РёС‚СЊ СЃРїРёСЃРѕРє СЃРѕС‚СЂСѓРґРЅРёРєРѕРІ РѕС‚РґРµР»Р° (РґР»СЏ РЅР°Р·РЅР°С‡РµРЅРёСЏ СЃРїРµС†РёР°Р»РёСЃС‚Р°)
  async getDepartmentUsers(departmentId) {
    return await this.call('user.get', {
      filter: { UF_DEPARTMENT: departmentId },
      select: ['ID', 'NAME', 'LAST_NAME', 'EMAIL', 'PERSONAL_PHOTO'],
    });
  },
};
