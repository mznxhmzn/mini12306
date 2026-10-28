// 列表及会话接口不输出完整手机号、身份证或密码哈希。
const maskPhone = value => String(value || '').replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
const maskId = value => value ? `${String(value).slice(0, 6)}********${String(value).slice(-4)}` : '';
const maskName = value => value ? value.length === 1 ? '*' : `${value[0]}*${value.length > 2 ? value.slice(-1) : ''}` : '';
function safeUser(user) { return { id: user._id, account: user.account, role: user.role, status: user.status, realNameMasked: maskName(user.realName), phoneMasked: maskPhone(user.phone), idNumberMasked: maskId(user.idNumber), verified: user.verified, createdAt: user.createdAt }; }
function plain(document) { const value = document.toObject ? document.toObject() : document; const { _id, __v, ...rest } = value; return { ...rest, id: _id }; }
function safePassenger(p) { return {id:p._id,ownerUserId:p.ownerUserId,nameMasked:p.name?maskName(p.name):p.nameMasked,idType:p.idType,idNumberMasked:p.idNumber?maskId(p.idNumber):p.idNumberMasked,passengerType:p.passengerType,createdAt:p.createdAt,updatedAt:p.updatedAt}; }
module.exports = { maskPhone, maskId, maskName, safeUser, safePassenger, plain };
