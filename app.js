
import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentConversationId = null;
let realtimeChannel = null;
let conversations = [];
let authMode = "login";

/* ---------- AUTHENTICATION ---------- */

function showAuthMessage(message, error = false) {
  $("auth-message").textContent = message;
  $("auth-message").style.color = error ? "#FCA5A5" : "#38BDF8";
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";

  $("auth-title").textContent = signup ? "Создать аккаунт" : "С возвращением";
  $("auth-subtitle").textContent = signup
    ? "Зарегистрируйся в ORBIT."
    : "Войди в свой аккаунт ORBIT.";

  $("name-group").hidden = !signup;
  $("switch-text").innerHTML = signup
    ? 'Уже есть аккаунт? <button id="switch-mode" type="button">Войти</button>'
    : 'Нет аккаунта? <button id="switch-mode" type="button">Зарегистрироваться</button>';

  $("switch-mode").addEventListener("click", () => {
    setAuthMode(authMode === "login" ? "signup" : "login");
  });

  $("auth-submit").textContent = signup ? "Зарегистрироваться" : "Войти";
  $("password").autocomplete = signup ? "new-password" : "current-password";
  showAuthMessage("");
}

$("switch-mode").addEventListener("click", () => setAuthMode("signup"));

$("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;
  const displayName = $("display-name").value.trim();

  $("auth-submit").disabled = true;
  $("auth-submit").textContent = "Подождите...";

  try {
    if (authMode === "signup") {
      if (displayName.length < 2) {
        throw new Error("Имя должно содержать минимум 2 символа.");
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName }
        }
      });

      if (error) throw error;

      if (data.session) {
        showAuthMessage("Аккаунт создан! Добро пожаловать.");
      } else {
        showAuthMessage("Проверь почту и подтверди регистрацию.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      showAuthMessage("Вход выполнен!");
    }
  } catch (error) {
    showAuthMessage(error.message, true);
  } finally {
    $("auth-submit").disabled = false;
    $("auth-submit").textContent =
      authMode === "signup" ? "Зарегистрироваться" : "Войти";
  }
});

$("forgot-password").addEventListener("click", async () => {
  const email = $("email").value.trim();

  if (!email) {
    showAuthMessage("Сначала введи email.", true);
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) showAuthMessage(error.message, true);
  else showAuthMessage("Письмо для восстановления отправлено.");
});

async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) alert(error.message);
}

$("logout-button").addEventListener("click", logout);
$("orbit-logout").addEventListener("click", logout);

$("open-orbit").addEventListener("click", openApplication);

/* ---------- APPLICATION ---------- */

function openApplication() {
  $("landing").hidden = true;
  $("orbit-app").hidden = false;
  $("orbit-current-email").textContent = currentUser.email || "Пользователь";
  $("profile-avatar").textContent =
    (currentUser.email || "O").charAt(0).toUpperCase();

  loadConversations();
}

function showLanding() {
  $("landing").hidden = false;
  $("orbit-app").hidden = true;
  $("user-panel").hidden = true;
  $("auth-form").hidden = false;
  $("forgot-password").hidden = false;
  $("switch-text").hidden = false;
}

