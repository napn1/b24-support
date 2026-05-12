// ============================================================
// CHAT CLIENT — логика клиентского чата
// ============================================================

let session = null;
let chatId = null;
let lastMessageId = 0;
let pollingInterval = null;

// ─── INIT ───────────────────────────────────────────────────

async function init() {
  session = B24_AUTH.requireAuth();
  if (!session) return;

  // Отобразить данные пользователя
  document.getElementById('userName').textContent = session.name;
  document.getElementById('companyName').textContent = session.companyName;
  
  const avatar = session.companyName ? session.companyName.charAt(0).toUpperCase() : '?';
  document.getElementById('companyAvatar').textContent = avatar;

  // Обновить статус подписки
  updateSubscriptionBadge();

  // Получить или создать чат компании
  await initChat();

  // Загрузить историю
  await loadMessages();

  // Запустить polling
  startPolling();

  // Автоувеличение textarea
  const input = document.getElementById('messageInput');
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  });

  // Отправка по Enter (Shift+Enter = новая строка)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

// ─── CHAT ───────────────────────────────────────────────────

async function initChat() {
  if (!session.companyId) {
    showError('Компания не привязана к вашему аккаунту');
    return;
  }

  const chat = await B24_API.getOrCreateCompanyChat(
    session.companyId,
    session.companyName
  );

  if (!chat || !chat.ID) {
    showError('Не удалось создать чат');
    return;
  }

  chatId = chat.ID;

  // Сохранить chatId в данных компании (для специалистов)
  await B24_API.updateCompany(session.companyId, {
    COMMENTS: `ChatID: ${chatId}`,
  });
}

async function loadMessages() {
  if (!chatId) return;

  const result = await B24_API.getChatMessages(chatId);
  if (!result || !result.messages) return;

  const container = document.getElementById('chatMessages');
  container.innerHTML = '';
  lastMessageId = 0;

  const messages = Object.values(result.messages).sort((a, b) => parseInt(a.id) - parseInt(b.id));

  messages.forEach(msg => {
    appendMessage(msg);
    const id = parseInt(msg.id);
    if (id > lastMessageId) lastMessageId = id;
  });

  scrollToBottom();
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text || !chatId) return;

  const btn = document.getElementById('btnSend');
  btn.disabled = true;

  const result = await B24_API.sendMessage(chatId, text, session.name);

  if (result) {
    input.value = '';
    input.style.height = 'auto';
    // Добавить своё сообщение сразу, не перезагружая весь чат
    appendMessage({
      id: result,
      author_id: 'client',
      text: `[${session.name}]: ${text}`,
      date: new Date().toISOString(),
    });
    lastMessageId = Math.max(lastMessageId, parseInt(result) || lastMessageId);
    scrollToBottom();
  }

  btn.disabled = false;
  input.focus();
}

function appendMessage(msg) {
  const container = document.getElementById('chatMessages');

  // Не добавлять дубликаты
  if (document.querySelector(`[data-msg-id="${msg.id}"]`)) return;

  const div = document.createElement('div');
  div.setAttribute('data-msg-id', msg.id);

  let text = msg.text || '';

  // Убрать BB-коды Bitrix24
  text = text.replace(/\[USER=\d+\s+REPLACE\](.*?)\[\/USER\]/gi, '$1');
  text = text.replace(/\[USER=\d+\](.*?)\[\/USER\]/gi, '$1');
  text = text.replace(/\[\/?(B|I|U|S|URL|IMG|CODE|QUOTE)[^\]]*\]/gi, '');

  // Извлечь имя автора из префикса [Имя]: если есть
  let authorName = '';
  const prefixMatch = text.match(/^\[([^\]]+)\]:\s*/);
  if (prefixMatch) {
    authorName = prefixMatch[1];
    text = text.replace(prefixMatch[0], '');
  }

  // Определить сторону: клиент — если имя совпадает с нашим
  const isClient = authorName === session.name;

  // Системные сообщения — только те у которых нет author_id И нет префикса
  // Сообщения от специалиста могут не иметь префикса но иметь author_id
  const isSystem = (!msg.author_id || msg.author_id == 0) && !authorName;
  if (isSystem) {
    div.className = 'message system';
    div.innerHTML = `<div style="color:#666; font-size:12px; text-align:center; padding:4px 0;">${escapeHtml(text)}</div>`;
    container.appendChild(div);
    return;
  }

  // Если нет префикса но есть author_id — это сообщение от специалиста/админа
  // отправленное напрямую через Bitrix24 (не через наш вебхук)
  const side = isClient ? 'client' : 'specialist';
  // Если нет имени автора — показываем "Специалист"
  if (!authorName && !isClient) {
    authorName = 'Специалист';
  }

  div.className = `message ${side}`;

  div.innerHTML = `
    ${authorName ? `<div class="message-author">${escapeHtml(authorName)}</div>` : ''}
    <div class="message-text">${escapeHtml(text)}</div>
    <div class="message-time">${formatTime(msg.date)}</div>
  `;

  container.appendChild(div);
}

