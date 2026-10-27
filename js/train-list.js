/** Mini-12306 车次列表查询、筛选与排序 */
(function (global) {
  "use strict";

  let currentFilter = "all";
  let currentSort = "departure";
  let matchedTrains = [];

  document.addEventListener("DOMContentLoaded", async () => {
    const storage = global.Mini12306Storage;
    const utils = global.Mini12306Utils;

    /* 车次列表属于受保护页面 */
    if (!await global.Mini12306RoleGuard.ready) return;

    const searchCondition = storage.getData(storage.STORAGE_KEYS.TRAIN_SEARCH, null);
    if (!searchCondition) {
      renderMissingSearch();
      utils.showToast("请先选择行程并查询车票", "warning");
      return;
    }

    renderSearchSummary(searchCondition);

    try {
      const query = new URLSearchParams({from: searchCondition.departureCity, to: searchCondition.arrivalCity, date: searchCondition.departureDate});
      const result = await global.Mini12306API.request('/trains?' + query);
      matchedTrains = result.trains;
    } catch (error) { utils.showToast(error.message); }
    bindFilterEvents();
    bindSortEvent();
    renderTrainList();
  });

  /** 将首页保存的查询条件展示在列表顶部 */
  function renderSearchSummary(searchCondition) {
    document.querySelector("#summary-departure").textContent = searchCondition.departureCity;
    document.querySelector("#summary-arrival").textContent = searchCondition.arrivalCity;
    document.querySelector("#summary-date").textContent = formatChineseDate(searchCondition.departureDate);
    document.querySelector("#student-badge").hidden = !searchCondition.studentTicket;
  }

  /** 绑定全部、高铁动车、普通列车三个筛选标签 */
  function bindFilterEvents() {
    document.querySelectorAll(".filter-button").forEach((button) => {
      button.addEventListener("click", () => {
        currentFilter = button.dataset.filter;

        document.querySelectorAll(".filter-button").forEach((item) => {
          const active = item === button;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-pressed", String(active));
        });

        renderTrainList();
      });
    });
  }

  /** 绑定排序下拉框 */
  function bindSortEvent() {
    document.querySelector("#train-sort").addEventListener("change", (event) => {
      currentSort = event.target.value;
      renderTrainList();
    });
  }

  /** 按当前筛选和排序条件重新渲染全部车次 */
  function renderTrainList() {
    const trainList = document.querySelector("#train-list");
    const resultCount = document.querySelector("#result-count");
    const filteredTrains = matchedTrains.filter(matchesCurrentFilter);
    const sortedTrains = filteredTrains.slice().sort(compareTrains);

    trainList.replaceChildren();
    resultCount.textContent = `共找到 ${sortedTrains.length} 趟车次`;

    if (sortedTrains.length === 0) {
      trainList.appendChild(createEmptyState());
      return;
    }

    sortedTrains.forEach((train) => trainList.appendChild(createTrainCard(train)));
  }

  /** 判断车次是否符合当前类型筛选 */
  function matchesCurrentFilter(train) {
    if (currentFilter === "all") {
      return true;
    }

    const highSpeed = /^(G|D|C)/.test(train.trainNumber)
      || train.trainType === "高速动车"
      || train.trainType === "动车组";
    return currentFilter === "high-speed" ? highSpeed : !highSpeed;
  }

  /** 根据当前排序方式比较两趟车 */
  function compareTrains(firstTrain, secondTrain) {
    if (currentSort === "duration") {
      return firstTrain.durationMinutes - secondTrain.durationMinutes;
    }

    if (currentSort === "price") {
      return getLowestPrice(firstTrain) - getLowestPrice(secondTrain);
    }

    return firstTrain.departureTime.localeCompare(secondTrain.departureTime);
  }

  /** 创建单个车次卡片 */
  function createTrainCard(train) {
    const utils = global.Mini12306Utils;
    const card = document.createElement("article");
    const totalRemaining = train.seats.reduce((total, seat) => total + seat.remaining, 0);
    const soldOut = totalRemaining === 0;
    card.className = `train-card${soldOut ? " is-sold-out" : ""}`;

    const cardHeader = document.createElement("div");
    cardHeader.className = "train-card-header";

    const trainIdentity = document.createElement("div");
    trainIdentity.className = "train-identity";
    const trainNumber = document.createElement("strong");
    trainNumber.textContent = train.trainNumber;
    const trainType = document.createElement("span");
    trainType.textContent = train.trainType;
    trainIdentity.append(trainNumber, trainType);

    const lowestPrice = document.createElement("p");
    lowestPrice.className = "lowest-price";
    lowestPrice.innerHTML = `<strong>${utils.formatCurrency(getLowestPrice(train))}</strong><span>起</span>`;
    cardHeader.append(trainIdentity, lowestPrice);

    const route = document.createElement("div");
    route.className = "train-route";
    route.append(
      createStationBlock(train.departureTime, train.departureStation, "始"),
      createDurationBlock(utils.formatDuration(train.durationMinutes)),
      createStationBlock(train.arrivalTime, train.arrivalStation, "终")
    );

    const seatList = document.createElement("div");
    seatList.className = "seat-list";
    train.seats.forEach((seat) => seatList.appendChild(createSeatItem(seat)));

    const actionButton = document.createElement("button");
    actionButton.className = "select-train-button";
    actionButton.type = "button";
    actionButton.disabled = soldOut;
    actionButton.textContent = soldOut ? "无票" : "选择车次";
    if (!soldOut) {
      actionButton.addEventListener("click", () => {
        /* 通过地址传递所选车次，订单确认页重新向服务端核对票价。 */
        const search = global.Mini12306Storage.getData('trainSearch');
        global.location.href = 'order-confirm.html?' + new URLSearchParams({trainId: train.id, date: search.departureDate, from: search.departureCity, to: search.arrivalCity});
      });
    }

    card.append(cardHeader, route, seatList, actionButton);
    return card;
  }

  /** 创建出发站或到达站信息 */
  function createStationBlock(time, station, stationTag) {
    const block = document.createElement("div");
    block.className = "station-block";

    const timeText = document.createElement("strong");
    timeText.textContent = time;
    const stationText = document.createElement("p");
    stationText.textContent = station;
    const tag = document.createElement("span");
    tag.textContent = stationTag;
    stationText.prepend(tag);
    block.append(timeText, stationText);
    return block;
  }

  /** 创建行程历时信息 */
  function createDurationBlock(durationText) {
    const block = document.createElement("div");
    block.className = "duration-block";
    const line = document.createElement("span");
    const text = document.createElement("p");
    text.textContent = durationText;
    block.append(line, text);
    return block;
  }

  /** 创建一个席别及其余票状态 */
  function createSeatItem(seat) {
    const item = document.createElement("div");
    const status = getAvailabilityStatus(seat.remaining);
    item.className = "seat-item";

    const name = document.createElement("span");
    name.className = "seat-name";
    name.textContent = seat.seatType;

    const price = document.createElement("span");
    price.className = "seat-price";
    price.textContent = global.Mini12306Utils.formatCurrency(seat.price);

    const availability = document.createElement("span");
    availability.className = `seat-availability ${status.className}`;
    availability.textContent = status.label;

    item.append(name, price, availability);
    return item;
  }

  /** 按余票数量返回对应的状态文字和颜色类名 */
  function getAvailabilityStatus(remaining) {
    if (remaining > 20) {
      return { label: "充足", className: "sufficient" };
    }

    if (remaining > 0) {
      return { label: "紧张", className: "limited" };
    }

    return { label: "无票", className: "unavailable" };
  }

  /** 获取一趟车的最低票价 */
  function getLowestPrice(train) {
    return Math.min(...train.seats.map((seat) => seat.price));
  }

  /** 没有符合条件的车次时显示空状态 */
  function createEmptyState() {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.innerHTML = `
      <div class="empty-state-icon" aria-hidden="true">车</div>
      <h2>没有找到符合条件的车次</h2>
      <p>请更换日期、出发地或车次类型后重新查询。</p>
      <a href="../index.html">返回修改行程</a>
    `;
    return emptyState;
  }

  /** 没有查询条件时提示用户先返回首页 */
  function renderMissingSearch() {
    document.querySelector("#result-count").textContent = "暂无查询条件";
    document.querySelector("#train-list").appendChild(createEmptyState());
  }

  /** 将 YYYY-MM-DD 转换为中文日期，避免时区造成日期偏移 */
  function formatChineseDate(dateText) {
    const [year, month, day] = dateText.split("-").map(Number);
    if (!year || !month || !day) {
      return dateText;
    }

    const weekNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const date = new Date(year, month - 1, day);
    return `${month}月${day}日 ${weekNames[date.getDay()]}`;
  }
})(window);