async function handleSession(session) {
  currentUser = session?.user || null;

  if (currentUser) {
    $("auth-form").hidden = true;
    $("forgot-password").hidden = true;
    $("switch-text").hidden = true;
    $("user-panel").hidden = false;
    $("user-email").textContent = currentUser.email || "";
  } else {
    currentConversationId = null;
    if (realtimeChannel) {
      await supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    showLanding();
  }
}

supabase.auth.onAuthStateChange((_event, session) => {
  handleSession(session);
});

const { data: sessionData } = await supabase.auth.getSession();
await handleSession(sessionData.session);

/* ---------- CONVERSATIONS ---------- */

async function loadConversations() {
  if (!currentUser) return;

  $("conversation-list").innerHTML =
    '<p class="empty-list">Загружаю диалоги...</p>';

  const { data, error } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", currentUser.id);

  if (error) {
    $("conversation-list").innerHTML =
      '<p class="empty-list">Не удалось загрузить диалоги.</p>';
    console.error(error);
    return;
  }

  conversations = data || [];

  if (conversations.length === 0) {
    $("conversation-list").innerHTML =
      '<p class="empty-list">Диалогов пока нет. Создай первый!</p>';
    return;
  }

  $("conversation-list").innerHTML = "";

  for (const item of conversations) {
    const button = document.createElement("button");
    button.className = "conversation-item";
    button.innerHTML =
      '<span class="avatar">✦</span><span>Диалог ' +
      item.conversation_id.slice(0, 8) +
      "</span>";

    button.addEventListener("click", () => {
      openConversation(item.conversation_id);
    });

    $("conversation-list").appendChild(button);
  }
}

async function createConversation(otherUserId) {
  if (!currentUser) return;

  if (otherUserId === currentUser.id) {
    throw new Error("Нельзя создать диалог с самим собой.");
  }

  const { data, error } = await supabase.rpc(
    "start_direct_conversation",
    { p_other_user_id: otherUserId }
  );

  if (error) throw error;

  const conversationId =
    typeof data === "string" ? data : data?.id;

  if (!conversationId) {
    throw new Error("Функция не вернула ID диалога. Проверь RPC.");
  }

  await loadConversations();
  await openConversation(conversationId);
}

/* ---------- NEW CHAT WINDOW ---------- */

function showNewChatModal() {
  $("new-chat-modal").hidden = false;
  $("new-chat-error").textContent = "";
  $("new-chat-user-id").value = "";
  $("new-chat-user-id").focus();
}

function closeNewChatModal() {
  $("new-chat-modal").hidden = true;
}

$("new-chat-button").addEventListener("click", showNewChatModal);
$("welcome-new-chat").addEventListener("click", showNewChatModal);
$("cancel-new-chat").addEventListener("click", closeNewChatModal);

$("create-new-chat").addEventListener("click", async () => {
  const userId = $("new-chat-user-id").value.trim();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    $("new-chat-error").textContent = "Введи корректный UUID пользователя.";
    return;
  }

  $("create-new-chat").disabled = true;
  $("new-chat-error").textContent = "Создаю диалог...";

  try {
    await createConversation(userId);
    closeNewChatModal();
  } catch (error) {
    console.error(error);
    $("new-chat-error").textContent = error.message;
  } finally {
    $("create-new-chat").disabled = false;
  }
});

/* ---------- MESSAGES ---------- */

async function openConversation(conversationId) {
  currentConversationId = conversationId;

  $("chat-empty").hidden = true;
  $("chat-window").hidden = false;
  $("chat-title").textContent =
    "Диалог " + conversationId.slice(0, 8);

  await loadMessages(conversationId);
  subscribeToMessages(conversationId);
}

async function loadMessages(conversationId) {
  const { data, error } = await supabase
    .from("dm_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    $("messages-list").innerHTML =
      '<p class="empty-list">Не удалось загрузить сообщения: ' +
      escapeHTML(error.message) +
      "</p>";
    return;
  }

  renderMessages(data || []);
}

function renderMessages(messages) {
  const list = $("messages-list");
  list.innerHTML = "";

  if (!messages.length) {
    list.innerHTML =
      '<p class="empty-list">Пока нет сообщений. Напиши первым!</p>';
    return;
  }

  for (const message of messages) {
    const bubble = document.createElement("div");
    bubble.className = "message-bubble" +
      (message.sender_id === currentUser.id ? " mine" : "");

    const content = document.createElement("div");
    content.textContent = message.content || "";

    const time = document.createElement("small");
    time.className = "message-time";
    time.textContent = message.created_at
      ? new Date(message.created_at).toLocaleString()
      : "";

    bubble.append(content, time);
    list.appendChild(bubble);
  }

  list.scrollTop = list.scrollHeight;
}

function subscribeToMessages(conversationId) {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabase
    .channel("dm-" + conversationId)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "dm_messages",
        filter: "conversation_id=eq." + conversationId
      },
      (payload) => {
        if (currentConversationId === conversationId) {
          loadMessages(conversationId);
        }
      }
    )
    .subscribe();
}

$("message-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const content = $("message-input").value.trim();

  if (!content || !currentConversationId || !currentUser) return;

  $("send-message").disabled = true;

  const { error } = await supabase
    .from("dm_messages")
    .insert({
      conversation_id: currentConversationId,
      sender_id: currentUser.id,
      content
    });

  $("send-message").disabled = false;

  if (error) {
    alert("Не удалось отправить сообщение: " + error.message);
    return;
  }

  $("message-input").value = "";
  await loadMessages(currentConversationId);
});

/* ---------- HELPERS ---------- */

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}
