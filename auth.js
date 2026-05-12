// ============================================================
// AUTH — авторизация клиентов
// Пароль хэшируется через SHA-256 на клиенте перед сравнением
// ============================================================

const B24_AUTH = {

  SESSION_KEY: 'b24_client_session',

  // Хэшировать пароль (SHA-256)
  async hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  // Войти: найти контакт по email, сравнить хэш пароля
  async login(email, password) {
    const contact = await B24_API.findContactByEmail(email.toLowerCase().trim());
    console.log('[AUTH] contact found:', contact ? contact.ID : 'NOT FOUND');
    if (!contact) return { success: false, error: 'Пользователь не найден' };

    const passwordHash = await this.hashPassword(password);
    const storedHash = contact[B24_CONFIG.CRM_FIELDS.CONTACT.PASSWORD_HASH];

    console.log('[AUTH] passwordHash (entered):', passwordHash);
    console.log('[AUTH] storedHash (in CRM):   ', storedHash);
    console.log('[AUTH] match:', passwordHash === storedHash);

    if (!storedHash || storedHash !== passwordHash) {
      return { success: false, error: 'Неверный пароль' };
    }

    // Получить данные компании
    const company = contact.COMPANY_ID
      ? await B24_API.getCompany(contact.COMPANY_ID)
      : null;

    // Сохранить сессию
    const session = {
      contactId: contact.ID,
      name: `${contact.NAME} ${contact.LAST_NAME || ''}`.trim(),
      email: email.toLowerCase().trim(),
      companyId: contact.COMPANY_ID || null,
      companyName: company ? company.TITLE : '',
      companyData: company || null,
    };
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    // Также сохраняем в localStorage для постоянной сессии
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));

    return { success: true, session };
  },

  // Выйти
  logout() {
    sessionStorage.removeItem(this.SESSION_KEY);
    localStorage.removeItem(this.SESSION_KEY);
    window.location.href = 'login.html';
  },

  // Получить текущую сессию — сначала sessionStorage, потом localStorage
  getSession() {
    const raw = sessionStorage.getItem(this.SESSION_KEY)
      || localStorage.getItem(this.SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  // Проверить авторизацию (редирект если нет сессии)
  requireAuth() {
    const session = this.getSession();
    if (!session) {
      window.location.href = 'login.html';
      return null;
    }
    return session;
  },

  // Генерация случайного пароля (для руководителя при создании клиента)
  generatePassword(length = 10) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz123456789';
    let password = '';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    array.forEach(byte => {
      password += chars[byte % chars.length];
    });
    return password;
  },
};
