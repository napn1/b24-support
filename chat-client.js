// ============================================================
// CHAT CLIENT вЂ” Р»РѕРіРёРєР° РєР»РёРµРЅС‚СЃРєРѕРіРѕ С‡Р°С‚Р°
// ============================================================

let session = null;
let chatId = null;
let lastMessageId = 0;
let pollingInterval = null;

// в”Ђв”Ђв”Ђ INIT в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

async function init() {
  session = B24_AUTH.requireAuth();
  if (!session) return;

  // РћС‚РѕР±СЂР°Р·РёС‚СЊ РґР°РЅРЅС‹Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
  document.getElementById('userName').textContent = session.name;
  document.getElementById('companyName').textContent = session.companyName;
  
  const avatar = session.companyName ? session.companyName.charAt(0).toUpperCase() : '?';
  document.getElementById('companyAvatar').textContent = avatar;

  // РћР±РЅРѕРІРёС‚СЊ СЃС‚Р°С‚СѓСЃ РїРѕРґРїРёСЃРєРё
  updateSubscriptionBadge();

  // РџРѕР»СѓС‡РёС‚СЊ РёР»Рё СЃРѕР·РґР°С‚СЊ С‡Р°С‚ РєРѕРјРїР°РЅРёРё
  await initChat();

  // Р—Р°РіСЂСѓР·РёС‚СЊ РёСЃС‚РѕСЂРёСЋ
  await loadMessages();

  // Р—Р°РїСѓСЃС‚РёС‚СЊ polling
  startPolling();

  // РђРІС‚РѕСѓРІРµР»РёС‡РµРЅРёРµ textarea
  const input = document.getElementById('messageInput');
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  });

  // РћС‚РїСЂР°РІРєР° РїРѕ Enter (Shift+Enter = РЅРѕРІР°СЏ СЃС‚СЂРѕРєР°)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

// в”Ђв”Ђв”Ђ CHAT в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

async function initChat() {
  if (!session.companyId) {
    showError('РљРѕРјРїР°РЅРёСЏ РЅРµ РїСЂРёРІСЏР·Р°РЅР° Рє РІР°С€РµРјСѓ Р°РєРєР°СѓРЅС‚Сѓ');
    return;
  }

  const chat = await B24_API.getOrCreateCompanyChat(
    session.companyId,
    session.companyName
  );

  if (!chat || !chat.ID) {
    showError('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ С‡Р°С‚');
    return;
  }

  chatId = chat.ID;

  // РЎРѕС…СЂР°РЅРёС‚СЊ chatId РІ РѕС‚РґРµР»СЊРЅРѕРµ РїРѕР»Рµ РєРѕРјРїР°РЅРёРё
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
    // Р”РѕР±Р°РІРёС‚СЊ СЃРІРѕС‘ СЃРѕРѕР±С‰РµРЅРёРµ СЃСЂР°Р·Сѓ, РЅРµ РїРµСЂРµР·Р°РіСЂСѓР¶Р°СЏ РІРµСЃСЊ С‡Р°С‚
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

  // РќРµ РґРѕР±Р°РІР»СЏС‚СЊ РґСѓР±Р»РёРєР°С‚С‹
  if (document.querySelector(`[data-msg-id="${msg.id}"]`)) return;

  const div = document.createElement('div');
  div.setAttribute('data-msg-id', msg.id);

  let text = msg.text || '';

  // РЈР±СЂР°С‚СЊ BB-РєРѕРґС‹ Bitrix24
  text = text.replace(/\[USER=\d+\s+REPLACE\](.*?)\[\/USER\]/gi, '$1');
  text = text.replace(/\[USER=\d+\](.*?)\[\/USER\]/gi, '$1');
  text = text.replace(/\[\/?(B|I|U|S|URL|IMG|CODE|QUOTE)[^\]]*\]/gi, '');

  // РР·РІР»РµС‡СЊ РёРјСЏ Р°РІС‚РѕСЂР° РёР· РїСЂРµС„РёРєСЃР° [РРјСЏ]: РµСЃР»Рё РµСЃС‚СЊ
  let authorName = '';
  const prefixMatch = text.match(/^\[([^\]]+)\]:\s*/);
  if (prefixMatch) {
    authorName = prefixMatch[1];
    text = text.replace(prefixMatch[0], '');
  }

  // РћРїСЂРµРґРµР»РёС‚СЊ СЃС‚РѕСЂРѕРЅСѓ: РєР»РёРµРЅС‚ вЂ” РµСЃР»Рё РёРјСЏ СЃРѕРІРїР°РґР°РµС‚ СЃ РЅР°С€РёРј
  const isClient = authorName === session.name;

  // РЎРёСЃС‚РµРјРЅС‹Рµ СЃРѕРѕР±С‰РµРЅРёСЏ вЂ” С‚РѕР»СЊРєРѕ С‚Рµ Сѓ РєРѕС‚РѕСЂС‹С… РЅРµС‚ author_id Р РЅРµС‚ РїСЂРµС„РёРєСЃР°
  // РЎРѕРѕР±С‰РµРЅРёСЏ РѕС‚ СЃРїРµС†РёР°Р»РёСЃС‚Р° РјРѕРіСѓС‚ РЅРµ РёРјРµС‚СЊ РїСЂРµС„РёРєСЃР° РЅРѕ РёРјРµС‚СЊ author_id
  const isSystem = (!msg.author_id || msg.author_id == 0) && !authorName;
  if (isSystem) {
    div.className = 'message system';
    div.innerHTML = `<div style="color:#666; font-size:12px; text-align:center; padding:4px 0;">${escapeHtml(text)}</div>`;
    container.appendChild(div);
    return;
  }

  // Р•СЃР»Рё РЅРµС‚ РїСЂРµС„РёРєСЃР° РЅРѕ РµСЃС‚СЊ author_id вЂ” СЌС‚Рѕ СЃРѕРѕР±С‰РµРЅРёРµ РѕС‚ СЃРїРµС†РёР°Р»РёСЃС‚Р°/Р°РґРјРёРЅР°
  // РѕС‚РїСЂР°РІР»РµРЅРЅРѕРµ РЅР°РїСЂСЏРјСѓСЋ С‡РµСЂРµР· Bitrix24 (РЅРµ С‡РµСЂРµР· РЅР°С€ РІРµР±С…СѓРє)
  const side = isClient ? 'client' : 'specialist';
  // Р•СЃР»Рё РЅРµС‚ РёРјРµРЅРё Р°РІС‚РѕСЂР° вЂ” РїРѕРєР°Р·С‹РІР°РµРј "РЎРїРµС†РёР°Р»РёСЃС‚"
  if (!authorName && !isClient) {
    authorName = 'РЎРїРµС†РёР°Р»РёСЃС‚';
  }

  div.className = `message ${side}`;

  // РџР°СЂСЃРёС‚СЊ URL РёР· С‚РµРєСЃС‚Р° Р”Рћ escapeHtml
  let inlineFileHtml = '';
  const urlMatch = text.match(/вЂ”\s*(https:\/\/raw\.githubusercontent\.com\/[^\s]+)/);
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
          <span style="font-size:18px;">рџ“„</span>
          <div style="font-size:13px;">РЎРєР°С‡Р°С‚СЊ С„Р°Р№Р»</div>
        </div>`;
  }

  // РџСЂРѕРІРµСЂРёС‚СЊ РµСЃС‚СЊ Р»Рё РІР»РѕР¶РµРЅРёРµ С„Р°Р№Р»Р° (РёР· Р»РѕРєР°Р»СЊРЅРѕРіРѕ РґРѕР±Р°РІР»РµРЅРёСЏ)
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
    <span style="font-size:18px; flex-shrink:0;">рџ“„</span>
    <div style="min-width:0; overflow:hidden;">
      <div style="font-size:13px; font-weight:500; word-break:break-all; overflow-wrap:break-word;">${escapeHtml(name)}</div>
      ${size ? `<div style="font-size:11px; opacity:0.7;">${size}</div>` : ''}
    </div>
  </div>`;
}

