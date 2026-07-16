(() => {
  const PIN_LENGTH = 4;
  let pin = '';
  let busy = false;

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => document.getElementById(`dot${i}`));
  const pinDisplay = document.getElementById('pinDisplay');
  const errorMsg  = document.getElementById('errorMsg');
  const loading   = document.getElementById('loginLoading');

  const updateDots = () => dots.forEach((d, i) => {
    d.classList.toggle('filled', i < pin.length);
    d.classList.remove('error');
  });

  const showError = msg => {
    dots.forEach(d => d.classList.add('error'));
    pinDisplay.classList.remove('shake');
    void pinDisplay.offsetWidth;
    pinDisplay.classList.add('shake');
    errorMsg.textContent = msg;
    errorMsg.classList.add('show');
    setTimeout(() => { pin = ''; updateDots(); errorMsg.classList.remove('show'); }, 1400);
  };

  const submit = async () => {
    if (busy) return;
    busy = true;
    loading.classList.add('show');

    try {
      const { data, error } = await window.sb.rpc('verify_pin', { p_pin: pin });
      const u = (data && data.length) ? data[0] : null;

      if (!error && u) {
        window.session.set(u);
        if (u.role === 'admin') {
          loading.innerHTML = `<span style="font-size:17px;font-weight:700;color:#191F28">${u.sname} 원장님, 안녕하세요!</span>`;
          setTimeout(() => { window.location.href = '/admin.html'; }, 900);
        } else if (u.role === '부원장') {
          loading.innerHTML = `<span style="font-size:17px;font-weight:700;color:#191F28">${u.sname} 부원장님, 안녕하세요!</span>`;
          setTimeout(() => { window.location.href = '/adminpjw.html'; }, 900);
        } else if (u.role === '튜터') {
          loading.innerHTML = `<span style="font-size:17px;font-weight:700;color:#191F28">${u.sname} 튜터님, 안녕하세요!</span>`;
          const slug = (u.sid || '').replace('admin-', '');
          setTimeout(() => { window.location.href = `/admin${slug}.html`; }, 900);
        } else {
          loading.innerHTML = `<span style="font-size:17px;font-weight:700;color:#191F28">${u.sname}님, 환영해요!</span>`;
          setTimeout(() => { window.location.href = '/chat.html'; }, 800);
        }
      } else {
        loading.classList.remove('show');
        showError(error ? '오류가 발생했습니다.' : '비밀번호가 올바르지 않습니다.');
        pin = '';
        busy = false;
      }
    } catch {
      loading.classList.remove('show');
      showError('네트워크 오류가 발생했습니다.');
      pin = '';
      busy = false;
    }
  };

  const pressNum = n => {
    if (busy || pin.length >= PIN_LENGTH) return;
    pin += n;
    updateDots();
    if (navigator.vibrate) navigator.vibrate(10);
    if (pin.length === PIN_LENGTH) setTimeout(submit, 100);
  };

  const pressDelete = () => {
    if (busy || !pin.length) return;
    pin = pin.slice(0, -1);
    updateDots();
    if (navigator.vibrate) navigator.vibrate(5);
  };

  document.querySelectorAll('.numpad-btn[data-num]').forEach(b => b.addEventListener('click', () => pressNum(b.dataset.num)));
  document.getElementById('deleteBtn').addEventListener('click', pressDelete);
  document.addEventListener('keydown', e => {
    if (e.key >= '0' && e.key <= '9') pressNum(e.key);
    else if (e.key === 'Backspace') pressDelete();
  });
})();
