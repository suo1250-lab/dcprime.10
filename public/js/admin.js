// 원장 관리자 — Supabase 서버리스
(async () => {
  const me = window.session.require('admin');
  if (!me) return;
  const sb = window.sb;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const todayStr = () => fmt(new Date());

  // 헤더 / 로그아웃
  $('adminName').textContent = `${me.sname} 원장`;
  $('logoutBtn')?.addEventListener('click', () => { window.session.clear(); window.location.href = '/'; });

  // 공통: 학생 목록 캐시
  let studentsCache = [];
  async function fetchStudents() {
    const { data } = await sb.from('students_pub').select('*').order('name');
    studentsCache = data || [];
    return studentsCache;
  }

  // ── 탭 전환 ──
  const tabBtns = document.querySelectorAll('.tab-btn');
  const panels = {
    attendance: $('tabAttendance'), study: $('tabStudy'),
    analysis: $('tabAnalysis'), students: $('tabStudents'),
  };
  tabBtns.forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.tab;
    tabBtns.forEach(x => x.classList.toggle('active', x.dataset.tab === t));
    Object.entries(panels).forEach(([k, p]) => p.classList.toggle('active', k === t));
    if (t === 'attendance') loadAttendance();
    if (t === 'study')      loadStudy();
    if (t === 'analysis')   loadConsultStudents();
    if (t === 'students')   loadStudents();
  }));

  // ═══════════════ 출석 관리 ═══════════════
  const startOfWeek = d => { const x = new Date(d); const dy = (x.getDay()+6)%7; x.setDate(x.getDate()-dy); x.setHours(0,0,0,0); return x; };
  let weekStart = startOfWeek(new Date());
  const SYMB = { present:{t:'○',c:'#10b981'}, partial:{t:'△',c:'#f59e0b'}, absent:{t:'✕',c:'#e2574c'} };

  function autoStatus(key, ttSet, logSet) {
    const first = ttSet.has(key), second = logSet.has(key);
    if (first && second) return 'present';
    if (first) return 'partial';
    return 'absent';
  }

  async function loadAttendance() {
    await fetchStudents();
    const days = [...Array(7)].map((_, i) => { const d = new Date(weekStart); d.setDate(d.getDate()+i); return d; });
    const from = fmt(days[0]), to = fmt(days[6]);
    $('weekLabel').textContent = `${from} ~ ${to}`;

    const [tt, lg, ov] = await Promise.all([
      sb.from('timetables').select('student_id,date,submitted').gte('date', from).lte('date', to),
      sb.from('study_logs').select('student_id,date').gte('date', from).lte('date', to),
      sb.from('attendance_overrides').select('student_id,date,status').gte('date', from).lte('date', to),
    ]);
    const ttSet = new Set((tt.data||[]).filter(x=>x.submitted).map(x=>x.student_id+'|'+x.date));
    const logSet = new Set((lg.data||[]).map(x=>x.student_id+'|'+x.date));
    const ovMap = new Map((ov.data||[]).map(x=>[x.student_id+'|'+x.date, x.status]));

    const dn = ['일','월','화','수','목','금','토'];
    $('attendanceHead').innerHTML =
      `<tr><th style="text-align:left">학생</th>${days.map(d=>`<th>${d.getMonth()+1}/${d.getDate()}<br><small style="color:#9098a8">${dn[d.getDay()]}</small></th>`).join('')}</tr>`;
    $('attendanceBody').innerHTML = studentsCache.map(s => `<tr>
      <td style="text-align:left;font-weight:600;white-space:nowrap">${esc(s.name)}<br><small style="color:#9098a8">${esc(s.campus||'')}</small></td>
      ${days.map(d => {
        const date = fmt(d), key = s.id+'|'+date;
        const st = ovMap.has(key) ? ovMap.get(key) : autoStatus(key, ttSet, logSet);
        const sy = SYMB[st] || SYMB.absent;
        const over = ovMap.has(key) ? ';text-decoration:underline' : '';
        return `<td class="att-cell" data-sid="${s.id}" data-date="${date}" style="text-align:center;font-size:18px;font-weight:800;color:${sy.c};cursor:pointer${over}">${sy.t}</td>`;
      }).join('')}
    </tr>`).join('') || `<tr><td>학생이 없습니다.</td></tr>`;

    document.querySelectorAll('.att-cell').forEach(c => c.addEventListener('click', () => cycleOverride(c.dataset.sid, c.dataset.date, ovMap)));
  }

  async function cycleOverride(sid, date, ovMap) {
    const key = sid+'|'+date;
    const order = ['present','partial','absent'];
    let next;
    if (!ovMap.has(key)) next = 'present';
    else { const i = order.indexOf(ovMap.get(key)); next = i >= order.length-1 ? null : order[i+1]; }
    if (next === null) await sb.from('attendance_overrides').delete().eq('student_id', sid).eq('date', date);
    else await sb.from('attendance_overrides').upsert({ student_id: sid, date, status: next }, { onConflict: 'student_id,date' });
    loadAttendance();
  }

  $('weekPrev')?.addEventListener('click', () => { weekStart.setDate(weekStart.getDate()-7); loadAttendance(); });
  $('weekNext')?.addEventListener('click', () => { weekStart.setDate(weekStart.getDate()+7); loadAttendance(); });
  $('todayBtn')?.addEventListener('click', () => { weekStart = startOfWeek(new Date()); loadAttendance(); });

  // ═══════════════ 학습 현황 ═══════════════
  async function loadStudy() {
    await fetchStudents();
    const campus = $('studyCampusFilter').value;
    const today = todayStr();
    const { data: tts } = await sb.from('timetables').select('student_id,slots,campus,seat,submitted').eq('date', today);
    const ttMap = new Map((tts||[]).map(t => [t.student_id, t]));
    const list = studentsCache.filter(s => !campus || s.campus === campus);

    $('studySummaryCards').innerHTML = list.map(s => {
      const tt = ttMap.get(s.id);
      const slots = tt?.slots || {};
      const studied = Object.keys(slots).length;
      const totalH = (studied*0.5).toFixed(1);
      const bySub = {}; Object.values(slots).forEach(v => bySub[v] = (bySub[v]||0)+0.5);
      const subTxt = Object.entries(bySub).map(([k,h])=>`${k} ${h}h`).join(' · ') || '기록 없음';
      return `<div style="background:#fff;border:1px solid #eceef4;border-radius:14px;padding:16px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><span style="font-weight:700">${esc(s.name)}</span> <small style="color:#9098a8">${esc(s.grade||'')} ${s.campus?'· '+esc(s.campus):''}</small></div>
          <span style="font-size:22px;font-weight:800;color:#3b82f6">${totalH}h</span>
        </div>
        <div style="margin-top:8px;color:#666;font-size:13px">${esc(subTxt)}</div>
        <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
          ${tt?.submitted ? `<span style="font-size:12px;color:#10b981;background:#e7f7f0;padding:3px 10px;border-radius:999px">제출완료 (좌석 ${esc(tt.seat||'-')})</span>` : '<span style="font-size:12px;color:#9098a8">미제출</span>'}
          <button class="btn-ghost-sm photos-btn" data-id="${s.id}" data-name="${esc(s.name)}" style="margin-left:auto">📷 인증사진 모아보기</button>
        </div>
      </div>`;
    }).join('') || '<p class="empty-text">해당 학생이 없습니다.</p>';

    document.querySelectorAll('.photos-btn').forEach(b => b.addEventListener('click', () => showStudentPhotos(b.dataset.id, b.dataset.name)));
    $('studyLogList').innerHTML = '<p class="empty-text">학생 카드의 "인증사진 모아보기"를 누르면 날짜별 사진이 표시됩니다.</p>';
  }

  // 학생 인증사진: 날짜별 표출 + ZIP 다운로드
  async function showStudentPhotos(sid, name) {
    const wrap = $('studyLogList');
    wrap.innerHTML = '<p class="empty-text">불러오는 중...</p>';
    const { data: logs } = await sb.from('study_logs').select('*')
      .eq('student_id', sid).not('image_path', 'is', null).order('date', { ascending: false });
    if (!logs || !logs.length) { wrap.innerHTML = `<p class="empty-text">${esc(name)} 학생의 인증 사진이 없습니다.</p>`; return; }

    // 날짜별 그룹
    const byDate = {};
    logs.forEach(l => { (byDate[l.date] ||= []).push(l); });

    wrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 class="section-subtitle" style="margin:0">${esc(name)} 인증사진 (${logs.length}장)</h3>
        <button class="btn-primary-sm" id="zipBtn">⬇ 전체 ZIP 다운로드</button>
      </div>` +
      Object.entries(byDate).map(([date, arr]) => `
        <div style="margin-bottom:16px">
          <p style="font-weight:700;color:#444;margin-bottom:8px">${esc(date)}</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px">
            ${arr.map(l => `<a href="${esc(l.image_path)}" target="_blank"><img src="${esc(l.image_path)}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;border:1px solid #eceef4" /></a>`).join('')}
          </div>
        </div>`).join('');

    $('zipBtn').addEventListener('click', () => downloadZip(name, logs));
  }

  async function downloadZip(name, logs) {
    const btn = $('zipBtn');
    btn.disabled = true; btn.textContent = 'ZIP 생성 중...';
    try {
      const zip = new JSZip();
      const counts = {};
      for (const l of logs) {
        try {
          const res = await fetch(l.image_path);
          const blob = await res.blob();
          const ext = (l.image_path.split('.').pop() || 'jpg').split('?')[0];
          counts[l.date] = (counts[l.date] || 0) + 1;
          zip.file(`${name}_${l.date}_${counts[l.date]}.${ext}`, blob);
        } catch (e) { console.error('이미지 로드 실패', l.image_path, e); }
      }
      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url; a.download = `${name}_인증사진.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } finally {
      btn.disabled = false; btn.textContent = '⬇ 전체 ZIP 다운로드';
    }
  }
  $('studyCampusFilter')?.addEventListener('change', loadStudy);
  $('refreshStudyBtn')?.addEventListener('click', loadStudy);

  // ═══════════════ 상담 ═══════════════
  let consultSid = null;
  async function loadConsultStudents() {
    await fetchStudents();
    const grid = $('studentSelectGrid');
    grid.innerHTML = studentsCache.map(s => `<button class="student-select-card" data-id="${s.id}">
      <span class="select-avatar">${esc(s.name.charAt(0))}</span>
      <span class="select-name">${esc(s.name)}</span>
      <span class="select-grade">${esc(s.grade||'')}</span>
    </button>`).join('') || '<p class="empty-text">학생이 없습니다.</p>';
    grid.querySelectorAll('.student-select-card').forEach(b => b.addEventListener('click', () => openConsult(b.dataset.id)));
  }
  async function openConsult(id) {
    consultSid = id;
    const s = studentsCache.find(x => x.id === id);
    $('consultStudentName').textContent = `${s.name} 상담 기록`;
    $('consultPanel').style.display = 'block';
    $('consultForm').style.display = 'none';
    await renderConsults();
    $('consultPanel').scrollIntoView({ behavior:'smooth' });
  }
  async function renderConsults() {
    const { data } = await sb.from('consults').select('*').eq('student_id', consultSid).order('date', { ascending:false });
    const list = $('consultList');
    if (!data || !data.length) { list.innerHTML = '<p class="empty-text">상담 기록이 없습니다.</p>'; return; }
    list.innerHTML = data.map(c => `<div style="border:1px solid #eceef4;border-radius:12px;padding:14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>${esc(c.date||'')}</b><span style="color:#8b92a4;font-size:13px">${esc(c.counselor||'')}</span></div>
      ${c.content?`<p style="margin:4px 0"><b>내용</b> · ${esc(c.content)}</p>`:''}
      ${c.strength?`<p style="margin:4px 0;color:#10b981"><b>강점</b> · ${esc(c.strength)}</p>`:''}
      ${c.weakness?`<p style="margin:4px 0;color:#e2574c"><b>약점</b> · ${esc(c.weakness)}</p>`:''}
      ${c.next_goal?`<p style="margin:4px 0;color:#3b82f6"><b>다음목표</b> · ${esc(c.next_goal)}</p>`:''}
      <button class="btn-ghost-sm del-consult" data-id="${c.id}" style="margin-top:6px">삭제</button>
    </div>`).join('');
    list.querySelectorAll('.del-consult').forEach(b => b.addEventListener('click', async () => {
      await sb.from('consults').delete().eq('id', b.dataset.id); renderConsults();
    }));
  }
  $('addConsultBtn')?.addEventListener('click', () => {
    $('consultForm').style.display = 'block';
    $('cDate').value = todayStr();
    ['cContent','cStrength','cWeakness','cNextGoal','cCounselor'].forEach(id => $(id).value = '');
    $('consultFormError').textContent = '';
  });
  $('consultCancel')?.addEventListener('click', () => $('consultForm').style.display = 'none');
  $('consultSave')?.addEventListener('click', async () => {
    if (!consultSid) return;
    const payload = {
      student_id: consultSid,
      date: $('cDate').value || todayStr(),
      content: $('cContent').value.trim() || null,
      strength: $('cStrength').value.trim() || null,
      weakness: $('cWeakness').value.trim() || null,
      next_goal: $('cNextGoal').value.trim() || null,
      counselor: $('cCounselor').value.trim() || null,
    };
    const { error } = await sb.from('consults').insert(payload);
    if (error) { $('consultFormError').textContent = '저장 오류: ' + error.message; return; }
    $('consultForm').style.display = 'none';
    renderConsults();
  });

  // ═══════════════ 학생 관리 ═══════════════
  let editingId = null, deletingId = null;
  const studentModal = $('studentModal'), deleteModal = $('deleteStudentModal');

  async function loadStudents() {
    await fetchStudents();
    const wrap = $('studentMgmtList');
    wrap.innerHTML = studentsCache.map(s => `<div style="display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid #eceef4;border-radius:12px;padding:14px;margin-bottom:8px">
      <div><span style="font-weight:700">${esc(s.name)}</span> <small style="color:#9098a8">${esc(s.grade||'')} ${s.campus?'· '+esc(s.campus):''}</small></div>
      <div style="display:flex;gap:8px">
        <button class="btn-ghost-sm edit-st" data-id="${s.id}">수정</button>
        <button class="btn-ghost-sm del-st" data-id="${s.id}" style="color:#e2574c">삭제</button>
      </div>
    </div>`).join('') || '<p class="empty-text">학생이 없습니다.</p>';
    wrap.querySelectorAll('.edit-st').forEach(b => b.addEventListener('click', () => openStudentModal(b.dataset.id)));
    wrap.querySelectorAll('.del-st').forEach(b => b.addEventListener('click', () => openDelete(b.dataset.id)));
  }

  function openStudentModal(id) {
    editingId = id || null;
    const s = id ? studentsCache.find(x => x.id === id) : null;
    $('studentModalTitle').textContent = id ? '학생 수정' : '학생 추가';
    $('fieldName').value = s?.name || '';
    $('fieldPin').value = '';
    $('fieldGrade').value = s?.grade || '';
    $('fieldCampus').value = s?.campus || '';
    $('pinHint').style.display = id ? 'block' : 'none';
    $('studentFormError').textContent = '';
    studentModal.classList.add('show');
  }
  $('addStudentBtn')?.addEventListener('click', () => openStudentModal(null));
  $('studentModalCancel')?.addEventListener('click', () => studentModal.classList.remove('show'));
  $('studentModalSave')?.addEventListener('click', async () => {
    const name = $('fieldName').value.trim();
    const pin = $('fieldPin').value.trim();
    const grade = $('fieldGrade').value.trim() || null;
    const campus = $('fieldCampus').value || null;
    const err = $('studentFormError');
    if (!name) { err.textContent = '이름을 입력하세요.'; return; }
    if (!editingId && !/^\d{4}$/.test(pin)) { err.textContent = 'PIN 4자리를 입력하세요.'; return; }
    if (editingId && pin && !/^\d{4}$/.test(pin)) { err.textContent = 'PIN은 4자리 숫자입니다.'; return; }
    const { error } = await sb.rpc('set_student', { p_id: editingId, p_name: name, p_pin: pin || null, p_grade: grade, p_campus: campus });
    if (error) { err.textContent = '저장 오류: ' + error.message; return; }
    studentModal.classList.remove('show');
    loadStudents();
  });

  function openDelete(id) {
    deletingId = id;
    const s = studentsCache.find(x => x.id === id);
    $('deleteStudentDesc').textContent = `${s?.name||''} 학생의 모든 기록(시간표·출석·상담)이 함께 삭제됩니다.`;
    deleteModal.classList.add('show');
  }
  $('deleteCancel')?.addEventListener('click', () => deleteModal.classList.remove('show'));
  $('deleteConfirm')?.addEventListener('click', async () => {
    await sb.rpc('delete_student', { p_id: deletingId });
    deleteModal.classList.remove('show');
    loadStudents();
  });

  // 초기 로드 (기본 탭: 출석)
  loadAttendance();
})();
