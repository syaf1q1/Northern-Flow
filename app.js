/* ============================================================
   app.js — Northern Flow
   Shared UI utilities used across every page: auth guarding,
   navigation wiring, formatting helpers, and toasts.
   ============================================================ */

import { watchAuth, logout, LOW_STOCK_THRESHOLD } from "./firebase.js";

/* ---------- Formatting ---------- */
export function formatCurrency(num) {
  return "RM " + Number(num || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function isSameMonth(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export function isSameWeek(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return d >= start && d < end;
}

/* ---------- Stock status ---------- */
export function statusFor(stock) {
  if (stock <= 0) return { label: "Out of Stock", cls: "status--danger" };
  if (stock <= LOW_STOCK_THRESHOLD) return { label: "Low Stock", cls: "status--warning" };
  return { label: "Available", cls: "status--success" };
}

/* ---------- Toasts ---------- */
export function toast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast--show"));
  setTimeout(() => {
    el.classList.remove("toast--show");
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ---------- Auth guard ----------
   Call at the top of every protected page. Resolves with the
   logged-in user, or redirects to login.html if none. */
export function guardAuth() {
  return new Promise((resolve) => {
    watchAuth((user) => {
      if (!user) {
        window.location.href = "login.html";
      } else {
        resolve(user);
      }
    });
  });
}

/* ---------- Nav wiring ---------- */
export function initNav(activePage) {
  document.querySelectorAll("[data-nav]").forEach((el) => {
    if (el.dataset.nav === activePage) el.classList.add("is-active");
  });

  document.querySelectorAll("[data-logout]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await logout();
      window.location.href = "login.html";
    });
  });

  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  const scrim = document.getElementById("navScrim");
  if (menuToggle && sidebar) {
    menuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("is-open");
      if (scrim) scrim.classList.toggle("is-open");
    });
  }
  if (scrim && sidebar) {
    scrim.addEventListener("click", () => {
      sidebar.classList.remove("is-open");
      scrim.classList.remove("is-open");
    });
  }
}