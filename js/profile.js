/** Mini-12306 旅客个人中心资料展示 */
(function (global) {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const currentUser = global.Mini12306Utils.getCurrentUser();
    if (!currentUser || currentUser.role !== "passenger") {
      return;
    }

    const displayName = currentUser.realNameMasked || currentUser.account || "旅客用户";
    document.querySelector("#profile-name").textContent = displayName;
    document.querySelector("#profile-phone").textContent = `已实名认证　${currentUser.phoneMasked || ""}`;
    document.querySelector("#profile-avatar").textContent = displayName.charAt(0);

    const storage = global.Mini12306Storage;
    const userOrders = storage.getData(storage.STORAGE_KEYS.ORDERS, [])
      .filter((order) => order.userId === currentUser.id);
    const passengers = storage.getData(storage.STORAGE_KEYS.FREQUENT_PASSENGERS, [])
      .filter((passenger) => passenger.ownerUserId === currentUser.id);
    const fullUser = storage.getData(storage.STORAGE_KEYS.USERS, [])
      .find((user) => user.id === currentUser.id);
    const upcomingCount = userOrders.filter((order) => order.status === "paid" || order.status === "pending").length;

    document.querySelector("#profile-upcoming-count").textContent = String(upcomingCount);
    document.querySelector("#profile-order-count").textContent = String(userOrders.length);
    document.querySelector("#profile-passenger-count").textContent = String(passengers.length);

    const paymentMethod = fullUser && fullUser.paymentMethods && fullUser.paymentMethods[0];
    document.querySelector("#profile-payment-method").textContent = paymentMethod
      ? `尾号 ${paymentMethod.lastFour}`
      : "未绑定";
  });
})(window);
