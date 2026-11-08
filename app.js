
import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let currentConversationId = null;
let realtimeChannel = null;
let authMode = "login";
let searchTimer = null;

const defaultSettings = {
  theme: "dark",
  accent: "purple",
  font_size: "medium",
  language: "ru",
  notifications: true,
  sounds: true,
  privacy: {
    allow_messages: "everyone",
    show_status: true
  }
};

let settings = structuredClone(defaultSettings);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showMessage(id, message, success = false) {
  const element = $(id);
  if (!element) return;
  element.textContent = message;
  element.style.color = success ? "var(--success)" : "var(--danger)";
}

function showScreen(screen) {
  $("landing").classList.toggle("hidden", screen !== "landing");
  $("auth-screen").classList.toggle("hidden", screen !== "auth");
  $("orbit-app").classList.toggle("hidden", screen !== "app");
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";

  $("auth-title").textContent = signup
    ? "Создать аккаунт"
    : "Добро пожаловать";

  $("auth-subtitle").textContent = signup
    ? "Присоединяйся к ORBIT"
    : "Войди в свой аккаунт ORBIT";

  $("name-group").classList.toggle("hidden", !signup);
  $("password-group").classList.remove("hidden");
  $("password").required = true;
  $("auth-submit").textContent = signup ? "Зарегистрироваться" : "Войти";
  $("switch-text").textContent = signup ? "Уже есть аккаунт?" : "Нет аккаунта?";
  $("switch-mode").textContent = signup ? "Войти" : "Создать аккаунт";
  $("forgot-password").classList.toggle("hidden", signup);
  showMessage("auth-message", "");
}

$("landing-login").addEventListener("click", () => {
  setAuthMode("login");
  showScreen("auth");
});

$("landing-start").addEventListener("click", () => {
  setAuthMode("signup");
  showScreen("auth");
});

$("auth-home").addEventListener("click", (event) => {
  event.preventDefault();
  showScreen("landing");
});

$("switch-mode").addEventListener("click", () => {
  setAuthMode(authMode === "login" ? "signup" : "login");
});

$("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;
  const displayName = $("display-name").value.trim();

  $("auth-submit").disabled = true;
  $("auth-submit").textContent = "Подождите...";

  try {
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName
          }
        }
      });

      if (error) throw error;

      if (data.session) {
        await handleSession(data.session);
      } else {
        showMessage(
          "auth-message",
          "Регистрация почти завершена. Проверь почту и подтверди email.",
          true
        );
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      await handleSession(data.session);
    }
  } catch (error) {
    showMessage("auth-message", error.message);
  } finally {
    $("auth-submit").disabled = false;
    $("auth-submit").textContent =
      authMode === "signup" ? "Зарегистрироваться" : "Войти";
  }
});

$("forgot-password").addEventListener("click", async () => {
  const email = $("email").value.trim();

  if (!email) {
    showMessage("auth-message", "Сначала введи свой email.");
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    showMessage("auth-message", error.message);
  } else {
    showMessage("auth-message", "Письмо для сброса пароля отправлено.", true);
  }
});

$("logout-button").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    alert(error.message);
    return;
  }

  currentUser = null;
  currentProfile = null;
  currentConversationId = null;

  if (realtimeChannel) {
    await supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  showScreen("landing");
});

async function handleSession(session) {
  if (!session?.user) {
    currentUser = null;
    showScreen("landing");
    return;
  }

  currentUser = session.user;
  showScreen("app");

  await loadProfile();
  await loadConversations();
}

async function loadProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Profile load:", error);
    showMessage("settings-message", "Не удалось загрузить профиль: " + error.message);
    return;
  }

  currentProfile = data;

  if (!currentProfile) {
    showMessage("settings-message", "Профиль пока не найден в базе данных.");
    return;
  }

  const displayName = currentProfile.display_name || "Пользователь";
  const username = currentProfile.username || "username";

  $("sidebar-name").textContent = displayName;
  $("sidebar-username").textContent = "@" + username;
  $("sidebar-avatar").textContent = displayName.charAt(0).toUpperCase();

  $("settings-display-name").value = currentProfile.display_name || "";
  $("settings-username").value = currentProfile.username || "";
  $("settings-bio").value = currentProfile.bio || "";

  settings = {
    ...structuredClone(defaultSettings),
    ...(currentProfile.settings || {}),
    privacy: {
      ...defaultSettings.privacy,
      ...(currentProfile.settings?.privacy || {})
    }
  };

  applySettings();
  fillSettingsForm();
}

function fillSettingsForm() {
  $("theme-select").value = settings.theme;
  $("accent-select").value = settings.accent;
  $("font-size-select").value = settings.font_size;
  $("language-select").value = settings.language;
  $("notifications-toggle").checked = settings.notifications;
  $("sounds-toggle").checked = settings.sounds;
  $("privacy-messages").value = settings.privacy.allow_messages;
  $("privacy-status").checked = settings.privacy.show_status;
}

