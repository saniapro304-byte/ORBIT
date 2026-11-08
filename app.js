
console.log("ORBIT is launching...");

// Проверяем, что страница загружена
document.addEventListener("DOMContentLoaded", () => {
  console.log("Welcome to ORBIT!");

  // Плавная прокрутка по ссылкам
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.getAttribute("href");

      if (!targetId || targetId === "#") return;

      const target = document.querySelector(targetId);

      if (target) {
        event.preventDefault();
        target.scrollIntoView({
          behavior: "smooth"
        });
      }
    });
  });
});
