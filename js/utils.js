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

  /** 本地摘要只服务于显示，实际登录状态由服务器验证。 */
  function isLoginExpired(currentUser) {
    if (!currentUser || !currentUser.lastActiveAt) return true;
    return Date.now() - Date.parse(currentUser.lastActiveAt) >= SESSION_TIMEOUT;
  }

  /** 将实际用户活动报告给服务器。 */
  async function updateLoginActivity() {
    await global.Mini12306API.request('/auth/activity', {method:'POST'});
    return true;
  }

  /** 公共登录检查不再仅相信 LocalStorage。 */
  async function checkLoginStatus() {
    try {
      const {user} = await global.Mini12306API.request('/auth/me', {passive:true});
      global.Mini12306Storage.setData('currentUser', {...user,lastActiveAt:new Date().toISOString()});
      return true;
    } catch (error) { showToast(error.message); return false; }
  }

  /** 登录和空闲监控由 API 与角色保护统一处理。 */
  function startLoginStateMonitor() { return global.Mini12306RoleGuard.ready; }

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