function applySettings() {
  let theme = settings.theme;

  if (theme === "system") {
    theme = window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  document.body.dataset.theme = theme;
  document.body.dataset.accent = settings.accent;
  document.body.dataset.font = settings.font_size;
}

$("theme-select").addEventListener("change", () => {
  settings.theme = $("theme-select").value;
  applySettings();
});

$("accent-select").addEventListener("change", () => {
  settings.accent = $("accent-select").value;
  applySettings();
});

$("font-size-select").addEventListener("change", () => {
  settings.font_size = $("font-size-select").value;
  applySettings();
});

$("save-settings").addEventListener("click", async () => {
  if (!currentUser) return;

  settings.theme = $("theme-select").value;
  settings.accent = $("accent-select").value;
  settings.font_size = $("font-size-select").value;
  settings.language = $("language-select").value;
  settings.notifications = $("notifications-toggle").checked;
  settings.sounds = $("sounds-toggle").checked;
  settings.privacy = {
    allow_messages: $("privacy-messages").value,
    show_status: $("privacy-status").checked
  };

  applySettings();

  const { error } = await supabase
    .from("profiles")
    .update({ settings })
    .eq("id", currentUser.id);

  if (error) {
    showMessage("settings-message", "Ошибка сохранения: " + error.message);
  } else {
    showMessage("settings-message", "Настройки сохранены!", true);
  }
});

$("save-profile").addEventListener("click", async () => {
  if (!currentUser) return;

  const displayName = $("settings-display-name").value.trim();
  const username = $("settings-username").value.trim().replace(/^@/, "").toLowerCase();
  const bio = $("settings-bio").value.trim();

  if (!displayName || !username) {
    showMessage("profile-message", "Заполни имя и username.");
    return;
  }

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    showMessage(
      "profile-message",
      "Ник: от 3 до 24 символов, только a-z, цифры и подчёркивание."
    );
    return;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      username,
      bio
    })
    .eq("id", currentUser.id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      showMessage("profile-message", "Этот username уже занят.");
    } else {
      showMessage("profile-message", "Ошибка: " + error.message);
    }
    return;
  }

  currentProfile = data;
  $("sidebar-name").textContent = displayName;
  $("sidebar-username").textContent = "@" + username;
  $("sidebar-avatar").textContent = displayName.charAt(0).toUpperCase();

  showMessage("profile-message", "Профиль сохранён!", true);
});

