/** 订单确认、模拟支付、退票、改签统一使用服务器资料。 */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await Mini12306RoleGuard.ready;
  if (!user) return;
  const api = Mini12306API, utils = Mini12306Utils;
  const params = new URLSearchParams(location.search);
  const main = document.querySelector('main');
  const page = location.pathname.split('/').pop();
  // 用户输入及数据库文字先转义，再插入保留原样式的模板。
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));
  const money = value => utils.formatCurrency(value);
  const routeCard = order => `<section class="section-card journey-card"><div class="journey-card-top"><strong>${escape(order.trainNumber)}</strong><span>${escape(order.departureDate)}</span></div><div class="journey-route"><div class="journey-station"><strong class="journey-time">${escape(order.departureTime)}</strong><p>${escape(order.departureStation)}</p></div><div class="journey-direction">→</div><div class="journey-station"><strong class="journey-time">${escape(order.arrivalTime)}</strong><p>${escape(order.arrivalStation)}</p></div></div><div class="journey-detail"><span>${escape(order.passengerNameMasked || user.realNameMasked)}</span><span>${escape(order.seatType || '')}</span><strong>${money(order.amount || 0)}</strong></div></section>`;
  function bindSubmit(handler) {
    const button = main.querySelector('.page-submit');
    button.addEventListener('click', async event => { event.preventDefault(); if (button.disabled) return; button.disabled = true; try { await handler(); } catch (error) { utils.showToast(error.message); } finally { button.disabled = false; } });
  }
  try {
    if (page === 'order-confirm.html') {
      const date = params.get('date');
      const query = new URLSearchParams({from: params.get('from'), to: params.get('to'), date});
      const [{trains}, {passengers}] = await Promise.all([api.request('/trains?' + query), api.request('/passengers')]);
      const train = trains.find(item => item.id === params.get('trainId'));
      if (!train) throw new Error('请返回车次列表重新选择车次');
      main.innerHTML = routeCard({...train, departureDate: date}) + `<section class="section-card form-stack"><h2>选择乘车人</h2><select id="passenger-choice" class="select-control"><option value="">${escape(user.realNameMasked)}（本人）</option>${passengers.map(p => `<option value="${escape(p.id)}">${escape(p.nameMasked)} · ${escape(p.idNumberMasked)}</option>`).join('')}</select></section><section class="section-card form-stack"><h2>车票信息</h2><label for="seat-type">席别</label><select id="seat-type" class="select-control">${train.seats.map(s => `<option value="${escape(s.seatType)}" ${s.remaining <= 0 ? 'disabled' : ''}>${escape(s.seatType)}　${money(s.price)}　余票 ${s.remaining}</option>`).join('')}</select></section><section class="section-card"><h2>费用明细</h2><div class="price-row price-total"><span>应付金额</span><strong id="booking-total"></strong></div></section><label class="agreement-row"><input id="booking-agreement" type="checkbox" checked><span>我已核对车次、日期、乘车人及席别</span></label><button type="button" class="primary-button page-submit">提交订单</button>`;
      const seatSelect = document.querySelector('#seat-type');
      const firstAvailable = train.seats.find(s => s.remaining > 0);
      if (!firstAvailable) throw new Error('该车次已无票');
      seatSelect.value = firstAvailable.seatType;
      const update = () => { document.querySelector('#booking-total').textContent = money(train.seats.find(s => s.seatType === seatSelect.value).price); };
      seatSelect.onchange = update; update();
      const requestId = crypto.randomUUID();
      bindSubmit(async () => {
        if (!document.querySelector('#booking-agreement').checked) throw new Error('请确认订单信息');
        const {order} = await api.request('/orders', {method: 'POST', body: {trainId: train.id, departureDate: date, seatType: seatSelect.value, passengerId: document.querySelector('#passenger-choice').value || undefined, requestId}});
        location.href = 'payment.html?id=' + encodeURIComponent(order.id);
      });
      return;
    }
    const id = params.get('id');
    if (!id) throw new Error('缺少订单编号，请从我的订单进入');
    const {order} = await api.request('/orders/' + encodeURIComponent(id));
    const endpoint = '/orders/' + encodeURIComponent(id);
    if (page === 'payment.html') {
      document.querySelector('.payment-amount').textContent = money(order.amount);
      const countdown = document.querySelector('.payment-countdown');
      const tick = () => { const seconds = Math.max(0, Math.floor((Date.parse(order.expiresAt) - Date.now()) / 1000)); countdown.textContent = order.status === 'pending' ? '剩余支付时间 ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') : '订单状态：' + order.status; };
      tick(); setInterval(tick, 1000);
      main.innerHTML = routeCard(order) + `<section class="section-card form-stack"><h2>模拟支付方式</h2><select id="payment-choice" class="select-control"><option>模拟支付宝</option><option>模拟微信支付</option><option>模拟银行卡</option></select></section><div class="notice-box">仅模拟支付，不产生真实扣款。</div><button class="primary-button page-submit" type="button">确认模拟支付 ${money(order.amount)}</button>`;
      if (order.status !== 'pending') main.querySelector('button').disabled = true;
      bindSubmit(async () => { await api.request(endpoint + '/pay', {method: 'POST', body: {method: document.querySelector('#payment-choice').value}}); location.href = 'orders.html'; });
    } else if (page === 'refund.html') {
      const fee = Math.round(order.amount * 5) / 100;
      main.innerHTML = routeCard(order) + `<section class="section-card"><h2>退款明细</h2><div class="price-row"><span>原票款</span><strong>${money(order.amount)}</strong></div><div class="price-row"><span>退票手续费（5%）</span><strong>-${money(fee)}</strong></div><div class="price-row price-total"><span>预计退款</span><strong>${money(order.amount - fee)}</strong></div></section><section class="section-card form-stack"><label for="refund-reason">退票原因</label><select id="refund-reason" class="select-control"><option>行程有变</option><option>购买错误</option><option>其他原因</option></select><label class="agreement-row"><input id="refund-agreement" type="checkbox"><span>我已确认退款金额及规则</span></label></section><button type="button" class="primary-button page-submit">确认退票</button>`;
      if (order.status !== 'paid') main.querySelector('button').disabled = true;
      bindSubmit(async () => { if (!document.querySelector('#refund-agreement').checked) throw new Error('请确认退款规则'); await api.request(endpoint + '/refund', {method: 'POST', body: {reason: document.querySelector('#refund-reason').value}}); location.href = 'orders.html'; });
    } else if (page === 'reschedule.html') {
      main.innerHTML = routeCard(order) + `<section class="section-card form-stack"><label for="new-date">新出发日期</label><input id="new-date" class="form-control" type="date" value="${escape(order.departureDate)}"><label for="new-train">可选车次及席别</label><select id="new-train" class="select-control"></select><p id="difference" class="muted-text"></p></section><div class="notice-box">确认后模拟补款或退款；新票成功才关闭原票。</div><button type="button" class="primary-button page-submit">确认改签</button>`;
      const dateInput = document.querySelector('#new-date'), select = document.querySelector('#new-train');
      let choices = [], loading = false;
      const difference = () => { const choice = choices[Number(select.value)]; document.querySelector('#difference').textContent = choice ? '票价差额：' + money(choice.seat.price - order.amount) : '暂无其他有票行程'; };
      async function refresh() {
        loading = true; select.disabled = true; choices = []; select.replaceChildren(); difference();
        try {
          const {trains} = await api.request('/trains?' + new URLSearchParams({from: order.departureCity, to: order.arrivalCity, date: dateInput.value}));
          choices = trains.flatMap(train => train.seats.filter(seat => seat.remaining > 0 && (train.id !== order.trainId || dateInput.value !== order.departureDate || seat.seatType !== order.seatType)).map(seat => ({train, seat})));
          choices.forEach((choice, index) => { const option = document.createElement('option'); option.value = index; option.textContent = `${choice.train.trainNumber} ${choice.train.departureTime} ${choice.seat.seatType} ${money(choice.seat.price)}`; select.append(option); });
          difference();
        } finally { loading = false; select.disabled = false; }
      }
      dateInput.onchange = () => refresh().catch(error => utils.showToast(error.message)); select.onchange = difference; await refresh();
      bindSubmit(async () => { const choice = choices[Number(select.value)]; if (!choice || loading) throw new Error('请先选择有票的新行程'); if (!confirm('确认模拟补款或退款并完成改签？')) return; await api.request(endpoint + '/reschedule', {method: 'POST', body: {trainId: choice.train.id, departureDate: dateInput.value, seatType: choice.seat.seatType}}); location.href = 'orders.html'; });
    }
  } catch (error) {
    main.replaceChildren(); const notice = document.createElement('section'); notice.className = 'section-card'; notice.textContent = error.message;
    const back = document.createElement('a'); back.href = 'orders.html'; back.textContent = '返回我的订单'; back.className = 'secondary-button'; notice.append(back); main.append(notice); utils.showToast(error.message);
  }
});
