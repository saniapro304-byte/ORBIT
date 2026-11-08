
import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

import {
  SUPABASE_URL,
  SUPABASE_KEY
} from "./config.js";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// Элементы страницы
const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const authMessage = document.getElementById("auth-message");
const authSubmit = document.getElementById("auth-submit");

const nameGroup = document.getElementById("name-group");
const displayName = document.getElementById("display-name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const switchMode = document.getElementById("switch-mode");
const switchText = document.getElementById("switch-text");
const forgotPassword = document.getElementById("forgot-password");

const userPanel = document.getElementById("user-panel");
const userEmail = document.getElementById("user-email");
const logoutButton = document.getElementById("logout-button");

let mode = "login";
let busy = false;

function showMessage(message, type = "info") {
  authMessage.textContent = message;
  authMessage.dataset.type = type;
}

function setBusy(value) {
  busy = value;
  authSubmit.disabled = value;
  authSubmit.textContent = value
    ? "Подождите..."
    : mode === "signup"
      ? "Создать аккаунт"
      : "Войти";
}

function setMode(nextMode) {
  mode = nextMode;

  const signup = mode === "signup";

  authTitle.textContent = signup
    ? "Создай свой ORBIT"
    : "Добро пожаловать";

  authSubtitle.textContent = signup
    ? "Начни своё путешествие"
    : "Войди в свою вселенную общения";

  nameGroup.hidden = !signup;
  displayName.required = signup;

  passwordInput.autocomplete = signup
    ? "new-password"
    : "current-password";

  switchText.textContent = signup
    ? "Уже есть аккаунт?"
    : "Нет аккаунта?";

  switchMode.textContent = signup
    ? "Войти"
    : "Создать аккаунт";

  forgotPassword.hidden = signup;

  showMessage("");
  setBusy(false);
}

function showUser(user) {
  const loggedIn = Boolean(user);

  authForm.hidden = loggedIn;
  userPanel.hidden = !loggedIn;
  forgotPassword.hidden = loggedIn;
  switchMode.hidden = loggedIn;
  switchText.hidden = loggedIn;

  if (loggedIn) {
    authTitle.textContent = "Ты в ORBIT!";
    authSubtitle.textContent = "Рады снова тебя видеть";
    userEmail.textContent = user.email || "Аккаунт ORBIT";
    showMessage("Ты успешно вошёл в аккаунт.", "success");
  } else {
    authTitle.textContent = "Добро пожаловать";
    authSubtitle.textContent = "Войди в свою вселенную общения";
    setMode("login");
  }
}

// Переключение регистрации и входа
switchMode.addEventListener("click", () => {
  setMode(mode === "login" ? "signup" : "login");
});

// Регистрация и вход
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (busy) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  setBusy(true);
  showMessage("");

  try {
    if (mode === "signup") {
      const name = displayName.value.trim();

      if (!name) {
        showMessage("Введи своё имя.", "error");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: name
          }
        }
      });

      if (error) throw error;

      if (data.session) {
        showMessage("Аккаунт создан! Добро пожаловать в ORBIT.", "success");
      } else {
        showMessage(
          "Почти готово! Проверь почту и перейди по ссылке подтверждения.",
          "success"
        );
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      showMessage("Вход выполнен!", "success");
    }
  } catch (error) {
    showMessage(error.message || "Произошла ошибка.", "error");
  } finally {
    setBusy(false);
  }
});

// Восстановление пароля
forgotPassword.addEventListener("click", async () => {
  const email = emailInput.value.trim();

  if (!email) {
    showMessage("Сначала введи свой email.", "error");
    return;
  }

  try {
    forgotPassword.disabled = true;

    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) throw error;

    showMessage(
      "Если аккаунт существует, письмо для сброса пароля отправлено.",
      "success"
    );
  } catch (error) {
    showMessage(error.message || "Не удалось отправить письмо.", "error");
  } finally {
    forgotPassword.disabled = false;
  }
});

// Выход
logoutButton.addEventListener("click", async () => {
  try {
    logoutButton.disabled = true;

    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    showMessage("Ты вышел из аккаунта.", "success");
  } catch (error) {
    showMessage(error.message || "Ошибка выхода.", "error");
  } finally {
    logoutButton.disabled = false;
  }
});

// Следим за состоянием аккаунта
supabase.auth.onAuthStateChange((_event, session) => {
  showUser(session?.user ?? null);
});

// Проверяем сохранённую сессию
async function initialize() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    showMessage(error.message, "error");
    return;
  }

  showUser(data.session?.user ?? null);
}

initialize();

console.log("ORBIT authentication initialized.");
