/** 本地只保存会话和查询条件，业务数据由服务器管理。 */
(function(global) {
  const DB_VERSION = '2.0';
  const STORAGE_KEYS = {CURRENT_USER:'currentUser', TOKEN:'token', TRAIN_SEARCH:'trainSearch'};
  const name = key => key === 'currentUser' ? key : 'mini12306_' + key;
  function getData(key, fallback=null) { try { const value=localStorage.getItem(name(key)); return value===null ? fallback : JSON.parse(value); } catch { return fallback; } }
  function setData(key,value) { try { localStorage.setItem(name(key),JSON.stringify(value)); return true; } catch { return false; } }
  function removeData(key) { localStorage.removeItem(name(key)); }
  function clearSession() { removeData('token'); removeData('currentUser'); }
  if(getData('frontendVersion')!==DB_VERSION) {
    // 升级时仅移除旧的本地演示业务缓存。
    for(const key of ['users','orders','trains','frequentPassengers','paymentRecords','refundRecords','loginAttempts']) removeData(key);
    clearSession(); setData('frontendVersion',DB_VERSION);
  }
  global.Mini12306Storage={DB_VERSION,STORAGE_KEYS,getData,setData,removeData,clearSession};
})(window);
