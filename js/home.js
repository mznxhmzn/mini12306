/** Mini-12306 首页查询行为 */
(function (global) {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const storage = global.Mini12306Storage;
    const utils = global.Mini12306Utils;
    const searchForm = document.querySelector("#ticket-search-form");
    const departureButton = document.querySelector("#departure-city");
    const arrivalButton = document.querySelector("#arrival-city");
    const swapButton = document.querySelector("#swap-cities");
    const dateInput = document.querySelector("#departure-date");
    const studentTicketInput = document.querySelector("#student-ticket");
    const inPagesDirectory = global.location.pathname.replace(/\\/g, "/").includes("/pages/");
    const loginPageUrl = inPagesDirectory ? "login.html" : "pages/login.html";

    /* 首页是受保护页面，未登录或 30 分钟无操作时返回登录页 */
    utils.startLoginStateMonitor(loginPageUrl);

    const currentUser = utils.getCurrentUser();
    /* 旅客共用购票页面模板，但显示各自的脱敏姓名 */
    const headerMessage = document.querySelector(".header-message");
    if (currentUser && headerMessage) {
      headerMessage.textContent = `${currentUser.realNameMasked}，美好旅程从这里出发`;
    }

    if (!storage || !searchForm || !departureButton || !arrivalButton || !dateInput) {
      console.error("首页查询初始化失败：缺少必要的页面元素或公共脚本");
      return;
    }

    /* 日期默认选中明天，并禁止选择今天以前的日期 */
    const today = utils.formatDate(new Date());
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.min = today;
    dateInput.value = dateInput.value || utils.formatDate(tomorrow);

    /* 一键交换出发城市和到达城市 */
    swapButton.addEventListener("click", () => {
      const departureCity = departureButton.dataset.city;
      const arrivalCity = arrivalButton.dataset.city;
      departureButton.dataset.city = arrivalCity;
      arrivalButton.dataset.city = departureCity;
      departureButton.querySelector(".city-name").textContent = arrivalCity;
      arrivalButton.querySelector(".city-name").textContent = departureCity;
      utils.showToast("已交换出发地和目的地", "info", 1600);
    });

    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const departureCity = departureButton.dataset.city || "";
      const arrivalCity = arrivalButton.dataset.city || "";
      const departureDate = dateInput.value;

      if (!departureCity) {
        utils.showToast("请选择出发地");
        departureButton.focus();
        return;
      }

      if (!arrivalCity) {
        utils.showToast("请选择目的地");
        arrivalButton.focus();
        return;
      }

      if (departureCity === arrivalCity) {
        utils.showToast("出发地和目的地不能相同");
        arrivalButton.focus();
        return;
      }

      if (!departureDate) {
        utils.showToast("请选择出发日期");
        dateInput.focus();
        return;
      }

      if (departureDate < today) {
        utils.showToast("出发日期不能早于今天");
        dateInput.focus();
        return;
      }

      const searchCondition = {
        departureCity,
        arrivalCity,
        departureDate,
        studentTicket: Boolean(studentTicketInput && studentTicketInput.checked),
        searchedAt: new Date().toISOString()
      };

      const saved = storage.setData(storage.STORAGE_KEYS.TRAIN_SEARCH, searchCondition);
      if (!saved) {
        utils.showToast("查询条件保存失败，请检查浏览器存储权限");
        return;
      }

      global.location.href = searchForm.dataset.resultUrl || "pages/train-list.html";
    });
  });
})(window);
