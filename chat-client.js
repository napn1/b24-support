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

  // Сохранить chatId в отдельное поле компании
  await B24_API.updateCompany(session.companyId, {
    [B24_CONFIG.CRM_FIELDS.COMPANY.CHAT_ID]: String(chatId),
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

  // Парсить URL из текста ДО escapeHtml
  let inlineFileHtml = '';
  const urlMatch = text.match(/—\s*(https:\/\/raw\.githubusercontent\.com\/[^\s]+)/);
  if (urlMatch) {
    const url = urlMatch[1];
    text = text.replace(urlMatch[0], '').trim();
    const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
    inlineFileHtml = isImg
      ? `<div style="margin-top:6px;"><img src="${url}"
          style="max-width:220px;max-height:180px;border-radius:8px;cursor:pointer;display:block;"
          onclick="window.open('${url}','_blank')" onerror="this.style.display='none'"/></div>`
      : `<div style="margin-top:6px;display:flex;align-items:center;gap:8px;
          background:rgba(0,0,0,0.2);border-radius:8px;padding:8px 10px;cursor:pointer;"
          onclick="window.open('${url}','_blank')">
          <span style="font-size:18px;">📄</span>
          <div style="font-size:13px;">Скачать файл</div>
        </div>`;
  }

  // Проверить есть ли вложение файла (из локального добавления)
  const fileHtml = msg.fileUrl ? renderFileAttachment(msg.fileUrl, msg.fileName, msg.fileType, msg.fileSize) : '';

  div.innerHTML = `
    ${authorName ? `<div class="message-author" style="color:${getAuthorColor(authorName, isClient)};">${escapeHtml(authorName)}</div>` : ''}
    <div class="message-text">${escapeHtml(text)}</div>
    ${inlineFileHtml}
    ${fileHtml}
    <div class="message-time">${formatTime(msg.date)}</div>
  `;

  container.appendChild(div);
}

function renderFileAttachment(url, name, type, size) {
  if (type && type.startsWith('image/')) {
    return `<div style="margin-top:6px;">
      <img src="${url}" alt="${escapeHtml(name)}"
        style="max-width:220px; max-height:180px; border-radius:8px; cursor:pointer; display:block;"
        onclick="window.open('${url}','_blank')"
        onerror="this.style.display='none'"
      />
    </div>`;
  }
  return `<div style="margin-top:6px; display:flex; align-items:flex-start; gap:8px;
    background:rgba(0,0,0,0.2); border-radius:8px; padding:8px 10px; cursor:pointer; min-width:0;"
    onclick="window.open('${url}','_blank')">
    <span style="font-size:18px; flex-shrink:0;">📄</span>
    <div style="min-width:0; overflow:hidden;">
      <div style="font-size:13px; font-weight:500; word-break:break-all; overflow-wrap:break-word;">${escapeHtml(name)}</div>
      ${size ? `<div style="font-size:11px; opacity:0.7;">${size}</div>` : ''}
    </div>
  </div>`;
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
    alert(`Файл слишком большой. Максимум ${B24_CONFIG.MAX_FILE_SIZE / 1024 / 1024} МБ.`);
    input.value = '';
    return;
  }

  // Проверка типа
  if (!B24_CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
    alert('Этот тип файла не поддерживается.');
    input.value = '';
    return;
  }

  // Показать индикатор загрузки
  const btn = document.getElementById('btnSend');
  const attachBtn = document.querySelector('.btn-attach');
  attachBtn.disabled = true;
  attachBtn.innerHTML = '<span style="font-size:11px;">...</span>';

  try {
    await uploadAndSendFile(file);
  } catch (e) {
    console.error('File upload error:', e);
    alert('Ошибка при загрузке файла');
  }

  attachBtn.disabled = false;
  attachBtn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
  </svg>`;
  input.value = '';
}

async function uploadAndSendFile(file) {
  const base64 = await fileToBase64(file);
  const fileSize = formatFileSize(file.size);
  const isImage = file.type.startsWith('image/');

  // Загрузить файл на GitHub через Cloudflare Worker
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
    throw new Error('Не удалось загрузить файл: ' + JSON.stringify(uploadData));
  }

  const fileUrl = uploadData.url;

  // Отправить сообщение со ссылкой
  const msgResult = await B24_API.sendMessage(chatId,
    `${isImage ? '🖼' : '📎'} ${file.name} (${fileSize}) — ${fileUrl}`,
    session.name
  );

  if (msgResult) {
    appendMessage({
      id: msgResult,
      author_id: 'client',
      // Текст без URL — превью рендерится через fileUrl
      text: `[${session.name}]: ${isImage ? '🖼' : '📎'} ${file.name} (${fileSize})`,
      date: new Date().toISOString(),
      fileUrl,
      fileName: file.name,
      fileType: file.type,
      fileSize,
    });
    lastMessageId = Math.max(lastMessageId, parseInt(msgResult) || lastMessageId);
    scrollToBottom();
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Убрать префикс "data:...;base64,"
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / 1024 / 1024).toFixed(1) + ' МБ';
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

// Цвет ника по имени автора
// Специалист — синий, клиент — уникальный цвет по хешу имени
function getAuthorColor(authorName, isClient) {
  if (!isClient) return '#0ea5e9'; // Специалист — синий

  // Для клиентов — детерминированный цвет по имени (исключены зелёный и синий)
  const colors = [
    '#f87171', // красный
    '#fb923c', // оранжевый
    '#fbbf24', // жёлтый
    '#22d3ee', // голубой
    '#a78bfa', // фиолетовый
    '#f472b6', // розовый
    '#e879f9', // пурпурный
  ];
  let hash = 0;
  for (let i = 0; i < authorName.length; i++) {
    hash = authorName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

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
