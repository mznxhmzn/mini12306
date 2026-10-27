/** Mini-12306 旅客专属订单列表 */
(function (global) {
  "use strict";

  const statusConfig = {
    pending: { label: "待支付", className: "status-pending" },
    paid: { label: "已支付", className: "status-paid" },
    refunded: { label: "已退票", className: "status-refunded" },
    cancelled: { label: "已取消", className: "status-refunded" },
    changed: { label: "已改签", className: "status-changed" }
  };

  let currentFilter = "all";
  let personalOrders = [];

  document.addEventListener("DOMContentLoaded", async () => {
    const storage = global.Mini12306Storage;
    const currentUser = await global.Mini12306RoleGuard.ready;
    if (!storage || !currentUser) {
      return;
    }

    /* 只读取当前旅客自己的订单 */
    try { personalOrders = (await global.Mini12306API.request('/orders')).orders; }
    catch (error) { global.Mini12306Utils.showToast(error.message); return; }

    document.querySelectorAll(".order-filter-button").forEach((button) => {
      button.addEventListener("click", () => {
        currentFilter = button.dataset.filter;
        document.querySelectorAll(".order-filter-button").forEach((item) => {
          item.classList.toggle("is-active", item === button);
        });
        renderOrders();
      });
    });

    renderOrders();
  });

  /** 根据当前筛选条件渲染个人订单 */
  function renderOrders() {
    const orderList = document.querySelector("#order-list");
    const visibleOrders = currentFilter === "all"
      ? personalOrders
      : personalOrders.filter((order) => order.status === currentFilter);

    orderList.replaceChildren();

    if (visibleOrders.length === 0) {
      const emptyState = document.createElement("section");
      emptyState.className = "section-card empty-state";
      emptyState.innerHTML = `
        <div class="empty-state-icon" aria-hidden="true">单</div>
        <h2>暂无相关订单</h2>
        <p>当前账号在这个分类下还没有订单。</p>
        <a href="../index.html">去查询车票</a>
      `;
      orderList.appendChild(emptyState);
      return;
    }

    visibleOrders.forEach((order) => orderList.appendChild(createOrderCard(order)));
  }

  /** 创建一张订单卡片 */
  function createOrderCard(order) {
    const config = statusConfig[order.status] || statusConfig.paid;
    const card = document.createElement("article");
    card.className = "section-card order-card";

    const header = document.createElement("header");
    header.className = "order-card-head";
    const orderNumber = document.createElement("span");
    orderNumber.className = "order-number";
    orderNumber.textContent = `订单 ${order.orderNumber}`;
    const status = document.createElement("span");
    status.className = `status-label ${config.className}`;
    status.textContent = config.label;
    header.append(orderNumber, status);

    const route = document.createElement("div");
    route.className = "order-route";
    route.append(
      createStation(order.departureTime, order.departureStation),
      createTrainNumber(order.trainNumber),
      createStation(order.arrivalTime, order.arrivalStation, true)
    );

    const meta = document.createElement("div");
    meta.className = "order-card-meta";
    const passenger = document.createElement("span");
    passenger.textContent = `${formatShortDate(order.departureDate)}　${order.passengerNameMasked}`;
    const ticket = document.createElement("strong");
    ticket.textContent = `${order.seatType}　${global.Mini12306Utils.formatCurrency(order.amount)}`;
    meta.append(passenger, ticket);

    card.append(header, route, meta);
    const actions = createOrderActions(order);
    if (actions.childElementCount > 0) {
      card.appendChild(actions);
    }
    return card;
  }

  function createStation(time, station, alignRight = false) {
    const element = document.createElement("div");
    element.className = "order-route-station";
    if (alignRight) {
      element.classList.add("align-right");
    }
    const timeText = document.createElement("strong");
    timeText.textContent = time;
    const stationText = document.createElement("span");
    stationText.textContent = station;
    element.append(timeText, stationText);
    return element;
  }

  function createTrainNumber(trainNumber) {
    const element = document.createElement("div");
    element.className = "order-train-number";
    element.textContent = `${trainNumber} →`;
    return element;
  }

  /** 根据订单状态提供对应操作 */
  function createOrderActions(order) {
    const status = order.status;
    const query = "?id=" + encodeURIComponent(order.id);
    const actions = document.createElement("footer");
    actions.className = "order-actions";

    if (status === "paid") {
      actions.append(createActionLink("退票", "refund.html" + query), createActionLink("改签", "reschedule.html" + query, true));
    } else if (status === "pending") {
      actions.append(createActionButton("取消订单", async () => { if (!confirm("确认取消订单？")) return; try { await global.Mini12306API.request("/orders/" + encodeURIComponent(order.id) + "/cancel", {method:"POST"}); location.reload(); } catch (error) { global.Mini12306Utils.showToast(error.message); } }), createActionLink("继续支付", "payment.html" + query, true));
    } else {
      actions.append(createActionButton("查看详情", () => global.Mini12306Utils.showToast("订单号：" + order.orderNumber)));
    }

    return actions;
  }

  function createActionLink(label, href, primary = false) {
    const link = document.createElement("a");
    link.className = `small-button${primary ? " primary" : ""}`;
    link.href = href;
    link.textContent = label;
    return link;
  }

  function createActionButton(label, handler) {
    const button = document.createElement("button");
    button.className = "small-button";
    button.type = "button";
    button.textContent = label;
    if (handler) button.addEventListener("click", handler);
    return button;
  }

  /** 将 YYYY-MM-DD 简化为 MM月DD日 */
  function formatShortDate(dateText) {
    const parts = String(dateText || "").split("-");
    return parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日` : dateText;
  }
})(window);