// в”Ђв”Ђв”Ђ POLLING в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

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

// в”Ђв”Ђв”Ђ FILES в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function attachFile() {
  document.getElementById('fileInput').click();
}

async function handleFileSelect() {
  const input = document.getElementById('fileInput');
  const file = input.files[0];
  if (!file) return;

  // РџСЂРѕРІРµСЂРєР° СЂР°Р·РјРµСЂР°
  if (file.size > B24_CONFIG.MAX_FILE_SIZE) {
    alert(`Р¤Р°Р№Р» СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕР№. РњР°РєСЃРёРјСѓРј ${B24_CONFIG.MAX_FILE_SIZE / 1024 / 1024} РњР‘.`);
    input.value = '';
    return;
  }

  // РџСЂРѕРІРµСЂРєР° С‚РёРїР°
  if (!B24_CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
    alert('Р­С‚РѕС‚ С‚РёРї С„Р°Р№Р»Р° РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ.');
    input.value = '';
    return;
  }

  // РџРѕРєР°Р·Р°С‚СЊ РёРЅРґРёРєР°С‚РѕСЂ Р·Р°РіСЂСѓР·РєРё
  const btn = document.getElementById('btnSend');
  const attachBtn = document.querySelector('.btn-attach');
  attachBtn.disabled = true;
  attachBtn.innerHTML = '<span style="font-size:11px;">...</span>';

  try {
    await uploadAndSendFile(file);
  } catch (e) {
    console.error('File upload error:', e);
    alert('РћС€РёР±РєР° РїСЂРё Р·Р°РіСЂСѓР·РєРµ С„Р°Р№Р»Р°');
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

  // Р—Р°РіСЂСѓР·РёС‚СЊ С„Р°Р№Р» РЅР° GitHub С‡РµСЂРµР· Cloudflare Worker
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
    throw new Error('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ С„Р°Р№Р»: ' + JSON.stringify(uploadData));
  }

  const fileUrl = uploadData.url;

  // РћС‚РїСЂР°РІРёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ СЃРѕ СЃСЃС‹Р»РєРѕР№
  const msgResult = await B24_API.sendMessage(chatId,
    `${isImage ? 'рџ–ј' : 'рџ“Ћ'} ${file.name} (${fileSize}) вЂ” ${fileUrl}`,
    session.name
  );

  if (msgResult) {
    appendMessage({
      id: msgResult,
      author_id: 'client',
      // РўРµРєСЃС‚ Р±РµР· URL вЂ” РїСЂРµРІСЊСЋ СЂРµРЅРґРµСЂРёС‚СЃСЏ С‡РµСЂРµР· fileUrl
      text: `[${session.name}]: ${isImage ? 'рџ–ј' : 'рџ“Ћ'} ${file.name} (${fileSize})`,
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
      // РЈР±СЂР°С‚СЊ РїСЂРµС„РёРєСЃ "data:...;base64,"
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' Р‘';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' РљР‘';
  return (bytes / 1024 / 1024).toFixed(1) + ' РњР‘';
}

// в”Ђв”Ђв”Ђ SUBSCRIPTION в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function updateSubscriptionBadge() {
  if (!session.companyData) return;

  const subEnd = session.companyData[B24_CONFIG.CRM_FIELDS.COMPANY.SUB_END];
  if (!subEnd) {
    document.getElementById('subBadge').textContent = 'РќРµС‚ РїРѕРґРїРёСЃРєРё';
    document.getElementById('subBadge').className = 'subscription-badge expired';
    return;
  }

  const endDate = new Date(subEnd);
  const now = new Date();
  const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

  const badge = document.getElementById('subBadge');

  if (daysLeft < 0) {
    badge.textContent = 'РџРѕРґРїРёСЃРєР° РёСЃС‚РµРєР»Р°';
    badge.className = 'subscription-badge expired';
  } else if (daysLeft <= 7) {
    badge.textContent = `РћСЃС‚Р°Р»РѕСЃСЊ ${daysLeft} РґРЅ.`;
    badge.className = 'subscription-badge expiring';
  } else {
    badge.textContent = `РђРєС‚РёРІРЅР° (${daysLeft} РґРЅ.)`;
    badge.className = 'subscription-badge active';
  }
}

// в”Ђв”Ђв”Ђ UTILS в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

// Р¦РІРµС‚ РЅРёРєР° РїРѕ РёРјРµРЅРё Р°РІС‚РѕСЂР°
// РЎРїРµС†РёР°Р»РёСЃС‚ вЂ” РІР°СЃРёР»СЊРєРѕРІС‹Р№, РєР»РёРµРЅС‚ вЂ” СѓРЅРёРєР°Р»СЊРЅС‹Р№ С†РІРµС‚ РїРѕ С…РµС€Сѓ РёРјРµРЅРё
function getAuthorColor(authorName, isClient) {
  if (!isClient) return '#5b9cf6'; // РЎРїРµС†РёР°Р»РёСЃС‚ вЂ” РІР°СЃРёР»СЊРєРѕРІС‹Р№

  // Р”Р»СЏ РєР»РёРµРЅС‚РѕРІ вЂ” РґРµС‚РµСЂРјРёРЅРёСЂРѕРІР°РЅРЅС‹Р№ С†РІРµС‚ РїРѕ РёРјРµРЅРё
  const colors = [
    '#f87171', // РєСЂР°СЃРЅС‹Р№
    '#fb923c', // РѕСЂР°РЅР¶РµРІС‹Р№
    '#fbbf24', // Р¶С‘Р»С‚С‹Р№
    '#34d399', // Р·РµР»С‘РЅС‹Р№
    '#22d3ee', // РіРѕР»СѓР±РѕР№
    '#a78bfa', // С„РёРѕР»РµС‚РѕРІС‹Р№
    '#f472b6', // СЂРѕР·РѕРІС‹Р№
    '#4ade80', // СЃРІРµС‚Р»Рѕ-Р·РµР»С‘РЅС‹Р№
    '#60a5fa', // СЃРёРЅРёР№
    '#e879f9', // РїСѓСЂРїСѓСЂРЅС‹Р№
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
  // РџСЂРѕСЃС‚РѕР№ beep С‡РµСЂРµР· Web Audio API
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
    // РРіРЅРѕСЂРёСЂСѓРµРј РµСЃР»Рё РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ
  }
}

let originalTitle = document.title;
let titleFlashInterval = null;

function flashTitle() {
  if (titleFlashInterval) return; // РЈР¶Рµ РјРёРіР°РµС‚

  let toggle = false;
  titleFlashInterval = setInterval(() => {
    document.title = toggle ? originalTitle : 'рџ’¬ РќРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ';
    toggle = !toggle;
  }, 1000);

  // РћСЃС‚Р°РЅРѕРІРёС‚СЊ С‡РµСЂРµР· 5 СЃРµРєСѓРЅРґ
  setTimeout(() => {
    clearInterval(titleFlashInterval);
    titleFlashInterval = null;
    document.title = originalTitle;
  }, 5000);
}

// в”Ђв”Ђв”Ђ START в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

init();