function switchView(viewName) {
  ["chats", "search", "settings"].forEach((name) => {
    $(name + "-view").classList.toggle("hidden", name !== viewName);
  });

  document.querySelectorAll(".nav-button[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
}

document.querySelectorAll(".nav-button[data-view]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

$("placeholder-search").addEventListener("click", () => switchView("search"));
$("new-chat-button").addEventListener("click", () => switchView("search"));

$("show-chats")?.addEventListener("click", () => switchView("chats"));
$("show-search")?.addEventListener("click", () => switchView("search"));
$("show-settings")?.addEventListener("click", () => switchView("settings"));

$("user-search-input").addEventListener("input", () => {
  clearTimeout(searchTimer);

  const query = $("user-search-input").value.trim();

  if (query.length < 2) {
    $("search-results").innerHTML =
      '<p class="muted">Введи минимум 2 символа для поиска.</p>';
    return;
  }

  searchTimer = setTimeout(() => searchUsers(query), 350);
});

async function searchUsers(query) {
  $("search-results").innerHTML = '<p class="muted">Ищем пользователей...</p>';

  const searchTerm = query.replace(/^@/, "");

  const { data, error } = await supabase.rpc("search_users", {
    search_query: searchTerm
  });

  if (error) {
    $("search-results").textContent = "Ошибка поиска: " + error.message;
    return;
  }

  if (!data || data.length === 0) {
    $("search-results").innerHTML =
      '<p class="muted">Пользователи не найдены.</p>';
    return;
  }

  $("search-results").innerHTML = data.map((user) => {
    const name = escapeHTML(user.display_name || user.username || "Пользователь");
    const username = escapeHTML(user.username || "");
    const letter = escapeHTML(name.charAt(0).toUpperCase());

    return `
      <div class="search-result">
        <div class="avatar">${letter}</div>
        <div class="user-info">
          <strong>${name}</strong>
          <span>@${username}</span>
        </div>
        <button class="button primary start-chat-button"
          data-user-id="${escapeHTML(user.id)}">
          Написать
        </button>
      </div>
    `;
  }).join("");

  document.querySelectorAll(".start-chat-button").forEach((button) => {
    button.addEventListener("click", () => {
      startChat(button.dataset.userId);
    });
  });
}

async function startChat(otherUserId) {
  if (!otherUserId || otherUserId === currentUser.id) return;

  const { data, error } = await supabase.rpc("start_direct_conversation", {
    p_other_user_id: otherUserId
  });

  if (error) {
    alert("Не удалось создать диалог: " + error.message);
    return;
  }

  let conversationId = data;

  if (typeof data === "object" && data !== null) {
    conversationId = data.id || data.conversation_id;
  }

  if (!conversationId) {
    alert("Не удалось получить ID диалога от сервера.");
    return;
  }

  await loadConversations();
  await openConversation(conversationId, otherUserId);
  switchView("chats");
}

async function loadConversations() {
  if (!currentUser) return;

  const { data: memberships, error } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", currentUser.id);

  if (error) {
    $("conversation-list").textContent =
      "Ошибка загрузки чатов: " + error.message;
    return;
  }

  if (!memberships || memberships.length === 0) {
    $("conversation-list").innerHTML =
      '<p class="muted empty-state">Пока нет диалогов. Найди человека!</p>';
    return;
  }

  $("conversation-list").innerHTML =
    '<p class="muted">Загружаем диалоги...</p>';

  const conversations = [];

  for (const membership of memberships) {
    const { data: members, error: memberError } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", membership.conversation_id);

    if (memberError) continue;

    const otherMember = members?.find(
      (member) => member.user_id !== currentUser.id
    );

    if (!otherMember) continue;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", otherMember.user_id)
      .maybeSingle();

    conversations.push({
      id: membership.conversation_id,
      profile
    });
  }

  $("conversation-list").innerHTML = conversations.map((conversation) => {
    const name = escapeHTML(
      conversation.profile?.display_name ||
      conversation.profile?.username ||
      "Пользователь"
    );

    const username = escapeHTML(conversation.profile?.username || "");
    const letter = escapeHTML(name.charAt(0).toUpperCase());

    return `
      <div class="conversation-item"
        data-conversation-id="${escapeHTML(conversation.id)}"
        data-user-id="${escapeHTML(conversation.profile?.id || "")}">
        <div class="avatar">${letter}</div>
        <div class="conversation-text">
          <strong>${name}</strong>
          <span>@${username}</span>
        </div>
      </div>
    `;
  }).join("");

  document.querySelectorAll(".conversation-item").forEach((item) => {
    item.addEventListener("click", () => {
      openConversation(
        item.dataset.conversationId,
        item.dataset.userId
      );
    });
  });
}

async function openConversation(conversationId, otherUserId) {
  currentConversationId = conversationId;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .eq("id", otherUserId)
    .maybeSingle();

  if (profileError) {
    alert("Не удалось загрузить профиль собеседника.");
    return;
  }

  $("chat-name").textContent =
    profile?.display_name || profile?.username || "Пользователь";

  $("chat-username").textContent =
    profile?.username ? "@" + profile.username : "";

  $("chat-avatar").textContent =
    ($("chat-name").textContent || "U").charAt(0).toUpperCase();

  $("chat-placeholder").classList.add("hidden");
  $("active-chat").classList.remove("hidden");

  await loadMessages();

  if (realtimeChannel) {
    await supabase.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabase
    .channel("messages-" + conversationId)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "dm_messages",
        filter: "conversation_id=eq." + conversationId
      },
      (payload) => {
        renderMessage(payload.new);
      }
    )
    .subscribe();
}

async function loadMessages() {
  if (!currentConversationId) return;

  $("messages").innerHTML = '<p class="muted">Загрузка сообщений...</p>';

  const { data, error } = await supabase
    .from("dm_messages")
    .select("*")
    .eq("conversation_id", currentConversationId)
    .order("created_at", { ascending: true });

  if (error) {
    $("messages").textContent = "Ошибка загрузки сообщений: " + error.message;
    return;
  }

  $("messages").innerHTML = "";

  (data || []).forEach(renderMessage);

  $("messages").scrollTop = $("messages").scrollHeight;
}

function renderMessage(message) {
  if (!message || !currentConversationId) return;

  if (
    document.querySelector(
      '[data-message-id="' + CSS.escape(String(message.id)) + '"]'
    )
  ) return;

  const mine = message.sender_id === currentUser.id;
  const bubble = document.createElement("div");

  bubble.className = "message-bubble" + (mine ? " mine" : "");
  if (message.id) {
    bubble.dataset.messageId = message.id;
  }

  const content = document.createElement("div");
  content.textContent = message.content || "";

  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    : "";

  bubble.append(content, time);
  $("messages").appendChild(bubble);
  $("messages").scrollTop = $("messages").scrollHeight;
}

$("message-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const content = $("message-input").value.trim();

  if (!content || !currentConversationId) return;

  $("message-input").disabled = true;

  const { error } = await supabase
    .from("dm_messages")
    .insert({
      conversation_id: currentConversationId,
      sender_id: currentUser.id,
      content
    });

  $("message-input").disabled = false;

  if (error) {
    alert("Не удалось отправить сообщение: " + error.message);
    return;
  }

  $("message-input").value = "";
  await loadMessages();
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;
    currentProfile = null;
    showScreen("landing");
    return;
  }

  if (session && !currentUser) {
    setTimeout(() => handleSession(session), 0);
  }
});

const { data: initialSession } = await supabase.auth.getSession();

if (initialSession.session) {
  await handleSession(initialSession.session);
} else {
  showScreen("landing");
}

window.matchMedia("(prefers-color-scheme: light)")
  .addEventListener("change", () => {
    if (settings.theme === "system") applySettings();
  });
