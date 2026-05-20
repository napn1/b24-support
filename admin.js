// ============================================================
// ADMIN — админка для руководителя отдела сопровождения
// ============================================================

let currentAdmin = null;
let allCompanies = [];
let allSpecialists = [];
let subTypeMap = {};
let adminIds = []; // ID всех руководителей отдела

// ─── INIT ───────────────────────────────────────────────────

async function init() {
  // Инициализация BX24 SDK (если открыто внутри Bitrix24)
  if (typeof BX24 !== 'undefined') {
    await new Promise(resolve => {
      BX24.init(function() {
        const auth = BX24.getAuth();
        if (auth && auth.access_token) {
          B24_CONFIG.AUTH_TOKEN = auth.access_token;
          B24_CONFIG.PORTAL_DOMAIN = 'https://' + auth.domain;
          B24_CONFIG.WEBHOOK_URL = null;
        }
        resolve();
      });
    });
  }

  // Получить текущего пользователя
  currentAdmin = await B24_API.call('user.current');
  if (!currentAdmin) {
    alert('Не удалось получить данные пользователя');
    return;
  }

  document.getElementById('adminName').textContent =
    `Администратор: ${currentAdmin.NAME} ${currentAdmin.LAST_NAME || ''}`.trim();

  // Загрузить список специалистов для выпадающего списка
  await loadSpecialists();

  // Добавить всех руководителей во все существующие чаты
  if (adminIds.length > 0) {
    ensureAdminsInAllChats().catch(e => console.warn('ensureAdminsInAllChats error:', e));
  }

  // Загрузить компании
  await loadCompaniesAccordion();

  // Запустить проверку непрочитанных для руководителя
  startAdminUnansweredPolling();

  // Установить сегодняшние даты для отчёта
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  document.getElementById('reportDateFrom').valueAsDate = firstDay;
  document.getElementById('reportDateTo').valueAsDate = today;
}

// ─── TAB SWITCHING ──────────────────────────────────────────

function switchTab(tabName, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');
  if (btn) btn.classList.add('active');

  // При переходе на вкладку чатов — загрузить список
  if (tabName === 'chats' && allCompanies.length > 0) {
    renderAdminChatList();
  }
}

// ─── CLIENTS TAB ─────────────────────────────────────────────

async function loadCompaniesAccordion() {
  allCompanies = await B24_API.getCompanies();

  const container = document.getElementById('companiesList');
  if (!container) return;

  if (!allCompanies) {
    container.innerHTML = '<div style="text-align: center; color: #f87171; padding: 20px;">Ошибка загрузки. Проверьте консоль (F12)</div>';
    return;
  }

  if (allCompanies.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">Нет компаний</div>';
    return;
  }

  // Заполнить выпадающий список компаний в форме регистрации
  const regSelect = document.getElementById('regCompany');
  if (regSelect) {
    regSelect.innerHTML = '<option value="">— Выберите компанию —</option>';
    allCompanies.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.ID;
      opt.textContent = c.TITLE;
      regSelect.appendChild(opt);
    });
  }

  // Заполнить список компаний в фильтре отчёта
  populateReportCompanyFilter();

  container.innerHTML = '';

  for (const company of allCompanies) {
    const specialistId = company[B24_CONFIG.CRM_FIELDS.COMPANY.SPECIALIST];
    const specialist = allSpecialists.find(s => s.ID == specialistId);
    const specialistName = specialist
      ? `${specialist.NAME} ${specialist.LAST_NAME || ''}`.trim()
      : 'Не назначен';

    const subStart = company[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_START];
    const subEnd = company[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_END];

    const hoursUsed = parseFloat(company[B24_CONFIG.CRM_FIELDS.COMPANY.HOURS_USED] || 0);
    const hoursTotal = parseFloat(company[B24_CONFIG.CRM_FIELDS.COMPANY.HOURS_TOTAL] || 0);

    const daysLeft = subEnd ? Math.ceil((new Date(subEnd) - new Date()) / (1000 * 60 * 60 * 24)) : -1;
    const subDisplay = subEnd ? `${formatDate(subStart)} — ${formatDate(subEnd)} (${daysLeft} дн.)` : 'Нет подписки';

    const subTypeRaw = company[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_TYPE] || '';
    const subType = B24_CONFIG.SUB_TYPE_MAP[subTypeRaw] || subTypeRaw || '—';

    // Определить цвет тарифа по статусу подписки
    let tariffBg, tariffColor;
    if (daysLeft < 0) {
      // Истекла — красный
      tariffBg = '#3a1a1a';
      tariffColor = '#f87171';
    } else if (daysLeft <= 7) {
      // Истекает — жёлтый
      tariffBg = '#3a2a1a';
      tariffColor = '#fbbf24';
    } else {
      // Активна — зелёный
      tariffBg = '#1a3a1a';
      tariffColor = '#4ade80';
    }

    const tariffBadge = `<span style="background:${tariffBg}; color:${tariffColor}; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:500;">${subType}</span>`;

    // Создать аккордеон для компании
    const accordionItem = document.createElement('div');
    accordionItem.className = 'accordion-item';
    accordionItem.innerHTML = `
      <div class="accordion-header" onclick="toggleAccordion(this)">
        <div class="accordion-header-left">
          <strong style="font-size: 15px; color: #fff;">${company.TITLE}</strong>
          <span style="font-size: 13px; color: #888;">Специалист: ${specialistName}</span>
          ${tariffBadge}
          <span style="font-size: 12px; color: #888;">${subDisplay}</span>
          <span style="font-size: 12px; color: #888;">${hoursUsed.toFixed(1)} / ${hoursTotal.toFixed(1)} ч</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <button class="btn btn-secondary" onclick="event.stopPropagation(); editCompany(${company.ID})" style="padding: 6px 12px; font-size: 12px;">Редактировать</button>
          <span class="accordion-arrow">▼</span>
        </div>
      </div>
      <div class="accordion-body">
        <div id="users-${company.ID}" style="padding: 10px;">
          <div style="text-align: center; color: #666; padding: 20px;">
            <span class="spinner"></span>Загрузка пользователей...
          </div>
        </div>
      </div>
    `;

    container.appendChild(accordionItem);
  }
}

