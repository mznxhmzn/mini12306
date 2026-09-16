/**
 * Mini-12306 登录页面逻辑
 * 当前为纯前端演示，账号与密码只在本机模拟数据中进行比对。
 */
(function (global) {
  "use strict";

  const MAX_FAILED_ATTEMPTS = 3;
  const LOCK_DURATION = 5 * 60 * 1000;

  document.addEventListener("DOMContentLoaded", () => {
    const storage = global.Mini12306Storage;
    const utils = global.Mini12306Utils;
    const loginForm = document.querySelector("#login-form");
    const phoneInput = document.querySelector("#phone");
    const passwordInput = document.querySelector("#password");
    const passwordToggle = document.querySelector("#password-toggle");
    const loginButton = document.querySelector("#login-button");

    if (!storage || !utils || !loginForm) {
      console.error("登录页面初始化失败：缺少必要的页面元素或公共脚本");
      return;
    }

    /* 从受保护页面返回时，向用户说明会话已经过期 */
    const queryParams = new URLSearchParams(global.location.search);
    if (queryParams.get("reason") === "expired") {
      utils.showToast("登录状态已过期，请重新登录", "warning", 3500);
    }

    /* 切换密码的明文和密文显示 */
    passwordToggle.addEventListener("click", () => {
      const showPassword = passwordInput.type === "password";
      passwordInput.type = showPassword ? "text" : "password";
      passwordToggle.setAttribute("aria-label", showPassword ? "隐藏密码" : "显示密码");
      passwordToggle.classList.toggle("is-visible", showPassword);
      passwordInput.focus();
    });

    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const phone = phoneInput.value.trim();
      const password = passwordInput.value;

      /* 按需求校验：11 位数字并以 1 开头 */
      if (!/^1\d{10}$/.test(phone)) {
        showFieldError(phoneInput, "请输入以 1 开头的 11 位手机号");
        utils.showToast("手机号格式不正确");
        return;
      }

      clearFieldError(phoneInput);

      if (!password) {
        showFieldError(passwordInput, "请输入密码");
        utils.showToast("请输入密码");
        return;
      }

      clearFieldError(passwordInput);

      const loginAttempts = storage.getData(storage.STORAGE_KEYS.LOGIN_ATTEMPTS, {});
      const phoneAttempt = loginAttempts[phone];
      const currentTime = Date.now();

      if (phoneAttempt && phoneAttempt.lockedUntil > currentTime) {
        const remainingMinutes = Math.ceil((phoneAttempt.lockedUntil - currentTime) / 60000);
        utils.showToast(`密码错误次数过多，请 ${remainingMinutes} 分钟后重试`, "warning", 4000);
        return;
      }

      /* 锁定期结束后清除该手机号之前的失败记录 */
      if (phoneAttempt && phoneAttempt.lockedUntil <= currentTime) {
        delete loginAttempts[phone];
        storage.setData(storage.STORAGE_KEYS.LOGIN_ATTEMPTS, loginAttempts);
      }

      loginButton.disabled = true;
      loginButton.textContent = "登录中…";

      const users = storage.getData(storage.STORAGE_KEYS.USERS, []);
      const matchedUser = users.find((user) => user.phone === phone && user.status === "active");

      /* demo$ 前缀只是演示标记，正式系统必须由服务器验证密码 */
      if (!matchedUser || matchedUser.passwordHash !== `demo$${password}`) {
        handleLoginFailure(phone, loginAttempts);
        loginButton.disabled = false;
        loginButton.textContent = "登录";
        passwordInput.value = "";
        showFieldError(passwordInput, "手机号或密码错误");
        passwordInput.focus();
        return;
      }

      /* 登录成功后删除失败记录，不把密码字段放入当前用户信息 */
      delete loginAttempts[phone];
      storage.setData(storage.STORAGE_KEYS.LOGIN_ATTEMPTS, loginAttempts);

      const loginTime = new Date().toISOString();
      const currentUser = {
        id: matchedUser.id,
        account: matchedUser.account,
        phone: matchedUser.phone,
        phoneMasked: matchedUser.phoneMasked,
        role: matchedUser.role,
        realNameMasked: matchedUser.realNameMasked,
        loginAt: loginTime,
        lastActiveAt: loginTime
      };

      const saved = storage.setData(storage.STORAGE_KEYS.CURRENT_USER, currentUser);
      if (!saved) {
        loginButton.disabled = false;
        loginButton.textContent = "登录";
        utils.showToast("无法保存登录状态，请检查浏览器存储权限");
        return;
      }

      utils.showToast("登录成功", "success", 1000);

      global.setTimeout(() => {
        global.location.replace("../index.html");
      }, 500);
    });
  });

  /** 记录一次登录失败，达到三次后锁定五分钟 */
  function handleLoginFailure(phone, loginAttempts) {
    const storage = global.Mini12306Storage;
    const utils = global.Mini12306Utils;
    const previousAttempt = loginAttempts[phone] || { failedCount: 0, lockedUntil: 0 };
    const failedCount = previousAttempt.failedCount + 1;

    if (failedCount >= MAX_FAILED_ATTEMPTS) {
      loginAttempts[phone] = {
        failedCount,
        lockedUntil: Date.now() + LOCK_DURATION
      };
      storage.setData(storage.STORAGE_KEYS.LOGIN_ATTEMPTS, loginAttempts);
      utils.showToast("密码错误 3 次，账号已暂时锁定 5 分钟", "warning", 4500);
      return;
    }

    loginAttempts[phone] = { failedCount, lockedUntil: 0 };
    storage.setData(storage.STORAGE_KEYS.LOGIN_ATTEMPTS, loginAttempts);
    utils.showToast(`手机号或密码错误，还可尝试 ${MAX_FAILED_ATTEMPTS - failedCount} 次`);
  }

  /** 在输入框下方显示字段错误文字 */
  function showFieldError(input, message) {
    const field = input.closest(".login-field");
    const errorId = `${input.id}-error`;
    let errorElement = document.querySelector(`#${errorId}`);

    field.classList.add("has-error");
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", errorId);

    if (!errorElement) {
      errorElement = document.createElement("p");
      errorElement.id = errorId;
      errorElement.className = "field-error";
      field.insertAdjacentElement("afterend", errorElement);
    }

    errorElement.textContent = message;
  }

  /** 清除指定输入框的错误状态 */
  function clearFieldError(input) {
    const field = input.closest(".login-field");
    const errorElement = document.querySelector(`#${input.id}-error`);
    field.classList.remove("has-error");
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
    if (errorElement) {
      errorElement.remove();
    }
  }
})(window);