// ─── POLLING ────────────────────────────────────────────────

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);

  pollingInterval = setInterval(async () => {
    if (!chatId) return;

    const result = await B24_API.getChatMessages(chatId);
    if (!result || !result.messages) return;

    const messages = Object.values(result.messages).sort((a, b) => parseInt(a.id) - parseInt(b.id));
    let hasNew = false;

    messages.forEach(msg => {
      const id = parseInt(msg.id);
      if (id > lastMessageId) {
        appendMessage(msg);
        lastMessageId = id;
        hasNew = true;
      }
    });

    if (hasNew) {
      scrollToBottom();
      playNotificationSound();
      flashTitle();
    }
  }, B24_CONFIG.POLLING_INTERVAL);
}

// ─── FILES ──────────────────────────────────────────────────

function attachFile() {
  document.getElementById('fileInput').click();
}

async function handleFileSelect() {
  const input = document.getElementById('fileInput');
  const file = input.files[0];
  if (!file) return;

  // Проверка размера
  if (file.size > B24_CONFIG.MAX_FILE_SIZE) {
    alert('Файл слишком большой. Максимум 3 МБ.');
    return;
  }

  // Проверка типа
  if (!B24_CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
    alert('Этот тип файла не поддерживается.');
    return;
  }

  // TODO: загрузка файла на Диск через REST API
  // Пока заглушка
  alert('Загрузка файлов будет реализована в следующей версии');

  input.value = '';
}

// ─── SUBSCRIPTION ───────────────────────────────────────────

function updateSubscriptionBadge() {
  if (!session.companyData) return;

  const subEnd = session.companyData[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_END];
  if (!subEnd) {
    document.getElementById('subBadge').textContent = 'Нет подписки';
    document.getElementById('subBadge').className = 'subscription-badge expired';
    return;
  }

  const endDate = new Date(subEnd);
  const now = new Date();
  const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

  const badge = document.getElementById('subBadge');

  if (daysLeft < 0) {
    badge.textContent = 'Подписка истекла';
    badge.className = 'subscription-badge expired';
  } else if (daysLeft <= 7) {
    badge.textContent = `Осталось ${daysLeft} дн.`;
    badge.className = 'subscription-badge expiring';
  } else {
    badge.textContent = `Активна (${daysLeft} дн.)`;
    badge.className = 'subscription-badge active';
  }
}

// ─── UTILS ──────────────────────────────────────────────────

function scrollToBottom() {
  const container = document.getElementById('chatMessages');
  container.scrollTop = container.scrollHeight;
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(msg) {
  const container = document.getElementById('chatMessages');
  container.innerHTML = `<div class="loader" style="color: #f87171;">${msg}</div>`;
}

function playNotificationSound() {
  // Простой beep через Web Audio API
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.1;
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    // Игнорируем если не поддерживается
  }
}

let originalTitle = document.title;
let titleFlashInterval = null;

function flashTitle() {
  if (titleFlashInterval) return; // Уже мигает

  let toggle = false;
  titleFlashInterval = setInterval(() => {
    document.title = toggle ? originalTitle : '💬 Новое сообщение';
    toggle = !toggle;
  }, 1000);

  // Остановить через 5 секунд
  setTimeout(() => {
    clearInterval(titleFlashInterval);
    titleFlashInterval = null;
    document.title = originalTitle;
  }, 5000);
}

// ─── START ──────────────────────────────────────────────────

init();
