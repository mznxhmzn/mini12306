/** 角色工作台：所有数据均经 API 读写，文字使用 textContent 防止注入。 */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await Mini12306RoleGuard.ready;
  if (!user) return;
  const api = Mini12306API, toast = Mini12306Utils.showToast;
  const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };
  function submit(form, handler) {
    form.addEventListener('submit', async event => { event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true; try { await handler(); } catch (error) { toast(error.message); } finally { button.disabled = false; } });
  }
  try {
    const dashboard = document.querySelector('#dashboard-stats');
    if (dashboard) {
      const [{trains}, {users}, orderPage] = await Promise.all([api.request('/admin/trains'), api.request('/admin/users'), api.request('/orders/all')]);
      const orders=orderPage.orders;
      dashboard.textContent = `${trains.length} 条车次 · ${users.length} 个用户 · ${orderPage.total} 笔订单`;
      const list = document.querySelector('#all-orders');
      for (const order of orders) list.append(node('p', `${order.orderNumber}　${order.passengerNameMasked}　${order.trainNumber}　${order.departureDate}　${order.status}　${Mini12306Utils.formatCurrency(order.amount)}`));
      if (!orders.length) list.textContent = '暂无订单';
      let orderPageNumber=1;
      const more=node('button','加载更多','secondary-button');more.type='button';list.after(more);more.hidden=!orderPage.hasMore;
      more.onclick=async()=>{more.disabled=true;try{const result=await api.request('/orders/all?'+new URLSearchParams({page:orderPageNumber+1,limit:20}));for(const order of result.orders)list.append(node('p',order.orderNumber+'　'+order.passengerNameMasked+'　'+order.trainNumber+'　'+order.status));orderPageNumber=result.page;more.hidden=!result.hasMore;}catch(error){toast(error.message);}finally{more.disabled=false;}};
    }
    const trainList = document.querySelector('#admin-trains');
    if (trainList) {
      const {trains} = await api.request('/admin/trains'); trainList.replaceChildren();
      for (const train of trains) {
        const card = node('article', undefined, 'section-card admin-card');
        card.append(node('h2', train.trainNumber + '　' + train.trainType), node('p', train.departureStation + ' → ' + train.arrivalStation), node('p', train.bookable ? '允许售票' : '停止售票'));
        const edit = node('a', '编辑', 'small-button primary'); edit.href = 'train-form.html?id=' + encodeURIComponent(train.id);
        const remove = node('button', '删除', 'small-button'); remove.type = 'button';
        remove.onclick = async () => { if (!confirm('确认删除 ' + train.trainNumber + '？有关联订单时无法删除。')) return; remove.disabled = true; try { await api.request('/admin/trains/' + encodeURIComponent(train.id), {method: 'DELETE'}); card.remove(); } catch (error) { toast(error.message); } finally { remove.disabled = false; } };
        const actions = node('div', undefined, 'admin-toolbar'); actions.append(edit, remove); card.append(actions); trainList.append(card);
      }
    }
    const form = document.querySelector('#train-form');
    if (form) {
      const id = new URLSearchParams(location.search).get('id');
      const fields = ['trainNumber','trainType','departureStation','arrivalStation','departureCity','arrivalCity','departureTime','arrivalTime','durationMinutes'];
      const dates = new Set(); let locked = false;
      function seatRow(seat = {seatType: '', price: 0, remaining: 0}) {
        const row = node('div', undefined, 'seat-row');
        ['seatType', 'price', 'remaining'].forEach(field => {
          const input = node('input', undefined, 'form-control'); input.dataset.field = field; input.value = seat[field]; input.type = field === 'seatType' ? 'text' : 'number'; input.required = true;
          input.setAttribute('aria-label', {seatType:'席别名称', price:'票价', remaining:'余票'}[field]);
          if (input.type === 'number') { input.min = '0'; input.step = field === 'price' ? '0.01' : '1'; }
          row.append(input);
        });
        const remove = node('button', '删除', 'small-button'); remove.type = 'button'; remove.disabled = locked; remove.onclick = () => row.remove(); row.append(remove); document.querySelector('#seat-rows').append(row);
      }
      function renderDates() {
        const tags = document.querySelector('#date-tags'); tags.replaceChildren();
        [...dates].sort().forEach(date => { const tag = node('span', date, 'date-tag'); const remove = node('button', '×'); remove.type = 'button'; remove.setAttribute('aria-label', '删除日期 ' + date); remove.onclick = () => { dates.delete(date); renderDates(); }; tag.append(remove); tags.append(tag); });
      }
      if (id) {
        const {train} = await api.request('/admin/trains/' + encodeURIComponent(id)); locked = train.coreLocked;
        fields.forEach(field => { document.getElementById(field).value = train[field]; });
        if (locked) { document.querySelector('#core-warning').hidden = false; fields.forEach(field => { document.getElementById(field).disabled = true; }); }
        train.seats.forEach(seatRow); train.operatingDates.forEach(date => dates.add(date));
        document.querySelector('#bookable').checked = train.bookable; document.querySelector('#stops').value = train.stops.join('，'); document.querySelector('#stops').disabled = locked;
      } else seatRow({seatType: '二等座', price: 100, remaining: 30});
      renderDates();
      document.querySelector('#add-seat').onclick = () => seatRow();
      document.querySelector('#add-date').onclick = () => { const date = document.querySelector('#operating-date').value; if (!date) return toast('请选择日期'); dates.add(date); renderDates(); };
      submit(form, async () => {
        const body = {};
        if (!locked) { fields.forEach(field => { body[field] = field === 'durationMinutes' ? Number(document.getElementById(field).value) : document.getElementById(field).value.trim(); }); body.stops = document.querySelector('#stops').value.split(/[,，]/).map(s => s.trim()).filter(Boolean); }
        body.seats = [...document.querySelectorAll('.seat-row')].map(row => { const values = {}; row.querySelectorAll('input').forEach(input => { values[input.dataset.field] = input.dataset.field === 'seatType' ? input.value.trim() : Number(input.value); }); return values; });
        body.operatingDates = [...dates]; body.bookable = document.querySelector('#bookable').checked;
        if (locked && !confirm('保存将更新每个运营日的可售余票，确认继续？')) return;
        await api.request('/admin/trains' + (id ? '/' + encodeURIComponent(id) : ''), {method: id ? 'PUT' : 'POST', body}); location.href = 'trains.html';
      });
    }
    const userList = document.querySelector('#admin-users');
    if (userList) {
      const {users} = await api.request('/admin/users');
      for (const item of users) {
        const card = node('article', undefined, 'admin-card'); card.append(node('strong', `${item.account}　${item.realNameMasked}`), node('p', `${item.id}　${item.phoneMasked}　${item.idNumberMasked || ''}`));
        const select = node('select', undefined, 'select-control');
        [['passenger','旅客'],['clerk','售票员'],['admin','管理员']].forEach(([value,label]) => { const option = node('option', label); option.value = value; select.append(option); }); select.value = item.role; select.disabled = item.id === user.id;
        select.onchange = async () => { try { await api.request('/admin/users/' + encodeURIComponent(item.id) + '/role', {method:'PATCH', body:{role: select.value}}); item.role = select.value; toast('角色已更新，原登录令牌将失效'); } catch (error) { select.value = item.role; toast(error.message); } }; card.append(select); userList.append(card);
      }
      submit(document.querySelector('#create-user'), async () => {
        const body = {}; ['account','phone','realName','password','role'].forEach(field => { body[field] = document.getElementById(field).value; });
        await api.request('/admin/users', {method:'POST', body}); location.reload();
      });
    }
    const search = document.querySelector('#clerk-search');
    if (search) {
      let choices = [], requestId = crypto.randomUUID();
      const choiceSelect = document.querySelector('#issue-choice');
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); document.querySelector('#date').value = Mini12306Utils.formatDate(tomorrow);
      submit(search, async () => {
        const query = new URLSearchParams(); ['from','to','date'].forEach(field => query.set(field, document.getElementById(field).value));
        const {trains} = await api.request('/trains?' + query);
        choices = trains.flatMap(train => train.seats.filter(seat => seat.remaining > 0).map(seat => ({train, seat, date: document.querySelector('#date').value})));
        choiceSelect.replaceChildren(); choices.forEach((choice,index) => { const option = node('option', `${choice.train.trainNumber} ${choice.seat.seatType} ${Mini12306Utils.formatCurrency(choice.seat.price)}`); option.value = index; choiceSelect.append(option); });
        if (!choices.length) toast('暂无有票车次');
      });
      submit(document.querySelector('#issue-form'), async () => {
        const choice = choices[Number(choiceSelect.value)]; if (!choice) throw new Error('请先查询并选择车次');
        const {order} = await api.request('/clerk/orders/issue', {method:'POST', body:{userId: document.querySelector('#userId').value.trim(), trainId: choice.train.id, departureDate: choice.date, seatType: choice.seat.seatType, requestId}});
        document.querySelector('#issue-result').textContent = '出票成功：' + order.orderNumber; requestId = crypto.randomUUID();
      });
    }
  } catch (error) { toast(error.message); }
});
