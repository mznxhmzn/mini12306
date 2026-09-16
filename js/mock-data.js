/**
 * Mini-12306 演示数据
 * 所有姓名、手机号、证件号、银行卡和车次均为虚构内容，仅用于本地演示。
 */
(function (global) {
  "use strict";

  /** 生成从今天开始的未来日期，确保演示车次始终可以查询 */
  function getFutureDate(dayOffset) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + dayOffset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /** 默认提供未来七天的运行日期 */
  const operatingDates = Array.from({ length: 7 }, (_, index) => getFutureDate(index + 1));

  const stations = [
    { id: "ST-BJ", name: "北京南", city: "北京", code: "VNP", pinyin: "beijingnan" },
    { id: "ST-WH", name: "武汉", city: "武汉", code: "WHN", pinyin: "wuhan" },
    { id: "ST-SH", name: "上海虹桥", city: "上海", code: "AOH", pinyin: "shanghaihongqiao" },
    { id: "ST-GZ", name: "广州南", city: "广州", code: "IZQ", pinyin: "guangzhounan" },
    { id: "ST-CS", name: "长沙南", city: "长沙", code: "CWQ", pinyin: "changshanan" },
    { id: "ST-ZZ", name: "郑州东", city: "郑州", code: "ZAF", pinyin: "zhengzhoudong" },
    { id: "ST-HF", name: "合肥南", city: "合肥", code: "ENH", pinyin: "hefeinan" },
    { id: "ST-NJ", name: "南京南", city: "南京", code: "NKH", pinyin: "nanjingnan" }
  ];

  /** 8 条模拟车次，覆盖武汉往返北京、上海、广州等线路 */
  const trains = [
    {
      id: "TRAIN-G66",
      trainNumber: "G66",
      trainType: "高速动车",
      departureStation: "武汉",
      arrivalStation: "北京南",
      departureCity: "武汉",
      arrivalCity: "北京",
      departureTime: "07:38",
      arrivalTime: "11:30",
      durationMinutes: 232,
      operatingDates,
      stops: ["武汉", "郑州东", "石家庄", "北京南"],
      seats: [
        { seatType: "二等座", price: 520.5, remaining: 36 },
        { seatType: "一等座", price: 832.5, remaining: 12 },
        { seatType: "商务座", price: 1643.5, remaining: 3 }
      ],
      bookable: true
    },
    {
      id: "TRAIN-Z38",
      trainNumber: "Z38",
      trainType: "普通列车",
      departureStation: "武汉",
      arrivalStation: "北京南",
      departureCity: "武汉",
      arrivalCity: "北京",
      departureTime: "21:10",
      arrivalTime: "06:40",
      durationMinutes: 570,
      operatingDates,
      stops: ["武汉", "信阳", "郑州", "石家庄", "北京南"],
      seats: [
        { seatType: "硬座", price: 152.5, remaining: 0 },
        { seatType: "硬卧", price: 261.5, remaining: 0 },
        { seatType: "软卧", price: 409.5, remaining: 0 }
      ],
      bookable: true
    },
    {
      id: "TRAIN-G1722",
      trainNumber: "G1722",
      trainType: "高速动车",
      departureStation: "武汉",
      arrivalStation: "上海虹桥",
      departureCity: "武汉",
      arrivalCity: "上海",
      departureTime: "08:00",
      arrivalTime: "12:03",
      durationMinutes: 243,
      operatingDates,
      stops: ["武汉", "合肥南", "南京南", "上海虹桥"],
      seats: [
        { seatType: "二等座", price: 336, remaining: 42 },
        { seatType: "一等座", price: 537, remaining: 9 },
        { seatType: "商务座", price: 1038, remaining: 2 }
      ],
      bookable: true
    },
    {
      id: "TRAIN-Z25",
      trainNumber: "Z25",
      trainType: "普通列车",
      departureStation: "武汉",
      arrivalStation: "上海虹桥",
      departureCity: "武汉",
      arrivalCity: "上海",
      departureTime: "21:58",
      arrivalTime: "08:10",
      durationMinutes: 612,
      operatingDates,
      stops: ["武汉", "鄂州", "黄石", "杭州南", "上海虹桥"],
      seats: [
        { seatType: "硬座", price: 128.5, remaining: 24 },
        { seatType: "硬卧", price: 232.5, remaining: 13 },
        { seatType: "软卧", price: 367.5, remaining: 2 }
      ],
      bookable: true
    },
    {
      id: "TRAIN-G1001",
      trainNumber: "G1001",
      trainType: "高速动车",
      departureStation: "北京南",
      arrivalStation: "武汉",
      departureCity: "北京",
      arrivalCity: "武汉",
      departureTime: "09:15",
      arrivalTime: "13:37",
      durationMinutes: 262,
      operatingDates,
      stops: ["北京南", "石家庄", "郑州东", "武汉"],
      seats: [
        { seatType: "二等座", price: 520.5, remaining: 29 },
        { seatType: "一等座", price: 832.5, remaining: 8 },
        { seatType: "商务座", price: 1643.5, remaining: 2 }
      ],
      bookable: true
    },
    {
      id: "TRAIN-G1721",
      trainNumber: "G1721",
      trainType: "高速动车",
      departureStation: "上海虹桥",
      arrivalStation: "武汉",
      departureCity: "上海",
      arrivalCity: "武汉",
      departureTime: "06:52",
      arrivalTime: "11:05",
      durationMinutes: 253,
      operatingDates,
      stops: ["上海虹桥", "南京南", "合肥南", "武汉"],
      seats: [
        { seatType: "二等座", price: 336, remaining: 34 },
        { seatType: "一等座", price: 537, remaining: 11 },
        { seatType: "商务座", price: 1038, remaining: 3 }
      ],
      bookable: true
    },
    {
      id: "TRAIN-G1152",
      trainNumber: "G1152",
      trainType: "高速动车",
      departureStation: "广州南",
      arrivalStation: "武汉",
      departureCity: "广州",
      arrivalCity: "武汉",
      departureTime: "11:30",
      arrivalTime: "15:58",
      durationMinutes: 268,
      operatingDates,
      stops: ["广州南", "韶关", "长沙南", "武汉"],
      seats: [
        { seatType: "二等座", price: 463.5, remaining: 25 },
        { seatType: "一等座", price: 738.5, remaining: 7 },
        { seatType: "商务座", price: 1458.5, remaining: 1 }
      ],
      bookable: true
    },
    {
      id: "TRAIN-G2035",
      trainNumber: "G2035",
      trainType: "高速动车",
      departureStation: "武汉",
      arrivalStation: "广州南",
      departureCity: "武汉",
      arrivalCity: "广州",
      departureTime: "17:15",
      arrivalTime: "21:42",
      durationMinutes: 267,
      operatingDates,
      stops: ["武汉", "岳阳东", "长沙南", "广州南"],
      seats: [
        { seatType: "二等座", price: 463.5, remaining: 31 },
        { seatType: "一等座", price: 738.5, remaining: 10 },
        { seatType: "商务座", price: 1458.5, remaining: 2 }
      ],
      bookable: true
    }
  ];

  /** 四个测试用户，覆盖旅客、售票员和管理员角色 */
  const users = [
    {
      id: "USER-001",
      account: "traveler",
      phone: "13800008001",
      phoneMasked: "138****8001",
      passwordHash: "demo$123456",
      role: "passenger",
      status: "active",
      realName: "张小明",
      realNameMasked: "张*明",
      idType: "居民身份证",
      idNumberMasked: "420106********1234",
      verified: true,
      paymentMethods: [{ token: "DEMO-CARD-001", bankName: "演示银行", lastFour: "8888" }],
      createdAt: "2026-09-01T09:00:00+08:00"
    },
    {
      id: "USER-002",
      account: "clerk",
      phone: "13800008002",
      phoneMasked: "138****8002",
      passwordHash: "demo$123456",
      role: "clerk",
      status: "active",
      realName: "李小华",
      realNameMasked: "李*华",
      idType: "居民身份证",
      idNumberMasked: "420102********5678",
      verified: true,
      paymentMethods: [],
      createdAt: "2026-09-01T09:10:00+08:00"
    },
    {
      id: "USER-003",
      account: "admin",
      phone: "13800008003",
      phoneMasked: "138****8003",
      passwordHash: "demo$123456",
      role: "admin",
      status: "active",
      realName: "王小安",
      realNameMasked: "王*安",
      idType: "居民身份证",
      idNumberMasked: "420104********9012",
      verified: true,
      paymentMethods: [],
      createdAt: "2026-09-01T09:20:00+08:00"
    },
    {
      id: "USER-004",
      account: "traveler2",
      phone: "13800008004",
      phoneMasked: "138****8004",
      passwordHash: "demo$123456",
      role: "passenger",
      status: "active",
      realName: "陈小雨",
      realNameMasked: "陈*雨",
      idType: "居民身份证",
      idNumberMasked: "420105********2468",
      verified: true,
      paymentMethods: [{ token: "DEMO-CARD-004", bankName: "演示银行", lastFour: "6666" }],
      createdAt: "2026-09-11T10:00:00+08:00"
    }
  ];

  /** 按产品规范第 10 节提供完整的数据集合 */
  global.Mini12306MockData = {
    users,
    realNameVerifications: users.map((user) => ({
      id: `VERIFY-${user.id}`,
      userId: user.id,
      status: "verified",
      verifiedAt: user.createdAt,
      provider: "本地模拟认证"
    })),
    frequentPassengers: [
      {
        id: "PASSENGER-001",
        ownerUserId: "USER-001",
        nameMasked: "张*明",
        idType: "居民身份证",
        idNumberMasked: "420106********1234",
        passengerType: "成人"
      },
      {
        id: "PASSENGER-004",
        ownerUserId: "USER-004",
        nameMasked: "陈*雨",
        idType: "居民身份证",
        idNumberMasked: "420105********2468",
        passengerType: "成人"
      }
    ],
    stations,
    trains,
    orders: [
      {
        id: "ORDER-001",
        orderNumber: "E202609120001",
        userId: "USER-001",
        passengerId: "PASSENGER-001",
        passengerNameMasked: "张*明",
        trainId: "TRAIN-G66",
        trainNumber: "G66",
        departureCity: "武汉",
        arrivalCity: "北京",
        departureStation: "武汉",
        arrivalStation: "北京南",
        departureDate: operatingDates[0],
        departureTime: "07:38",
        arrivalTime: "11:30",
        seatType: "二等座",
        amount: 520.5,
        status: "paid",
        createdAt: "2026-09-11T10:20:00+08:00"
      },
      {
        id: "ORDER-002",
        orderNumber: "E202609120002",
        userId: "USER-001",
        passengerId: "PASSENGER-001",
        passengerNameMasked: "张*明",
        trainId: "TRAIN-G1722",
        trainNumber: "G1722",
        departureCity: "武汉",
        arrivalCity: "上海",
        departureStation: "武汉",
        arrivalStation: "上海虹桥",
        departureDate: operatingDates[1],
        departureTime: "08:00",
        arrivalTime: "12:03",
        seatType: "二等座",
        amount: 336,
        status: "pending",
        createdAt: "2026-09-11T10:35:00+08:00"
      },
      {
        id: "ORDER-004",
        orderNumber: "E202609120004",
        userId: "USER-004",
        passengerId: "PASSENGER-004",
        passengerNameMasked: "陈*雨",
        trainId: "TRAIN-Z25",
        trainNumber: "Z25",
        departureCity: "武汉",
        arrivalCity: "上海",
        departureStation: "武汉",
        arrivalStation: "上海虹桥",
        departureDate: operatingDates[2],
        departureTime: "21:58",
        arrivalTime: "08:10",
        seatType: "硬卧",
        amount: 232.5,
        status: "paid",
        createdAt: "2026-09-11T11:00:00+08:00"
      }
    ],
    paymentRecords: [
      { id: "PAY-001", orderId: "ORDER-001", userId: "USER-001", amount: 520.5, method: "模拟支付宝", status: "success" },
      { id: "PAY-004", orderId: "ORDER-004", userId: "USER-004", amount: 232.5, method: "模拟银行卡", status: "success" }
    ],
    refundRecords: [],
    rebookingRelations: [],
    systemConfig: {
      orderPaymentMinutes: 15,
      saleAdvanceDays: 15,
      studentTicketEnabled: true,
      maintenanceMode: false
    },
    announcements: [
      {
        id: "NOTICE-001",
        title: "演示版本说明",
        content: "当前车次、身份认证和支付数据均为本地模拟数据。",
        publishedAt: "2026-09-01T08:00:00+08:00",
        enabled: true
      }
    ],
    loginRecords: [],
    auditLogs: []
  };
})(window);
