/**
 * Mini-12306 LocalStorage 统一封装
 * 页面不得直接散布 localStorage 读写，应统一调用本文件提供的方法。
 */
(function (global) {
  "use strict";

  const DB_VERSION = "1.3";
  const STORAGE_PREFIX = "mini12306_";
  const VERSION_KEY = `${STORAGE_PREFIX}db_version`;

  const STORAGE_KEYS = Object.freeze({
    USERS: "users",
    REAL_NAME_VERIFICATIONS: "realNameVerifications",
    FREQUENT_PASSENGERS: "frequentPassengers",
    STATIONS: "stations",
    TRAINS: "trains",
    ORDERS: "orders",
    PAYMENT_RECORDS: "paymentRecords",
    REFUND_RECORDS: "refundRecords",
    REBOOKING_RELATIONS: "rebookingRelations",
    SYSTEM_CONFIG: "systemConfig",
    ANNOUNCEMENTS: "announcements",
    LOGIN_RECORDS: "loginRecords",
    AUDIT_LOGS: "auditLogs",
    CURRENT_USER: "currentUser",
    LOGIN_ATTEMPTS: "loginAttempts",
    TRAIN_SEARCH: "trainSearch"
  });

  /** 为所有项目数据添加统一前缀，避免与其他网页的数据冲突 */
  function buildStorageKey(key) {
    /* 按登录规范，当前用户使用明确的 currentUser 键名 */
    if (key === STORAGE_KEYS.CURRENT_USER) {
      return "currentUser";
    }

    return `${STORAGE_PREFIX}${key}`;
  }

  /** 从 LocalStorage 读取并还原数据，找不到时返回默认值 */
  function getData(key, defaultValue = null) {
    try {
      const storedValue = global.localStorage.getItem(buildStorageKey(key));
      return storedValue === null ? defaultValue : JSON.parse(storedValue);
    } catch (error) {
      console.error(`读取本地数据失败：${key}`, error);
      return defaultValue;
    }
  }

  /** 将普通 JavaScript 数据转换为 JSON 后保存 */
  function setData(key, value) {
    try {
      global.localStorage.setItem(buildStorageKey(key), JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`保存本地数据失败：${key}`, error);
      return false;
    }
  }

  /** 删除单项业务数据 */
  function removeData(key) {
    try {
      global.localStorage.removeItem(buildStorageKey(key));
      return true;
    } catch (error) {
      console.error(`删除本地数据失败：${key}`, error);
      return false;
    }
  }

  /** 仅清除 Mini-12306 自己的数据，不影响浏览器中的其他网站 */
  function clearProjectData() {
    try {
      const projectKeys = [];

      for (let index = 0; index < global.localStorage.length; index += 1) {
        const key = global.localStorage.key(index);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          projectKeys.push(key);
        }
      }

      projectKeys.forEach((key) => global.localStorage.removeItem(key));
      global.localStorage.removeItem("currentUser");
      return true;
    } catch (error) {
      console.error("清除项目本地数据失败", error);
      return false;
    }
  }

  /**
   * 首次访问或数据版本升级时写入演示数据。
   * 返回 true 表示本次执行了初始化，false 表示已有同版本数据。
   */
  function initMockData() {
    const mockData = global.Mini12306MockData;

    if (!mockData) {
      console.error("未找到模拟数据，请先加载 js/mock-data.js");
      return false;
    }

    try {
      const storedVersion = global.localStorage.getItem(VERSION_KEY);
      if (storedVersion === DB_VERSION) {
        return false;
      }

      clearProjectData();
      Object.entries(mockData).forEach(([key, value]) => setData(key, value));
      global.localStorage.setItem(VERSION_KEY, DB_VERSION);
      setData("databaseMeta", {
        version: DB_VERSION,
        initializedAt: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error("初始化演示数据失败", error);
      return false;
    }
  }

  /** 清空现有业务数据，并重新写入干净的演示数据 */
  function resetDemoData() {
    const cleared = clearProjectData();
    return cleared ? initMockData() : false;
  }

  global.Mini12306Storage = Object.freeze({
    DB_VERSION,
    STORAGE_KEYS,
    getData,
    setData,
    removeData,
    initMockData,
    resetDemoData
  });

  /* 加载页面时自动完成首次数据初始化 */
  initMockData();
})(window);
