/**
 * Mini-12306 通用工具函数
 * 页面通过 window.Mini12306Utils 使用这些函数。
 */
(function (global) {
  "use strict";

  const SESSION_TIMEOUT = 30 * 60 * 1000;
  let sessionMonitorStarted = false;

  /** 将日期转换为 YYYY-MM-DD 格式 */
  function formatDate(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /** 将金额格式化为人民币显示形式 */
  function formatCurrency(amount) {
    const validAmount = Number(amount);
    return Number.isFinite(validAmount) ? `¥${validAmount.toFixed(2)}` : "¥0.00";
  }

  /** 对手机号进行脱敏，例如 138****8000 */
  function maskPhone(phone) {
    const phoneText = String(phone || "");
    return /^(\d{3})\d{4}(\d{4})$/.test(phoneText)
      ? phoneText.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2")
      : phoneText;
  }

  /** 对身份证件号码进行脱敏，只显示前六位和后四位 */
  function maskIdCard(idCard) {
    const idCardText = String(idCard || "");
    if (idCardText.length < 10) {
      return idCardText;
    }

    return `${idCardText.slice(0, 6)}********${idCardText.slice(-4)}`;
  }

  /** 生成适合演示数据使用的唯一编号 */
  function generateId(prefix) {
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `${prefix || "ID"}${Date.now()}${randomPart}`;
  }

  /** 计算两个 HH:mm 时间之间的分钟数，支持跨越午夜 */
  function calculateDuration(departureTime, arrivalTime) {
    const [departureHour, departureMinute] = departureTime.split(":").map(Number);
    const [arrivalHour, arrivalMinute] = arrivalTime.split(":").map(Number);
    const departureTotal = departureHour * 60 + departureMinute;
    let arrivalTotal = arrivalHour * 60 + arrivalMinute;

    if (arrivalTotal < departureTotal) {
      arrivalTotal += 24 * 60;
    }

    return arrivalTotal - departureTotal;
  }

  /** 将分钟数转换为“X小时X分” */
  function formatDuration(totalMinutes) {
    const validMinutes = Math.max(0, Number(totalMinutes) || 0);
    const hours = Math.floor(validMinutes / 60);
    const minutes = validMinutes % 60;
    return `${hours > 0 ? `${hours}小时` : ""}${minutes > 0 ? `${minutes}分` : ""}` || "0分";
  }

  /** 深拷贝普通 JSON 数据，防止页面直接修改原始模拟数据 */
  function cloneData(data) {
    return data === undefined ? undefined : JSON.parse(JSON.stringify(data));
  }

  /** 防抖：连续触发时只执行最后一次操作 */
  function debounce(callback, waitTime) {
    let timerId = null;

    return function (...args) {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => callback.apply(this, args), waitTime);
    };
  }

  /**
   * 显示轻量级 Toast 提示。
   * type 支持 error、success、warning 和 info。
   */
  function showToast(message, type = "error", duration = 3000) {
    const oldToast = document.querySelector(".app-toast");
    if (oldToast) {
      oldToast.remove();
    }

    const toast = document.createElement("div");
    toast.className = `app-toast app-toast-${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
    toast.textContent = message;
    document.body.appendChild(toast);

    /* 下一帧再添加显示状态，确保过渡动画生效 */
    global.requestAnimationFrame(() => toast.classList.add("is-visible"));

    global.setTimeout(() => {
      toast.classList.remove("is-visible");
      global.setTimeout(() => toast.remove(), 220);
    }, duration);
  }

  /** 返回当前登录用户；未登录时返回 null */
  function getCurrentUser() {
    const storage = global.Mini12306Storage;
    return storage ? storage.getData(storage.STORAGE_KEYS.CURRENT_USER, null) : null;
  }

  /** 判断会话是否已超过 30 分钟没有操作 */
  function isLoginExpired(currentUser) {
    if (!currentUser || !currentUser.lastActiveAt) {
      return true;
    }

    const lastActiveTime = new Date(currentUser.lastActiveAt).getTime();
    return Number.isNaN(lastActiveTime) || Date.now() - lastActiveTime >= SESSION_TIMEOUT;
  }

  /** 更新当前用户最后一次操作时间 */
  function updateLoginActivity() {
    const storage = global.Mini12306Storage;
    const currentUser = getCurrentUser();

    if (!storage || !currentUser || isLoginExpired(currentUser)) {
      return false;
    }

    currentUser.lastActiveAt = new Date().toISOString();
    return storage.setData(storage.STORAGE_KEYS.CURRENT_USER, currentUser);
  }

  /**
   * 检查登录状态；未登录或已过期时跳转到登录页。
   * loginPageUrl 应根据当前页面位置传入，例如 pages/login.html。
   */
  function checkLoginStatus(loginPageUrl = "pages/login.html") {
    const storage = global.Mini12306Storage;
    const currentUser = getCurrentUser();

    if (!storage || !currentUser) {
      global.location.replace(loginPageUrl);
      return false;
    }

    if (isLoginExpired(currentUser)) {
      storage.removeData(storage.STORAGE_KEYS.CURRENT_USER);
      const separator = loginPageUrl.includes("?") ? "&" : "?";
      global.location.replace(`${loginPageUrl}${separator}reason=expired`);
      return false;
    }

    return true;
  }

  /**
   * 在需要登录的页面启动会话监控。
   * 用户点击、输入、触摸或滚动时，最多每 15 秒更新一次活动时间。
   */
  function startLoginStateMonitor(loginPageUrl = "pages/login.html") {
    if (sessionMonitorStarted || !checkLoginStatus(loginPageUrl)) {
      return;
    }

    sessionMonitorStarted = true;
    let lastSavedTime = 0;

    const recordActivity = function () {
      const currentTime = Date.now();
      if (currentTime - lastSavedTime >= 15000) {
        updateLoginActivity();
        lastSavedTime = currentTime;
      }
    };

    ["click", "keydown", "touchstart", "scroll"].forEach((eventName) => {
      document.addEventListener(eventName, recordActivity, { passive: true });
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        checkLoginStatus(loginPageUrl);
      }
    });

    global.setInterval(() => checkLoginStatus(loginPageUrl), 60 * 1000);
  }

  global.Mini12306Utils = Object.freeze({
    formatDate,
    formatCurrency,
    maskPhone,
    maskIdCard,
    generateId,
    calculateDuration,
    formatDuration,
    cloneData,
    debounce,
    SESSION_TIMEOUT,
    showToast,
    getCurrentUser,
    isLoginExpired,
    updateLoginActivity,
    checkLoginStatus,
    startLoginStateMonitor
  });
})(window);
