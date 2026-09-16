/**
 * Mini-12306 受保护页面公共入口
 * 没有登录或 30 分钟无操作时，统一返回登录页面。
 */
(function (global) {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const storage = global.Mini12306Storage;
    const utils = global.Mini12306Utils;

    if (!storage || !utils) {
      console.error("登录保护初始化失败：缺少存储或工具脚本");
      return;
    }

    utils.startLoginStateMonitor("login.html");

    /* 页面中的旅客姓名占位符统一显示当前账号的信息 */
    const currentUser = utils.getCurrentUser();
    if (currentUser) {
      document.querySelectorAll("[data-current-user-name]").forEach((element) => {
        element.textContent = currentUser.realNameMasked || currentUser.account;
      });
    }

    /* 页面存在退出按钮时，清除会话后返回登录页 */
    const logoutButton = document.querySelector("[data-action='logout']");
    if (logoutButton) {
      logoutButton.addEventListener("click", (event) => {
        event.preventDefault();
        storage.removeData(storage.STORAGE_KEYS.CURRENT_USER);
        global.location.replace("login.html");
      });
    }
  });

})(window);