function filterCompanies() {
  const searchValue = document.getElementById('clientsSearch').value.toLowerCase().trim();
  const accordionItems = document.querySelectorAll('.accordion-item');

  accordionItems.forEach(item => {
    const header = item.querySelector('.accordion-header');
    const companyName = header.querySelector('strong').textContent.toLowerCase();
    
    if (companyName.includes(searchValue)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
}

function getStatusBadge(status) {
  const badges = {
    'active': '<span class="badge success">Активна</span>',
    'expiring': '<span class="badge warning">Истекает</span>',
    'expired': '<span class="badge danger">Истекла</span>',
  };
  return badges[status] || '<span class="badge">Неизвестно</span>';
}

function toggleAccordion(header) {
  const item = header.parentElement;
  const isOpen = item.classList.contains('open');
  
  if (isOpen) {
    item.classList.remove('open');
  } else {
    item.classList.add('open');
    // Загрузить пользователей компании при первом открытии
    const companyId = extractCompanyIdFromAccordion(item);
    if (companyId) {
      const usersContainer = document.getElementById(`users-${companyId}`);
      // Проверить, не загружены ли уже пользователи
      if (usersContainer && usersContainer.innerHTML.includes('Загрузка пользователей...')) {
        loadCompanyUsers(companyId);
      }
    }
  }
}

function extractCompanyIdFromAccordion(accordionItem) {
  const usersDiv = accordionItem.querySelector('[id^="users-"]');
  if (usersDiv) {
    const match = usersDiv.id.match(/users-(\d+)/);
    return match ? match[1] : null;
  }
  return null;
}

async function loadCompanyUsers(companyId) {
  const usersContainer = document.getElementById(`users-${companyId}`);
  if (!usersContainer) return;

  try {
    // Получить контакты компании
    const contacts = await B24_API.call('crm.contact.list', {
      filter: { COMPANY_ID: companyId },
      select: ['ID', 'NAME', 'LAST_NAME', 'EMAIL', 'DATE_CREATE', B24_CONFIG.CRM_FIELDS.CONTACT.PASSWORD_HASH]
    });

    if (!contacts || contacts.length === 0) {
      usersContainer.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">Нет пользователей</div>';
      return;
    }

    let html = '';
    contacts.forEach(contact => {
      const email = contact.EMAIL && contact.EMAIL[0] ? contact.EMAIL[0].VALUE : 'Нет email';
      const fullName = `${contact.NAME || ''} ${contact.LAST_NAME || ''}`.trim() || 'Без имени';
      const hasPassword = contact[B24_CONFIG.CRM_FIELDS.CONTACT.PASSWORD_HASH] ? true : false;
      const createDate = contact.DATE_CREATE ? formatDate(contact.DATE_CREATE) : '—';

      html += `
        <div class="user-row">
          <div class="user-info">
            <div class="user-name">${fullName}</div>
            <div class="user-email">${email}</div>
            <div style="font-size: 11px; color: #666;">Создан: ${createDate}</div>
            <div style="font-size: 11px; color: ${hasPassword ? '#4ade80' : '#f87171'};">
              ${hasPassword ? '✓ Пароль установлен' : '✗ Пароль не установлен'}
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="generateNewPassword(${contact.ID}, '${email}')" 
                    style="padding: 6px 12px; font-size: 12px;">
              ${hasPassword ? 'Сбросить пароль' : 'Создать пароль'}
            </button>
          </div>
        </div>
      `;
    });

    usersContainer.innerHTML = html;

  } catch (error) {

    usersContainer.innerHTML = '<div style="text-align: center; color: #f87171; padding: 20px;">Ошибка загрузки пользователей</div>';
  }
}

async function generateNewPassword(contactId, email) {
  if (!confirm(`Сгенерировать новый пароль для ${email}?\nСтарый пароль будет заменён.`)) {
    return;
  }

  try {

    
    // Генерировать новый пароль
    const newPassword = B24_AUTH.generatePassword();
    const passwordHash = await B24_AUTH.hashPassword(newPassword);



    // Обновить контакт
    const result = await B24_API.call('crm.contact.update', {
      id: contactId,
      fields: {
        [B24_CONFIG.CRM_FIELDS.CONTACT.PASSWORD_HASH]: passwordHash
      }
    });

    if (result) {


      // Показать пароль прямо в интерфейсе рядом с пользователем
      showPasswordToast(email, newPassword, contactId);

      // Обновить отображение пользователей
      const companyId = findCompanyIdByContactId(contactId);
      if (companyId) {
        await loadCompanyUsers(companyId);
        // После перерисовки снова показать пароль (т.к. DOM обновился)
        showPasswordToast(email, newPassword, contactId);
      }
    } else {

      showToast('Ошибка при обновлении пароля', 'error');
    }
  } catch (error) {

    alert('Ошибка при генерации пароля: ' + error.message);
  }
}

function findCompanyIdByContactId(contactId) {
  // Найти компанию по открытому аккордеону
  const openAccordion = document.querySelector('.accordion-item.open');
  if (openAccordion) {
    return extractCompanyIdFromAccordion(openAccordion);
  }
  return null;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU');
}

let editingCompanyId = null;

async function editCompany(companyId) {
  const company = allCompanies.find(c => c.ID == companyId);
  if (!company) return;

  editingCompanyId = companyId;

  // Заполнить модалку данными компании
  document.getElementById('modalCompanyName').textContent = company.TITLE;
  document.getElementById('modalHoursTotal').value = company[B24_CONFIG.CRM_FIELDS.COMPANY.HOURS_TOTAL] || 0;
  document.getElementById('modalHoursUsed').value = company[B24_CONFIG.CRM_FIELDS.COMPANY.HOURS_USED] || 0;
  document.getElementById('modalSubStatus').value = company[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_STATUS] || 'active';
  const subTypeRaw = company[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_TYPE] || '';
  const subTypeName = B24_CONFIG.SUB_TYPE_MAP[subTypeRaw] || subTypeRaw || 'Стандарт';
  document.getElementById('modalSubType').value = subTypeName;

  const subStart = company[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_START];
  const subEnd = company[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_END];
  document.getElementById('modalSubStart').value = subStart ? subStart.split('T')[0] : '';
  document.getElementById('modalSubEnd').value = subEnd ? subEnd.split('T')[0] : '';

  // Заполнить список специалистов
  const select = document.getElementById('modalSpecialist');
  select.innerHTML = '<option value="">Не назначен</option>';
  allSpecialists.forEach(user => {
    const opt = document.createElement('option');
    opt.value = user.ID;
    opt.textContent = `${user.NAME} ${user.LAST_NAME || ''}`.trim();
    if (String(user.ID) === String(company[B24_CONFIG.CRM_FIELDS.COMPANY.SPECIALIST])) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });

  // Показать модалку
  const modal = document.getElementById('editModal');
  modal.style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  editingCompanyId = null;
}

async function saveEditModal() {
  if (!editingCompanyId) return;

  const saveBtn = document.querySelector('#editModal .btn-primary');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Сохранение...';

  const newSpecialistId = document.getElementById('modalSpecialist').value || null;
  const company = allCompanies.find(c => c.ID == editingCompanyId);
  const oldSpecialistId = company ? company[B24_CONFIG.CRM_FIELDS.COMPANY.SPECIALIST] : null;

  const fields = {
    [B24_CONFIG.CRM_FIELDS.COMPANY.SPECIALIST]:  newSpecialistId,
    [B24_CONFIG.CRM_FIELDS.COMPANY.HOURS_TOTAL]: String(parseFloat(document.getElementById('modalHoursTotal').value) || 0),
    [B24_CONFIG.CRM_FIELDS.COMPANY.HOURS_USED]:  String(parseFloat(document.getElementById('modalHoursUsed').value) || 0),
    [B24_CONFIG.CRM_FIELDS.COMPANY.SUB_STATUS]:  document.getElementById('modalSubStatus').value,
    [B24_CONFIG.CRM_FIELDS.COMPANY.SUB_TYPE]:    B24_CONFIG.SUB_TYPE_REVERSE_MAP[document.getElementById('modalSubType').value] || document.getElementById('modalSubType').value,
    [B24_CONFIG.CRM_FIELDS.COMPANY.SUB_START]:   document.getElementById('modalSubStart').value || null,
    [B24_CONFIG.CRM_FIELDS.COMPANY.SUB_END]:     document.getElementById('modalSubEnd').value || null,
  };



  const result = await B24_API.updateCompany(editingCompanyId, fields);



  // Если сохранение успешно И специалист указан - добавить его в чат компании
  if (result !== null && newSpecialistId) {
    const chatIdRaw = company && company[B24_CONFIG.CRM_FIELDS.COMPANY.CHAT_ID];
    if (chatIdRaw) {
      const chatId = parseInt(chatIdRaw);

      saveBtn.textContent = 'Обновление чата...';
        
      try {
        // Сначала добавить нового специалиста
        await B24_API.addUserToChat(chatId, newSpecialistId);
        
        // Убедиться что все руководители в чате (на случай если чат был создан раньше)
        if (adminIds.length > 0) {
          for (const adminId of adminIds) {
            try {
              await B24_API.addUserToChat(chatId, adminId);
            } catch (e) {
              // Игнорируем ошибку если уже добавлен
            }
          }
        }

        // Только потом удалить старого (чтобы чат не остался пустым)
        // Не удалять руководителей отдела (adminIds)
        const isAdmin = adminIds.includes(String(oldSpecialistId));
        console.log('Проверка удаления:', {
          oldSpecialistId,
          newSpecialistId,
          adminIds,
          isAdmin,
          willRemove: oldSpecialistId && String(oldSpecialistId) !== String(newSpecialistId) && !isAdmin
        });
        if (oldSpecialistId && String(oldSpecialistId) !== String(newSpecialistId) && !isAdmin) {
          console.log('Удаляем пользователя', oldSpecialistId, 'из чата');
          try { await B24_API.removeUserFromChat(chatId, oldSpecialistId); } catch (e) { console.error('Ошибка удаления:', e); }
        } else {
          console.log('Пользователь НЕ удалён (руководитель или тот же специалист)');
        }

        // Отправить уведомление специалисту если он изменился
        if (String(newSpecialistId) !== String(oldSpecialistId)) {
          const companyName = company.TITLE;
          const message = `Вы назначены специалистом на компанию "${companyName}". Чат с клиентом доступен в разделе Сопровождение.`;
          
          try {
            await B24_API.call('im.notify', {
              to: newSpecialistId,
              message: message,
              type: 'SYSTEM',
            });
          } catch (notifyError) {}
        }
        
        showToast('✅ Специалист добавлен в чат компании', 'success');
      } catch (error) {
        showToast('⚠️ Специалист назначен, но не добавлен в чат (возможно уже добавлен)', 'warning');
      }
    } else {
      // Отправить уведомление даже если чата еще нет
      if (newSpecialistId && String(newSpecialistId) !== String(oldSpecialistId)) {
        const companyName = company.TITLE;
        const message = `Вы назначены специалистом на компанию "${companyName}". Чат появится когда клиент напишет первое сообщение.`;
        
        try {
          await B24_API.call('im.notify', {
            to: newSpecialistId,
            message: message,
            type: 'SYSTEM',
          });
        } catch (notifyError) {}
      }
    }
  }

  saveBtn.disabled = false;
  saveBtn.textContent = 'Сохранить';

  if (result !== null) {
    closeEditModal();
    // Принудительно сбросить кэш и перезагрузить
    allCompanies = [];
    await loadCompaniesAccordion();
  } else {
    alert('Ошибка при сохранении. Проверьте консоль (F12)');
  }
}

// ─── REGISTER TAB ───────────────────────────────────────────

async function loadSpecialists() {
  // Сначала найти отдел "Сопровождение" по названию
  const departments = await B24_API.call('department.get', {});
  let departmentId = null;

  if (departments && departments.length > 0) {
    const dept = departments.find(d => d.NAME === 'Сопровождение');
    if (dept) {
      departmentId = dept.ID;

    } else {

    }
  }

  // Загрузить сотрудников отдела (или всех если отдел не найден)
  const params = {
    select: ['ID', 'NAME', 'LAST_NAME', 'EMAIL'],
  };
  if (departmentId) {
    params.filter = { UF_DEPARTMENT: departmentId };
  }

  const result = await B24_API.call('user.get', params);

  if (result && result.length > 0) {
    allSpecialists = result;
    
    // Найти всех руководителей отдела
    if (departmentId) {
      const deptDetails = await B24_API.call('department.get', { ID: departmentId });
      if (deptDetails && deptDetails.length > 0) {
        const headId = deptDetails[0].UF_HEAD;
        if (headId) {
          adminIds = [String(headId)];
          console.log('Руководители отдела:', adminIds);
        }
      }
    }

    // Заполнить список специалистов в модалке редактирования
    // (regSpecialist больше не используется — специалист назначается через редактирование компании)
    const modalSelect = document.getElementById('modalSpecialist');
    if (modalSelect) {
      modalSelect.innerHTML = '<option value="">Не назначен</option>';
      result.forEach(user => {
        const option = document.createElement('option');
        option.value = user.ID;
        option.textContent = `${user.NAME} ${user.LAST_NAME || ''}`.trim();
        modalSelect.appendChild(option);
      });
    }
  }
}

// ─── ENSURE ADMINS IN ALL CHATS ─────────────────────────────
// Добавляет всех руководителей во все существующие чаты компаний
async function ensureAdminsInAllChats() {
  if (adminIds.length === 0) return;

  // Получаем все компании с чатами
  const companies = await B24_API.getCompanies();
  if (!companies || companies.length === 0) return;

  console.log(`[ensureAdmins] Проверяем ${companies.length} компаний, руководители:`, adminIds);

  let added = 0;
  for (const company of companies) {
    const chatIdRaw = company[B24_CONFIG.CRM_FIELDS.COMPANY.CHAT_ID];
    if (!chatIdRaw) continue;

    const chatId = parseInt(chatIdRaw);
    for (const adminId of adminIds) {
      try {
        await B24_API.addUserToChat(chatId, adminId);
        added++;
      } catch (e) {
        // Игнорируем — скорее всего уже в чате
      }
    }
  }

  console.log(`[ensureAdmins] Готово. Добавлено/проверено: ${added}`);
}

async function registerClient() {
  const companyId = document.getElementById('regCompany').value;
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName = document.getElementById('regLastName').value.trim();

  const alertEl = document.getElementById('registerAlert');

  if (!companyId) {
    showAlert(alertEl, 'Выберите компанию', 'error');
    return;
  }
  if (!email) {
    showAlert(alertEl, 'Введите email клиента', 'error');
    return;
  }



  // Проверить что такой email ещё не зарегистрирован
  const existing = await B24_API.findContactByEmail(email);
  if (existing) {
    showAlert(alertEl, `Пользователь с email ${email} уже существует`, 'error');
    return;
  }

  // Генерировать пароль
  const password = B24_AUTH.generatePassword();
  const passwordHash = await B24_AUTH.hashPassword(password);



  // Создать контакт привязанный к выбранной компании
  const contactResult = await B24_API.createContact({
    NAME: firstName || 'Клиент',
    LAST_NAME: lastName || '',
    EMAIL: [{ VALUE: email, VALUE_TYPE: 'WORK' }],
    COMPANY_ID: companyId,
    [B24_CONFIG.CRM_FIELDS.CONTACT.PASSWORD_HASH]: passwordHash,
  });

  if (!contactResult) {
    showAlert(alertEl, 'Ошибка при создании пользователя', 'error');
    return;
  }



  // Найти название компании
  const company = allCompanies.find(c => c.ID == companyId);
  const companyName = company ? company.TITLE : '';



  // Показать пароль
  showAlert(
    alertEl,
    `✅ Пользователь зарегистрирован!<br><br>
     <strong>Компания:</strong> ${companyName}<br>
     <strong>Email:</strong> ${email}<br>
     <strong>Пароль:</strong> <code style="background:#111; padding:4px 8px; border-radius:4px; font-size:15px;">${password}</code><br><br>
     <small style="color:#f87171;">⚠️ Отправьте пароль клиенту вручную</small><br>
     <small style="color:#888;">Сохраните пароль — он больше не будет показан</small>`,
    'success'
  );

  // Очистить форму
  document.getElementById('regCompany').value = '';
  document.getElementById('regEmail').value = '';
  document.getElementById('regFirstName').value = '';
  document.getElementById('regLastName').value = '';
}

// ─── EMAIL ──────────────────────────────────────────────────

async function sendWelcomeEmail(email, password, companyName) {
  const subject = `Доступ к порталу сопровождения — ${companyName}`;
  const body = `Здравствуйте!\n\nДля вас создан аккаунт на портале сопровождения компании ${companyName}.\n\nДанные для входа:\n  Email: ${email}\n  Пароль: ${password}\n\nС уважением,\nОтдел сопровождения`;

  return await sendEmail(email, subject, body);
}

async function sendPasswordResetEmail(email, password) {
  const subject = `Новый пароль для доступа к порталу сопровождения`;
  const body = `Здравствуйте!\n\nДля вашего аккаунта был создан новый пароль.\n\nДанные для входа:\n  Email: ${email}\n  Новый пароль: ${password}\n\nС уважением,\nОтдел сопровождения`;

  return await sendEmail(email, subject, body);
}

// Единая функция отправки email через Cloudflare Worker
async function sendEmail(toEmail, subject, body) {



  
  try {
    const requestData = {
      action: 'sendEmail',
      to: toEmail,
      subject,
      text: body,
    };
    

    
    const resp = await fetch(B24_CONFIG.PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
    });
    

    
    const data = await resp.json();

    
    if (data.ok) {

      showToast(`✅ Письмо отправлено на ${toEmail}`, 'success');
    } else {

      showToast(`❌ Ошибка отправки письма: ${data.error || 'неизвестная ошибка'}`, 'error');
    }
    
    return data.ok;
  } catch (e) {

    showToast(`❌ Ошибка отправки письма: ${e.message}`, 'error');
    return false;
  }
}

// ─── ALERTS ─────────────────────────────────────────────────

function showAlert(element, message, type) {
  element.innerHTML = `<div class="alert ${type}">${message}</div>`;
}

// Показать пароль прямо в интерфейсе (не alert)
function showPasswordToast(email, password, contactId) {
  // Удалить предыдущий тост если есть
  const existing = document.getElementById('passwordToast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'passwordToast';
  toast.style.cssText = `
    position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
    background: #1a2a1a; border: 1px solid #2a5a2a; border-radius: 12px;
    padding: 20px 24px; z-index: 9999; min-width: 380px; max-width: 500px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  `;
  toast.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
      <div style="color:#4ade80; font-weight:600; font-size:14px;">✅ Новый пароль создан</div>
      <button id="closeToastBtn"
        style="background:none; border:none; color:#666; cursor:pointer; font-size:18px; line-height:1; padding:0 0 0 12px;">×</button>
    </div>
    <div style="font-size:13px; color:#aaa; margin-bottom:8px;">Email: <span style="color:#e0e0e0;">${email}</span></div>
    <div style="background:#111; border:1px solid #333; border-radius:8px; padding:10px 14px;">
      <div style="font-size:11px; color:#888; margin-bottom:6px;">Выделите и скопируйте (Ctrl+C):</div>
      <input type="text" id="toastPassword" readonly value="${password}"
        style="width:100%; background:#0a0a0a; border:1px solid #444; border-radius:6px; 
               padding:10px; font-size:18px; font-weight:700; color:#5b9cf6; letter-spacing:1px;
               font-family:monospace; text-align:center; cursor:text;"
        onclick="this.select()" />
    </div>
    <div style="font-size:11px; color:#f87171; margin-top:8px;">⚠️ Отправьте пароль клиенту вручную. Сохраните — больше не будет показан.</div>
  `;

  document.body.appendChild(toast);

  // Добавить обработчик закрытия
  document.getElementById('closeToastBtn').addEventListener('click', () => {
    toast.remove();
  });

  // Автоматически выделить пароль при открытии
  setTimeout(() => {
    const input = document.getElementById('toastPassword');
    if (input) {
      input.select();
      input.focus();
    }
  }, 100);
}

function copyPassword(password) {
  navigator.clipboard.writeText(password).then(() => {
    const btn = document.getElementById('copyBtn');
    if (btn) {
      btn.textContent = '✓ Скопировано';
      btn.style.background = '#1a3a1a';
      btn.style.color = '#4ade80';
      setTimeout(() => {
        if (btn) {
          btn.textContent = 'Копировать';
          btn.style.background = '#2a3a4a';
          btn.style.color = '#5b9cf6';
        }
      }, 2000);
    }
  });
}

function showToast(message, type = 'error') {
  const existing = document.getElementById('passwordToast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'passwordToast';
  
  let bg, border, color, icon;
  if (type === 'error') {
    bg = '#2a1a1a';
    border = '#5a2a2a';
    color = '#f87171';
    icon = '❌';
  } else if (type === 'success') {
    bg = '#1a2a1a';
    border = '#2a5a2a';
    color = '#4ade80';
    icon = '✅';
  } else {
    bg = '#2a2a1a';
    border = '#5a5a2a';
    color = '#fbbf24';
    icon = '⚠️';
  }
  
  toast.style.cssText = `
    position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
    background: ${bg}; border: 1px solid ${border}; border-radius: 12px;
    padding: 16px 24px; z-index: 9999; min-width: 300px; max-width: 600px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5); color: ${color}; font-size: 14px;
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
  `;
  toast.innerHTML = `
    <span>${icon} ${message}</span>
    <button onclick="document.getElementById('passwordToast').remove()"
      style="background:none; border:none; color:#666; cursor:pointer; font-size:18px; line-height:1;">×</button>
  `;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
}

// ─── REPORTS TAB ────────────────────────────────────────────

async function generateReport() {
  const dateFrom = document.getElementById('reportDateFrom').value;
  const dateTo = document.getElementById('reportDateTo').value;

  if (!dateFrom || !dateTo) {
    alert('Выберите период');
    return;
  }

  if (getSelectedCompanyIds().length === 0) {
    alert('Выберите компанию');
    return;
  }

  const reportData = buildReportData();

  if (typeof XLSX === 'undefined') {
    alert('Библиотека Excel не загружена. Попробуйте обновить страницу.');
    return;
  }

  // Данные с русскими заголовками
  const excelData = reportData.map(row => ({
    'Компания':              row.company,
    'Специалист':            row.specialist,
    'Тариф':                 row.subType,
    'Начало подписки':       row.subStart,
    'Конец подписки':        row.subEnd,
    'Часов использовано':    parseFloat(row.hoursUsed),
    'Часов всего':           parseFloat(row.hoursTotal),
    'Часов осталось':        parseFloat(row.hoursRemaining),
  }));

  // Строка ИТОГО
  const totalUsed     = reportData.reduce((s, r) => s + parseFloat(r.hoursUsed), 0);
  const totalTotal    = reportData.reduce((s, r) => s + parseFloat(r.hoursTotal), 0);
  const totalRemaining = reportData.reduce((s, r) => s + parseFloat(r.hoursRemaining), 0);
  excelData.push({
    'Компания':           'ИТОГО',
    'Специалист':         '',
    'Тариф':              '',
    'Начало подписки':    '',
    'Конец подписки':     '',
    'Часов использовано': parseFloat(totalUsed.toFixed(2)),
    'Часов всего':        parseFloat(totalTotal.toFixed(2)),
    'Часов осталось':     parseFloat(totalRemaining.toFixed(2)),
  });

  const ws = XLSX.utils.json_to_sheet(excelData);

  // Ширина столбцов
  ws['!cols'] = [
    { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 16 },
    { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
  ];

  // Границы и стили для всех ячеек
  const range = XLSX.utils.decode_range(ws['!ref']);
  const border = {
    top:    { style: 'thin', color: { rgb: '000000' } },
    bottom: { style: 'thin', color: { rgb: '000000' } },
    left:   { style: 'thin', color: { rgb: '000000' } },
    right:  { style: 'thin', color: { rgb: '000000' } },
  };
  const lastRow = range.e.r;

  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[ref]) ws[ref] = { v: '', t: 's' };
      if (!ws[ref].s) ws[ref].s = {};
      ws[ref].s.border = border;

      if (R === 0) {
        // Заголовок — серый фон, жирный
        ws[ref].s.font = { bold: true };
        ws[ref].s.fill = { fgColor: { rgb: 'D9D9D9' } };
        ws[ref].s.alignment = { horizontal: 'center' };
      } else if (R === lastRow) {
        // Строка ИТОГО — жёлтый фон, жирный
        ws[ref].s.font = { bold: true };
        ws[ref].s.fill = { fgColor: { rgb: 'FFF2CC' } };
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Отчёт');
  XLSX.writeFile(wb, `отчёт_${dateFrom}_${dateTo}.xlsx`);
}

async function showReport() {
  const dateFrom = document.getElementById('reportDateFrom').value;
  const dateTo = document.getElementById('reportDateTo').value;

  if (!dateFrom || !dateTo) {
    alert('Выберите период');
    return;
  }

  if (getSelectedCompanyIds().length === 0) {
    alert('Выберите компанию');
    return;
  }

  showReportStats(buildReportData());
}

function applyReportFilters() {
  // Просто перерисовать таблицу если она уже показана
  const statsContent = document.getElementById('statsContent');
  if (statsContent.querySelector('table')) {
    showReportStats(buildReportData());
  }
}

function buildReportData() {
  const selectedIds  = getSelectedCompanyIds(); // [] = все
  const filterHoursVal = document.getElementById('reportFilterHours')?.value || '';
  const filterHours = filterHoursVal !== '' ? parseFloat(filterHoursVal) : null;

  const reportData = [];

  for (const company of allCompanies) {
    const subStart = company[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_START];
    const subEnd   = company[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_END];
    const hoursUsed      = parseFloat(company[B24_CONFIG.CRM_FIELDS.COMPANY.HOURS_USED]  || 0);
    const hoursTotal     = parseFloat(company[B24_CONFIG.CRM_FIELDS.COMPANY.HOURS_TOTAL] || 0);
    const hoursRemaining = hoursTotal - hoursUsed;

    const specialistId = company[B24_CONFIG.CRM_FIELDS.COMPANY.SPECIALIST];
    const specialist   = allSpecialists.find(s => s.ID == specialistId);
    const specialistName = specialist
      ? `${specialist.NAME} ${specialist.LAST_NAME || ''}`.trim()
      : 'Не назначен';

    const subTypeRaw = company[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_TYPE] || '';
    const subType    = B24_CONFIG.SUB_TYPE_MAP[subTypeRaw] || subTypeRaw || '—';

    // Пропустить компании без начала подписки
    if (!subStart) continue;

    // Фильтр по выбранным компаниям
    if (selectedIds.length > 0 && !selectedIds.includes(String(company.ID))) continue;

    // Фильтр по остатку часов
    if (filterHours !== null && hoursRemaining >= filterHours) continue;

    reportData.push({
      company:        company.TITLE,
      specialist:     specialistName,
      subType,
      subStart:       formatDate(subStart),
      subEnd:         formatDate(subEnd),
      hoursUsed:      hoursUsed,
      hoursTotal:     hoursTotal,
      hoursRemaining: hoursRemaining,
    });
  }

  return reportData;
}

// Форматировать часы: убирать .00, но оставлять .5, .25 и т.д.
function formatHours(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '0';
  // Если число целое — без дробной части
  if (num % 1 === 0) return num.toString();
  // Иначе до 2 знаков, убирая trailing zeros
  return parseFloat(num.toFixed(2)).toString();
}

// Заполнить выпадающий список компаний в фильтре отчёта
function populateReportCompanyFilter() {
  const list = document.getElementById('companyCheckboxList');
  if (!list) return;

  list.innerHTML = '';
  // Показывать только компании с назначенной подпиской
  const companiesWithSub = allCompanies.filter(c => c[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_START]);

  companiesWithSub.forEach(c => {
    const div = document.createElement('div');
    div.className = 'company-checkbox-item';
    
    const label = document.createElement('label');
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = c.ID;
    checkbox.dataset.name = c.TITLE; // dataset автоматически экранирует
    checkbox.onchange = onCompanyCheckboxChange;
    
    const span = document.createElement('span');
    span.textContent = c.TITLE; // textContent автоматически экранирует
    
    label.appendChild(checkbox);
    label.appendChild(span);
    div.appendChild(label);
    list.appendChild(div);
  });

  // Закрывать при клике вне
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('companyDropdown');
    const search = document.getElementById('reportFilterCompanySearch');
    if (dropdown && !dropdown.contains(e.target) && e.target !== search) {
      dropdown.style.display = 'none';
    }
  });
}

function openCompanyDropdown() {
  const dropdown = document.getElementById('companyDropdown');
  if (dropdown) dropdown.style.display = 'block';
}

function filterCompanyDropdown() {
  const query = document.getElementById('reportFilterCompanySearch').value.toLowerCase();
  const items = document.querySelectorAll('#companyCheckboxList > div');
  items.forEach(item => {
    const name = item.querySelector('input').dataset.name.toLowerCase();
    item.style.display = name.includes(query) ? '' : 'none';
  });
  openCompanyDropdown();
}

function toggleSelectAllCompanies(checkbox) {
  const checkboxes = document.querySelectorAll('#companyCheckboxList input[type="checkbox"]');
  checkboxes.forEach(cb => {
    if (!cb.closest('div').style.display || cb.closest('div').style.display !== 'none') {
      cb.checked = checkbox.checked;
    }
  });
  onCompanyCheckboxChange();
}

function onCompanyCheckboxChange() {
  const checked = document.querySelectorAll('#companyCheckboxList input[type="checkbox"]:checked');
  const tagsContainer = document.getElementById('selectedCompanyTags');
  tagsContainer.innerHTML = '';

  checked.forEach(cb => {
    const name = cb.dataset.name; // берём из dataset — безопасно
    const tag = document.createElement('span');
    tag.className = 'company-tag';
    tag.innerHTML = `<span>${escapeHtmlAttr(name)}</span>`;
    const closeBtn = document.createElement('span');
    closeBtn.textContent = '×';
    closeBtn.className = 'close-btn';
    closeBtn.onclick = () => removeCompanyTag(cb.value);
    tag.appendChild(closeBtn);
    tagsContainer.appendChild(tag);
  });

  const all = document.querySelectorAll('#companyCheckboxList input[type="checkbox"]');
  const selectAll = document.getElementById('companySelectAll');
  if (selectAll) selectAll.checked = checked.length === all.length && all.length > 0;

  applyReportFilters();
}

function escapeHtmlAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function removeCompanyTag(companyId) {
  const cb = document.querySelector(`#companyCheckboxList input[value="${companyId}"]`);
  if (cb) { cb.checked = false; onCompanyCheckboxChange(); }
}

function getSelectedCompanyIds() {
  return Array.from(document.querySelectorAll('#companyCheckboxList input[type="checkbox"]:checked'))
    .map(cb => cb.value);
}

function showReportStats(data) {
  if (data.length === 0) {
    document.getElementById('statsContent').innerHTML =
      '<p style="color:#888;">Нет данных по выбранным фильтрам</p>';
    return;
  }

  const cell = 'padding:9px 12px; border:1px solid #000;';
  const cellC = cell + 'text-align:center;';

  let html = '<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:13px;">';

  // Заголовки
  html += `<thead><tr style="background:#1a1a1a;">`;
  const headers = ['Компания','Специалист','Тариф','Начало подписки','Конец подписки','Часов использовано','Часов всего','Часов осталось'];
  headers.forEach(h => {
    html += `<th style="${cell} color:#aaa; font-weight:600;">${h}</th>`;
  });
  html += '</tr></thead><tbody>';

  let totalUsed = 0, totalTotal = 0, totalRemaining = 0;

  data.forEach((row, i) => {
    totalUsed      += row.hoursUsed;
    totalTotal     += row.hoursTotal;
    totalRemaining += row.hoursRemaining;

    const bg = i % 2 === 0 ? '#0e0e0e' : '#111';
    const remaining = row.hoursRemaining;
    const hoursColor = remaining <= 0 ? '#f87171' : remaining <= 2 ? '#fbbf24' : '#e0e0e0';

    html += `<tr style="background:${bg};">`;
    html += `<td style="${cell}">${row.company}</td>`;
    html += `<td style="${cell}">${row.specialist}</td>`;
    html += `<td style="${cellC}">${row.subType}</td>`;
    html += `<td style="${cellC}">${row.subStart}</td>`;
    html += `<td style="${cellC}">${row.subEnd}</td>`;
    html += `<td style="${cellC}">${formatHours(row.hoursUsed)}</td>`;
    html += `<td style="${cellC}">${formatHours(row.hoursTotal)}</td>`;
    html += `<td style="${cellC} color:${hoursColor}; font-weight:500;">${formatHours(row.hoursRemaining)}</td>`;
    html += '</tr>';
  });

  // Строка ИТОГО
  html += `<tr style="background:#1a1a1a; font-weight:bold;">`;
  html += `<td colspan="5" style="${cell}">ИТОГО (${data.length} компаний)</td>`;
  html += `<td style="${cellC}">${formatHours(totalUsed)}</td>`;
  html += `<td style="${cellC}">${formatHours(totalTotal)}</td>`;
  html += `<td style="${cellC}">${formatHours(totalRemaining)}</td>`;
  html += '</tr>';

  html += '</tbody></table></div>';
  document.getElementById('statsContent').innerHTML = html;
}

// ─── ADMIN CHATS ────────────────────────────────────────────

let adminSelectedChatId = null;
let adminSelectedCompany = null;
let adminLastMessageId = 0;
let adminPollingInterval = null;

// { companyId: true/false } — последнее сообщение от клиента, специалист не ответил
let adminUnanswered = {};
// { companyId: timestamp } — время последнего сообщения от клиента
let adminClientLastMsgTime = {};

function renderAdminChatList(filter = '') {
  const container = document.getElementById('adminChatList');
  container.innerHTML = '';

  const filtered = allCompanies.filter(c =>
    c.TITLE.toLowerCase().includes(filter.toLowerCase())
  );

  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding:20px; text-align:center; color:#666; font-size:13px;">Нет компаний</div>';
    return;
  }

  filtered.forEach(company => {
    const subEnd = company[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_END];
    const daysLeft = subEnd
      ? Math.ceil((new Date(subEnd) - new Date()) / (1000 * 60 * 60 * 24))
      : null;

    let subColor = '#4ade80';
    let subText = daysLeft !== null ? `${daysLeft} дн.` : 'Нет подписки';
    if (daysLeft !== null && daysLeft <= 7) subColor = '#f87171';
    else if (daysLeft !== null && daysLeft <= 14) subColor = '#fbbf24';
    if (daysLeft !== null && daysLeft < 0) { subColor = '#666'; subText = 'Истекла'; }

    const isActive = adminSelectedCompany && adminSelectedCompany.ID === company.ID;
    const unansweredStatus = adminUnanswered[company.ID];

    // Тариф
    const subTypeRaw = company[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_TYPE] || '';
    const subType = B24_CONFIG.SUB_TYPE_MAP[subTypeRaw] || subTypeRaw || '—';
    let tariffBg, tariffColor;
    if (daysLeft < 0) { tariffBg = '#3a1a1a'; tariffColor = '#f87171'; }
    else if (daysLeft <= 7) { tariffBg = '#3a2a1a'; tariffColor = '#fbbf24'; }
    else { tariffBg = '#1a3a1a'; tariffColor = '#4ade80'; }
    const tariffBadge = `<span style="background:${tariffBg}; color:${tariffColor}; padding:2px 7px;
      border-radius:5px; font-size:11px; font-weight:500;">${subType}</span>`;

    const div = document.createElement('div');
    div.style.cssText = `padding:14px 16px; border-bottom:1px solid #2a2a2a; cursor:pointer;
      background:${isActive ? '#2a3a4a' : 'transparent'}; transition:background 0.2s;`;
    div.onmouseenter = () => { if (!isActive) div.style.background = '#222'; };
    div.onmouseleave = () => { if (!isActive) div.style.background = 'transparent'; };

    const unansweredBadge = unansweredStatus
      ? `<span style="background:${unansweredStatus === 'red' ? '#ef4444' : '#f97316'};
                      color:#fff; border-radius:50%; width:10px; height:10px;
                      display:inline-block; margin-left:6px; flex-shrink:0;"
                      title="${unansweredStatus === 'red' ? 'Нет ответа более 30 минут!' : 'Нет ответа специалиста'}"></span>`
      : '';

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <span style="font-size:14px; font-weight:600; color:#fff; display:flex; align-items:center; gap:6px;">
          ${company.TITLE}${unansweredBadge}
        </span>
        <span style="font-size:11px; color:${subColor};">${subText}</span>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <span>${tariffBadge}</span>
        <span style="font-size:12px; color:#888;">
          ${company[B24_CONFIG.CRM_FIELDS.COMPANY.HOURS_USED] || 0} /
          ${company[B24_CONFIG.CRM_FIELDS.COMPANY.HOURS_TOTAL] || 0} ч
        </span>
      </div>
    `;

    div.onclick = () => selectAdminChat(company);
    container.appendChild(div);
  });
}

function filterAdminChats() {
  const q = document.getElementById('adminChatSearch').value;
  renderAdminChatList(q);
}

async function selectAdminChat(company) {
  adminSelectedCompany = company;

  // Обновить шапку
  document.getElementById('adminChatTitle').textContent = company.TITLE;

  const subEnd = company[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_END];
  const daysLeft = subEnd
    ? Math.ceil((new Date(subEnd) - new Date()) / (1000 * 60 * 60 * 24))
    : null;
  const subInfo = subEnd
    ? `Подписка до ${formatDate(subEnd)} (${daysLeft} дн.) · ${company[B24_CONFIG.CRM_FIELDS.COMPANY.HOURS_USED] || 0}/${company[B24_CONFIG.CRM_FIELDS.COMPANY.HOURS_TOTAL] || 0} ч`
    : 'Нет подписки';
  document.getElementById('adminChatSubInfo').textContent = subInfo;

  // Получить chatId из поля компании
  const companyData = await B24_API.getCompany(company.ID);
  const chatIdRaw = companyData && companyData[B24_CONFIG.CRM_FIELDS.COMPANY.CHAT_ID];

  const messagesEl = document.getElementById('adminChatMessages');

  if (!chatIdRaw) {
    messagesEl.innerHTML = '<div style="text-align:center; color:#666; font-size:13px; margin-top:40px;">Клиент ещё не начал диалог</div>';
    adminSelectedChatId = null;
    renderAdminChatList();
    return;
  }

  adminSelectedChatId = parseInt(chatIdRaw);
  adminLastMessageId = 0;

  // Загрузить сообщения
  await loadAdminMessages();

  // Перезапустить polling
  if (adminPollingInterval) clearInterval(adminPollingInterval);
  adminPollingInterval = setInterval(pollAdminMessages, B24_CONFIG.POLLING_INTERVAL);

  // Перерисовать список (выделить активную)
  renderAdminChatList(document.getElementById('adminChatSearch').value);
}

async function loadAdminMessages() {
  if (!adminSelectedChatId) return;

  const result = await B24_API.getChatMessages(adminSelectedChatId, 0);
  const messagesEl = document.getElementById('adminChatMessages');

  if (!result || !result.messages) {
    messagesEl.innerHTML = '<div style="text-align:center; color:#666; font-size:13px;">Нет сообщений</div>';
    return;
  }

  messagesEl.innerHTML = '';
  adminLastMessageId = 0;

  const messages = Object.values(result.messages).sort((a, b) => parseInt(a.id) - parseInt(b.id));

  messages.forEach(msg => {
    appendAdminMessage(msg);
    const id = parseInt(msg.id);
    if (id > adminLastMessageId) adminLastMessageId = id;
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function pollAdminMessages() {
  if (!adminSelectedChatId) return;

  const result = await B24_API.getChatMessages(adminSelectedChatId);
  if (!result || !result.messages) return;

  const messages = Object.values(result.messages).sort((a, b) => parseInt(a.id) - parseInt(b.id));
  let hasNew = false;

  messages.forEach(msg => {
    const id = parseInt(msg.id);
    if (id > adminLastMessageId) {
      appendAdminMessage(msg);
      adminLastMessageId = id;
      hasNew = true;
    }
  });

  if (hasNew) {
    const el = document.getElementById('adminChatMessages');
    el.scrollTop = el.scrollHeight;
  }
}

function appendAdminMessage(msg) {
  const el = document.getElementById('adminChatMessages');

  // Не добавлять дубликаты
  if (el.querySelector(`[data-msg-id="${msg.id}"]`)) return;

  let text = msg.text || '';

  // Убрать BB-коды Bitrix24
  text = text.replace(/\[USER=\d+\s+REPLACE\](.*?)\[\/USER\]/gi, '$1');
  text = text.replace(/\[USER=\d+\](.*?)\[\/USER\]/gi, '$1');
  text = text.replace(/\[\/?(B|I|U|S|URL|IMG|CODE|QUOTE)[^\]]*\]/gi, '');

  // Извлечь имя автора из префикса [Имя Фамилия]:
  let authorName = '';
  const prefixMatch = text.match(/^\[([^\]]+)\]:\s*/);
  if (prefixMatch) {
    authorName = prefixMatch[1];
    text = text.replace(prefixMatch[0], '');
  }

  // Системные сообщения (нет префикса и нет author_id или author_id=0)
  const isSystem = (!prefixMatch && (!msg.author_id || msg.author_id == 0));
  if (isSystem) {
    const div = document.createElement('div');
    div.setAttribute('data-msg-id', msg.id);
    div.className = 'message system';
    div.textContent = text;
    el.appendChild(div);
    return;
  }

  // Определить сторону: сообщения с префиксом от специалиста/админа — справа
  // Клиентские сообщения (имя не совпадает с текущим админом) — слева
  const adminName = currentAdmin
    ? `${currentAdmin.NAME} ${currentAdmin.LAST_NAME || ''}`.trim()
    : '';
  const isFromAdmin = authorName && (
    authorName === adminName ||
    // Если нет префикса но есть author_id совпадающий с текущим пользователем
    (!prefixMatch && msg.author_id && String(msg.author_id) === String(currentAdmin?.ID))
  );

  const div = document.createElement('div');
  div.setAttribute('data-msg-id', msg.id);
  div.className = isFromAdmin ? 'message client' : 'message specialist';

  // Парсить URL файла из текста ДО escapeHtml
  let inlineFileHtml = '';
  const urlMatch = text.match(/—\s*(https:\/\/raw\.githubusercontent\.com\/[^\s]+)/);
  if (urlMatch) {
    const url = urlMatch[1];
    text = text.replace(urlMatch[0], '').trim();
    const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
    inlineFileHtml = isImg
      ? `<div class="message-file-inline"><img src="${url}" onclick="window.open('${url}','_blank')" onerror="this.style.display='none'"/></div>`
      : `<div class="message-file-download" onclick="window.open('${url}','_blank')">
          <span class="file-icon">📄</span>
          <div class="file-label">Скачать файл</div>
        </div>`;
  }

  const specialistNames = allSpecialists.map(s => `${s.NAME} ${s.LAST_NAME || ''}`.trim().toLowerCase());
  const authorColor = getAdminAuthorColor(authorName || '', isFromAdmin, specialistNames);

  div.innerHTML = `
    ${authorName ? `<div class="message-author" style="color:${authorColor};">${escapeAdminHtml(authorName)}</div>` : ''}
    <div class="message-text">${escapeAdminHtml(text)}</div>
    ${msg.fileUrl ? renderAdminFile(msg.fileUrl, msg.fileName, msg.fileType, msg.fileSize, isFromAdmin) : inlineFileHtml}
    <div class="message-time">${formatAdminTime(msg.date)}</div>
  `;

  el.appendChild(div);
}

function renderAdminFile(url, name, type, size, isFromAdmin) {
  if (type && type.startsWith('image/')) {
    return `<div class="message-file-inline">
      <img src="${url}" alt="${escapeAdminHtml(name || '')}"
        onclick="window.open('${url}','_blank')"
        onerror="this.style.display='none'"
      />
    </div>`;
  }
  return `<div class="message-file-download" onclick="window.open('${url}','_blank')">
    <span class="file-icon">📄</span>
    <div>
      <div class="file-label" style="font-weight:500;">${escapeAdminHtml(name || '')}</div>
      ${size ? `<div style="font-size:11px; opacity:0.7;">${size}</div>` : ''}
    </div>
  </div>`;
}

async function sendAdminMessage() {
  const input = document.getElementById('adminMessageInput');
  const text = input.value.trim();
  if (!text || !adminSelectedChatId || !currentAdmin) return;

  const name = `${currentAdmin.NAME} ${currentAdmin.LAST_NAME || ''}`.trim();
  const result = await B24_API.sendMessage(adminSelectedChatId, text, name);

  if (result) {
    input.value = '';
    input.style.height = 'auto';
    appendAdminMessage({
      id: result,
      author_id: currentAdmin.ID,
      text: `[${name}]: ${text}`,
      date: new Date().toISOString(),
    });
    adminLastMessageId = Math.max(adminLastMessageId, parseInt(result) || adminLastMessageId);
    const el = document.getElementById('adminChatMessages');
    el.scrollTop = el.scrollHeight;
  }
}

function attachAdminFile() {
  document.getElementById('adminFileInput').click();
}

async function handleAdminFileSelect() {
  const input = document.getElementById('adminFileInput');
  const file = input.files[0];
  if (!file) return;

  if (file.size > B24_CONFIG.MAX_FILE_SIZE) {
    alert(`Файл слишком большой. Максимум ${B24_CONFIG.MAX_FILE_SIZE / 1024 / 1024} МБ.`);
    input.value = '';
    return;
  }

  if (!B24_CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
    alert('Этот тип файла не поддерживается.');
    input.value = '';
    return;
  }

  const btn = document.getElementById('adminAttachBtn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    const base64 = await fileToBase64Admin(file);
    const fileSize = formatFileSizeAdmin(file.size);
    const isImage = file.type.startsWith('image/');
    const adminName = `${currentAdmin.NAME} ${currentAdmin.LAST_NAME || ''}`.trim();

    // Загрузить на GitHub через Cloudflare Worker
    const uploadResp = await fetch(B24_CONFIG.PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upload',
        fileName: file.name,
        fileBase64: base64,
      }),
    });

    const uploadData = await uploadResp.json();


    if (!uploadData.ok || !uploadData.url) {
      throw new Error('No URL: ' + JSON.stringify(uploadData));
    }

    const fileUrl = uploadData.url;
    const msgResult = await B24_API.call('im.message.add', {
      DIALOG_ID: `chat${adminSelectedChatId}`,
      MESSAGE: `[${adminName}]: ${isImage ? '🖼' : '📎'} ${file.name} (${fileSize}) — ${fileUrl}`,
    });

    if (msgResult) {
      appendAdminMessage({
        id: msgResult,
        author_id: currentAdmin.ID,
        text: `[${adminName}]: ${isImage ? '🖼' : '📎'} ${file.name} (${fileSize}) — ${fileUrl}`,
        date: new Date().toISOString(),
        fileUrl,
        fileName: file.name,
        fileType: file.type,
        fileSize,
      });
      adminLastMessageId = Math.max(adminLastMessageId, parseInt(msgResult) || adminLastMessageId);
      const el = document.getElementById('adminChatMessages');
      el.scrollTop = el.scrollHeight;
    }
  } catch (e) {

    alert('Ошибка при загрузке файла: ' + e.message);
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '📎'; }
  input.value = '';
}

function fileToBase64Admin(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatFileSizeAdmin(bytes) {
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / 1024 / 1024).toFixed(1) + ' МБ';
}

function escapeAdminHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Цвет ника: администратор — зелёный, специалист — синий, клиент — по хешу
function getAdminAuthorColor(authorName, isFromAdmin, allSpecialistNames) {
  if (isFromAdmin) return '#4ade80'; // Администратор — зелёный
  if (allSpecialistNames && allSpecialistNames.includes(authorName.toLowerCase())) return '#0ea5e9'; // Специалист — синий
  // Клиент — по хешу имени (исключены зелёный #4ade80 и синий #0ea5e9)
  const colors = ['#f87171','#fb923c','#fbbf24','#22d3ee','#a78bfa','#f472b6','#e879f9'];
  let hash = 0;
  for (let i = 0; i < authorName.length; i++) hash = authorName.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function formatAdminTime(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ─── START ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);



// ─── ADMIN UNANSWERED POLLING ────────────────────────────────

let adminUnansweredInterval = null;

function startAdminUnansweredPolling() {
  if (adminUnansweredInterval) return; // Уже запущен

  // Сразу проверить
  checkUnansweredChats();

  // Затем каждые 30 секунд
  adminUnansweredInterval = setInterval(checkUnansweredChats, 30000);
}

async function checkUnansweredChats() {


  const specialistNames = allSpecialists.map(s =>
    `${s.NAME} ${s.LAST_NAME || ''}`.trim().toLowerCase()
  );

  const now = Date.now();
  const THIRTY_MIN = 30 * 60 * 1000;

  for (const company of allCompanies) {
    const chatIdRaw = company[B24_CONFIG.CRM_FIELDS.COMPANY.CHAT_ID];
    if (!chatIdRaw) continue;

    const chatId = parseInt(chatIdRaw);

    // Тариф компании
    const subTypeRaw = company[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_TYPE] || '';
    const subType = B24_CONFIG.SUB_TYPE_MAP[subTypeRaw] || '';
    const isEnterprise = subType === 'Энтерпрайз';

    try {
      const result = await B24_API.getChatMessages(chatId);
      if (!result || !result.messages) continue;

      const messages = Object.values(result.messages)
        .filter(m => m.author_id && m.author_id != 0)
        .sort((a, b) => parseInt(b.id) - parseInt(a.id));

      if (messages.length === 0) continue;

      const lastMsg = messages[0];
      const lastText = lastMsg.text || '';
      const prefixMatch = lastText.match(/^\[([^\]]+)\]:\s/);

      if (!prefixMatch) continue;

      const authorName = prefixMatch[1].trim().toLowerCase();
      const isFromSpecialist = specialistNames.some(name => name === authorName);

      if (!isFromSpecialist) {
        // Сохранить время первого клиентского сообщения (если ещё не сохранено)
        if (!adminClientLastMsgTime[company.ID]) {
          adminClientLastMsgTime[company.ID] = lastMsg.date
            ? new Date(lastMsg.date).getTime()
            : now;
        }

        const waitTime = now - adminClientLastMsgTime[company.ID];
        const isOverdue = isEnterprise && waitTime >= THIRTY_MIN;

        adminUnanswered[company.ID] = isOverdue ? 'red' : 'orange';

      } else {
        delete adminUnanswered[company.ID];
        delete adminClientLastMsgTime[company.ID];

      }
    } catch (e) {

    }
  }

  const q = document.getElementById('adminChatSearch')?.value || '';
  renderAdminChatList(q);
}
