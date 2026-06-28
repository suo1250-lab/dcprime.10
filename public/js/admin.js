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

    const [tt, lg, ov, gl] = await Promise.all([
      sb.from('timetables').select('student_id,date,submitted').gte('date', from).lte('date', to),
      sb.from('study_logs').select('student_id,date').gte('date', from).lte('date', to),
      sb.from('attendance_overrides').select('student_id,date,status').gte('date', from).lte('date', to),
      sb.from('goals').select('student_id,date,done').gte('date', from).lte('date', to),
    ]);
    const ttSet = new Set((tt.data||[]).filter(x=>x.submitted).map(x=>x.student_id+'|'+x.date));
    const logSet = new Set((lg.data||[]).map(x=>x.student_id+'|'+x.date));
    const ovMap = new Map((ov.data||[]).map(x=>[x.student_id+'|'+x.date, x.status]));
    const glAgg = {};
    (gl.data||[]).forEach(g => { const a = glAgg[g.student_id+'|'+g.date] ||= { done:0, total:0 }; a.total++; if (g.done) a.done++; });

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
        const g = glAgg[key];
        const rate = g && g.total ? Math.round(g.done/g.total*100) : null;
        const rateTxt = rate==null ? '' : `<div style="font-size:10px;font-weight:600;color:#8b92a4;text-decoration:none">${rate}%</div>`;
        return `<td class="att-cell" data-sid="${s.id}" data-date="${date}" style="text-align:center;font-size:18px;font-weight:800;color:${sy.c};cursor:pointer${over}">${sy.t}${rateTxt}</td>`;
      }).join('')}
    </tr>`).join('') || `<tr><td>학생이 없습니다.</td></tr>`;

    document.querySelectorAll('.att-cell').forEach(c => c.addEventListener('click', (e) => {
      e.stopPropagation();
      openStatusMenu(c, c.dataset.sid, c.dataset.date, ovMap.has(c.dataset.sid+'|'+c.dataset.date) ? ovMap.get(c.dataset.sid+'|'+c.dataset.date) : null);
    }));
  }

  // 셀 탭 → 선택 메뉴 (오터치로 바로 안 바뀌게)
  function closeStatusMenu() { document.getElementById('attMenu')?.remove(); }
  function openStatusMenu(cell, sid, date, cur) {
    closeStatusMenu();
    const r = cell.getBoundingClientRect();
    const opts = [
      { v:'present', t:'○ 출석', c:'#10b981' },
      { v:'partial', t:'△ 부분', c:'#f59e0b' },
      { v:'absent',  t:'✕ 미출석', c:'#e2574c' },
      { v:'',        t:'↩ 자동으로', c:'#6b7280' },
    ];
    const menu = document.createElement('div');
    menu.id = 'attMenu';
    menu.style.cssText = 'position:fixed;z-index:1000;background:#fff;border:1px solid #e2e5ee;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.14);padding:6px;min-width:150px';
    menu.innerHTML = opts.map(o => `<button class="att-opt" data-v="${o.v}" style="display:flex;width:100%;align-items:center;gap:8px;padding:10px 12px;border:none;background:none;border-radius:8px;font-size:14px;color:${o.c};font-weight:700;cursor:pointer;text-align:left">${o.t}${(cur||'')===o.v?' · 현재':''}</button>`).join('');
    document.body.appendChild(menu);
    let top = r.bottom + 4, left = r.left;
    if (top + menu.offsetHeight > window.innerHeight) top = r.top - menu.offsetHeight - 4;
    if (left + menu.offsetWidth > window.innerWidth) left = window.innerWidth - menu.offsetWidth - 8;
    menu.style.top = top + 'px'; menu.style.left = Math.max(8, left) + 'px';
    menu.querySelectorAll('.att-opt').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      closeStatusMenu();
      applyStatus(sid, date, b.dataset.v || null, cur);
    }));
    setTimeout(() => document.addEventListener('click', closeStatusMenu, { once: true }), 0);
  }

  async function setOverride(sid, date, status) {
    if (status === null) await sb.from('attendance_overrides').delete().eq('student_id', sid).eq('date', date);
    else await sb.from('attendance_overrides').upsert({ student_id: sid, date, status }, { onConflict: 'student_id,date' });
    await loadAttendance();
  }
  async function applyStatus(sid, date, status, prev) {
    if (status === (prev || null)) return; // 변화 없음
    await setOverride(sid, date, status);
    showUndoToast(sid, date, prev || null);
  }

  let undoTimer;
  function showUndoToast(sid, date, prev) {
    document.getElementById('attToast')?.remove();
    clearTimeout(undoTimer);
    const toast = document.createElement('div');
    toast.id = 'attToast';
    toast.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:1100;background:#1f2430;color:#fff;padding:12px 18px;border-radius:12px;display:flex;align-items:center;gap:14px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.2)';
    toast.innerHTML = '<span>출석이 변경되었습니다.</span><button id="undoBtn" style="background:none;border:none;color:#7fb3ff;font-weight:700;cursor:pointer">되돌리기</button>';
    document.body.appendChild(toast);
    document.getElementById('undoBtn').addEventListener('click', () => { toast.remove(); clearTimeout(undoTimer); setOverride(sid, date, prev); });
    undoTimer = setTimeout(() => toast.remove(), 4000);
  }

  $('weekPrev')?.addEventListener('click', () => { weekStart.setDate(weekStart.getDate()-7); loadAttendance(); });
  $('weekNext')?.addEventListener('click', () => { weekStart.setDate(weekStart.getDate()+7); loadAttendance(); });
  $('todayBtn')?.addEventListener('click', () => { weekStart = startOfWeek(new Date()); loadAttendance(); });

  // 출석표 엑셀 내보내기 (현재 주)
  $('exportExcel')?.addEventListener('click', async () => {
    await fetchStudents();
    const days = [...Array(7)].map((_, i) => { const d = new Date(weekStart); d.setDate(d.getDate()+i); return d; });
    const from = fmt(days[0]), to = fmt(days[6]);
    const [tt, lg, ov, gl] = await Promise.all([
      sb.from('timetables').select('student_id,date,submitted').gte('date', from).lte('date', to),
      sb.from('study_logs').select('student_id,date').gte('date', from).lte('date', to),
      sb.from('attendance_overrides').select('student_id,date,status').gte('date', from).lte('date', to),
      sb.from('goals').select('student_id,date,done').gte('date', from).lte('date', to),
    ]);
    const ttSet = new Set((tt.data||[]).filter(x=>x.submitted).map(x=>x.student_id+'|'+x.date));
    const logSet = new Set((lg.data||[]).map(x=>x.student_id+'|'+x.date));
    const ovMap = new Map((ov.data||[]).map(x=>[x.student_id+'|'+x.date, x.status]));
    const glAgg = {};
    (gl.data||[]).forEach(g => { const a = glAgg[g.student_id+'|'+g.date] ||= { done:0, total:0 }; a.total++; if (g.done) a.done++; });

    const dn = ['일','월','화','수','목','금','토'];
    const SYM = { present:'○', partial:'△', absent:'✕' };
    const header = ['학생','캠퍼스', ...days.map(d => `${d.getMonth()+1}/${d.getDate()}(${dn[d.getDay()]})`)];
    const rows = [header];
    studentsCache.forEach(s => {
      const row = [s.name, s.campus || ''];
      days.forEach(d => {
        const date = fmt(d), key = s.id+'|'+date;
        const st = ovMap.has(key) ? ovMap.get(key) : autoStatus(key, ttSet, logSet);
        const g = glAgg[key];
        const rate = g && g.total ? ` ${Math.round(g.done/g.total*100)}%` : '';
        row.push(SYM[st] + rate);
      });
      rows.push(row);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 10 }, { wch: 7 }, ...days.map(() => ({ wch: 11 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '출석');
    XLSX.writeFile(wb, `출석부_${from}_${to}.xlsx`);
  });

  // ═══════════════ 학습 현황 ═══════════════
  async function loadStudy() {
    await fetchStudents();
    const campus = $('studyCampusFilter').value;
    const today = todayStr();
    const [ttRes, glRes] = await Promise.all([
      sb.from('timetables').select('student_id,slots,campus,seat,submitted').eq('date', today),
      sb.from('goals').select('student_id,done').eq('date', today),
    ]);
    const ttMap = new Map((ttRes.data||[]).map(t => [t.student_id, t]));
    const goalAgg = {};
    (glRes.data||[]).forEach(g => { const a = goalAgg[g.student_id] ||= { done:0, total:0 }; a.total++; if (g.done) a.done++; });
    const list = studentsCache.filter(s => !campus || s.campus === campus);

    $('studySummaryCards').innerHTML = list.map(s => {
      const tt = ttMap.get(s.id);
      const slots = tt?.slots || {};
      const studied = Object.keys(slots).length;
      const totalH = (studied*0.5).toFixed(1);
      const bySub = {}; Object.values(slots).forEach(v => bySub[v] = (bySub[v]||0)+0.5);
      const subTxt = Object.entries(bySub).map(([k,h])=>`${k} ${h}h`).join(' · ') || '기록 없음';
      const g = goalAgg[s.id];
      const rate = g && g.total ? Math.round(g.done/g.total*100) : null;
      const rateColor = rate==null ? '#9098a8' : rate>=80 ? '#10b981' : rate>=50 ? '#f59e0b' : '#e2574c';
      return `<div style="background:#fff;border:1px solid #eceef4;border-radius:14px;padding:16px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><span style="font-weight:700">${esc(s.name)}</span> <small style="color:#9098a8">${esc(s.grade||'')} ${s.campus?'· '+esc(s.campus):''}</small></div>
          <span style="font-size:22px;font-weight:800;color:#3b82f6">${totalH}h</span>
        </div>
        <div style="margin-top:8px;color:#666;font-size:13px">${esc(subTxt)}</div>
        <div style="margin-top:8px;font-size:13px;color:${rateColor};font-weight:700">목표 이행률 ${rate==null?'— (목표 없음)':rate+'% ('+g.done+'/'+g.total+')'}</div>
        <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
          ${tt?.submitted ? `<span style="font-size:12px;color:#10b981;background:#e7f7f0;padding:3px 10px;border-radius:999px">제출완료 (좌석 ${esc(tt.seat||'-')})</span>` : '<span style="font-size:12px;color:#9098a8">미제출</span>'}
          <button class="btn-ghost-sm tt-view-btn" data-id="${s.id}" data-name="${esc(s.name)}">시간표 보기</button>
          <button class="btn-ghost-sm photos-btn" data-id="${s.id}" data-name="${esc(s.name)}" style="margin-left:auto">인증사진 모아보기</button>
        </div>
      </div>`;
    }).join('') || '<p class="empty-text">해당 학생이 없습니다.</p>';

    document.querySelectorAll('.tt-view-btn').forEach(b => b.addEventListener('click', () => showTimetableModal(b.dataset.name, ttMap.get(b.dataset.id)?.slots || {})));
    document.querySelectorAll('.photos-btn').forEach(b => b.addEventListener('click', () => showStudentPhotos(b.dataset.id, b.dataset.name)));
    $('studyLogList').innerHTML = '<p class="empty-text">학생 카드의 "인증사진 모아보기"를 누르면 날짜별 사진이 표시됩니다.</p>';
  }

  // 시간표 모달
  const TT_COLORS = { '스카':'#3b82f6','식사':'#f59e0b','학원수업':'#10b981','기타':'#8b5cf6','국어':'#e2574c','영어':'#3b82f6','수학':'#10b981','과학':'#f59e0b' };
  const ttSlots = (() => { const a = []; for (let m=600;m<1320;m+=30){ const h=Math.floor(m/60),mm=m%60; a.push(`${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`); } return a; })();

  function showTimetableModal(name, slots) {
    const baseKey = k => k ? k.split(':')[0] : k;
    const colorOf = k => TT_COLORS[baseKey(k)] || '#8b5cf6';
    const displayOf = k => { if(!k) return ''; const [b,...r]=k.split(':'); return r.length?`${b}(${r.join(':')})`:b; };
    $('ttModalTitle').textContent = `${name} 오늘 시간표`;
    $('ttModalContent').innerHTML = ttSlots.map(t => {
      const v = slots[t];
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:12px;color:#9098a8;width:38px;flex-shrink:0">${t}</span>
        <div style="flex:1;padding:5px 10px;border-radius:6px;font-size:13px;font-weight:600;${v?`background:${colorOf(v)};color:#fff`:'background:#f5f6fa;color:#d0d4df'}">${v?displayOf(v):''}</div>
      </div>`;
    }).join('');
    $('ttModal').classList.add('show');
  }

  $('ttModalClose')?.addEventListener('click', () => $('ttModal').classList.remove('show'));
  $('ttModal')?.addEventListener('click', e => { if(e.target===$('ttModal')) $('ttModal').classList.remove('show'); });

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
        <button class="btn-primary-sm" id="zipBtn">전체 ZIP 다운로드</button>
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
      btn.disabled = false; btn.textContent = '전체 ZIP 다운로드';
    }
  }
  $('studyCampusFilter')?.addEventListener('change', loadStudy);
  $('refreshStudyBtn')?.addEventListener('click', loadStudy);

  // ═══════════════ 상담 ═══════════════
  const GEMINI_API_KEY = 'AIzaSyBFw5TFTTk6sxC1piGjHsbOPQJRSSA2150';
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const REPORT_SYSTEM = `당신은 진로 상담 전문가입니다. 학생 맞춤형 진로 리포트를 작성하세요.

[작성 원칙]
- 학생의 상담 내용에 기반하여 심화적이고 실질적인 내용을 제공하세요.
- 학생의 가능성과 강점을 중심으로 긍정적이고 응원하는 톤으로 작성하세요.
- 구체적인 활동 추천, 방향성 제시, 동기부여가 되는 내용만 포함하세요.

[절대 금지]
- "정시/수시를 써라" 등 입시 전략 단정 금지
- "가망이 없다", "어렵다", "힘들다" 등 부정적 평가 금지
- 성적이나 현재 수준으로 가능성을 제한하는 표현 금지
- 특정 대학/학과를 단정적으로 추천하거나 배제하는 표현 금지
- 학생을 위축시킬 수 있는 모든 표현 금지`;

  const MAJOR_PROMPTS = {
    '컴퓨터/AI/소프트웨어': `컴퓨터/AI/소프트웨어 전공 진로 리포트를 작성하세요:\n1. 학생 현황 요약 (강점/관심사 중심)\n2. 추천 세부 전공 (컴퓨터공학/AI/데이터사이언스/사이버보안 등)\n3. 고등학교 재학 중 추천 활동 5가지 (구체적으로)\n4. 추천 대학 학과 유형 및 진학 방향\n5. 졸업 후 커리어 로드맵`,
    '기계/로봇/자동차': `기계/로봇/자동차 전공 진로 리포트를 작성하세요:\n1. 학생 현황 요약 (강점/관심사 중심)\n2. 추천 세부 전공 (기계공학/로봇공학/자동차공학/항공우주 등)\n3. 고등학교 재학 중 추천 활동 5가지 (구체적으로)\n4. 추천 대학 학과 유형 및 진학 방향\n5. 졸업 후 커리어 로드맵 (국내 대기업 연계 포함)`,
    '전기/전자/반도체': `전기/전자/반도체 전공 진로 리포트를 작성하세요:\n1. 학생 현황 요약 (강점/관심사 중심)\n2. 추천 세부 전공 (전기공학/전자공학/반도체/디스플레이 등)\n3. 고등학교 재학 중 추천 활동 5가지 (구체적으로)\n4. 추천 대학 학과 유형 및 진학 방향\n5. 졸업 후 커리어 로드맵 (삼성전자/SK하이닉스 등 반도체 산업 연계)`,
    '화학/재료/에너지': `화학/재료/에너지 전공 진로 리포트를 작성하세요:\n1. 학생 현황 요약 (강점/관심사 중심)\n2. 추천 세부 전공 (화학공학/재료공학/신재생에너지/배터리 등)\n3. 고등학교 재학 중 추천 활동 5가지 (구체적으로)\n4. 추천 대학 학과 유형 및 진학 방향\n5. 졸업 후 커리어 로드맵 (이차전지/수소에너지 산업 연계)`,
    '건축/토목/환경': `건축/토목/환경 전공 진로 리포트를 작성하세요:\n1. 학생 현황 요약 (강점/관심사 중심)\n2. 추천 세부 전공 (건축학/건축공학/토목/도시공학/환경공학 등)\n3. 고등학교 재학 중 추천 활동 5가지 (구체적으로)\n4. 추천 대학 학과 유형 및 진학 방향\n5. 졸업 후 커리어 로드맵 (건설사/공기업/설계사무소 등)`,
    '의학/치의학': `의학/치의학 전공 진로 리포트를 작성하세요:\n1. 학생 현황 요약 (강점/관심사 중심)\n2. 추천 방향 (의예과/치의예과 등)\n3. 고등학교 재학 중 추천 활동 5가지 (의료봉사/생명과학 심화 등)\n4. 추천 대학 학과 유형 및 진학 방향\n5. 졸업 후 커리어 로드맵 (전공의 과정 포함)`,
    '간호/보건': `간호/보건 전공 진로 리포트를 작성하세요:\n1. 학생 현황 요약 (강점/관심사 중심)\n2. 추천 세부 전공 (간호학/보건관리/물리치료/임상병리 등)\n3. 고등학교 재학 중 추천 활동 5가지 (구체적으로)\n4. 추천 대학 학과 유형 및 진학 방향\n5. 졸업 후 커리어 로드맵 (병원/공공보건/해외취업 등)`,
    '약학/생명과학': `약학/생명과학 전공 진로 리포트를 작성하세요:\n1. 학생 현황 요약 (강점/관심사 중심)\n2. 추천 세부 전공 (약학/생명공학/바이오/식품영양 등)\n3. 고등학교 재학 중 추천 활동 5가지 (구체적으로)\n4. 추천 대학 학과 유형 및 진학 방향\n5. 졸업 후 커리어 로드맵 (제약회사/연구소/약국 등)`,
    '경영/경제': `경영/경제 전공 진로 리포트를 작성하세요:\n1. 학생 현황 요약 (강점/관심사 중심)\n2. 추천 세부 전공 (경영/경제/회계/마케팅/금융 등)\n3. 고등학교 재학 중 추천 활동 5가지 (구체적으로)\n4. 추천 대학 학과 유형 및 진학 방향\n5. 졸업 후 커리어 로드맵 (대기업/금융권/스타트업/컨설팅 등)`,
    '법학/행정': `법학/행정 전공 진로 리포트를 작성하세요:\n1. 학생 현황 요약 (강점/관심사 중심)\n2. 추천 세부 전공 (법학/행정학/정치외교/공공정책 등)\n3. 고등학교 재학 중 추천 활동 5가지 (모의재판/토론/봉사 등)\n4. 추천 대학 학과 유형 및 진학 방향\n5. 졸업 후 커리어 로드맵 (로스쿨/공무원/공기업/NGO 등)`,
    '교육': `교육 전공 진로 리포트를 작성하세요:\n1. 학생 현황 요약 (강점/관심사 중심)\n2. 추천 세부 전공 (사범대/교육학/유아교육/특수교육 등)\n3. 고등학교 재학 중 추천 활동 5가지 (튜터링/교육봉사 등)\n4. 추천 대학 학과 유형 및 진학 방향\n5. 졸업 후 커리어 로드맵 (교원임용/교육행정/EdTech 등)`,
    '사회/심리': `사회/심리 전공 진로 리포트를 작성하세요:\n1. 학생 현황 요약 (강점/관심사 중심)\n2. 추천 세부 전공 (심리학/사회학/사회복지/상담심리 등)\n3. 고등학교 재학 중 추천 활동 5가지 (구체적으로)\n4. 추천 대학 학과 유형 및 진학 방향\n5. 졸업 후 커리어 로드맵 (임상심리사/사회복지사/HR/UX리서처 등)`,
    '어문/인문': `어문/인문 전공 진로 리포트를 작성하세요:\n1. 학생 현황 요약 (강점/관심사 중심)\n2. 추천 세부 전공 (국문/영문/중문/일문/철학/역사 등)\n3. 고등학교 재학 중 추천 활동 5가지 (독서/글쓰기/언어 자격증 등)\n4. 추천 대학 학과 유형 및 진학 방향\n5. 졸업 후 커리어 로드맵 (출판/미디어/번역/외교/공무원 등)`,
    '자유전공': `자유전공 진로 리포트를 작성하세요:\n1. 학생 현황 요약 (강점/관심사 중심)\n2. 자유전공 선택이 적합한 이유 분석\n3. 고등학교 재학 중 추천 활동 5가지 (다양한 분야 탐색 중심)\n4. 입학 후 전공 탐색 전략 및 추천 전공 방향 2~3가지\n5. 졸업 후 커리어 로드맵`,
  };

  let consultSid = null;
  let currentConsults = [];
  async function loadConsultStudents() {
    await fetchStudents();
    const grid = $('studentSelectGrid');
    grid.innerHTML = studentsCache.map(s => `<button class="student-select-card" data-id="${s.id}">
      <span class="select-avatar" style="font-size:13px">${esc(s.campus || '—')}</span>
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
    currentConsults = data || [];
    const list = $('consultList');
    $('reportBtn').style.display = currentConsults.length ? 'inline-flex' : 'none';
    if (!currentConsults.length) { list.innerHTML = '<p class="empty-text">상담 기록이 없습니다.</p>'; return; }
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
  $('reportBtn')?.addEventListener('click', () => {
    const s = studentsCache.find(x => x.id === consultSid);
    $('reportModalTitle').textContent = `${s?.name || ''} 상담 리포트`;
    $('reportMajorWrap').style.display = 'block';
    $('reportContent').style.display = 'none';
    $('reportContent').textContent = '';
    $('reportCopyBtn').style.display = 'none';
    $('reportModal').classList.add('show');
  });

  $('reportGenerateBtn')?.addEventListener('click', async () => {
    const s = studentsCache.find(x => x.id === consultSid);
    const studentName = s?.name || '';
    const grade = s?.grade || '';
    const majorField = $('reportMajorSelect').value;
    const recordsText = currentConsults.map(c =>
      `[${c.date}]\n내용: ${c.content||'-'}\n강점: ${c.strength||'-'}\n약점: ${c.weakness||'-'}\n다음목표: ${c.next_goal||'-'}\n상담인: ${c.counselor||'-'}`
    ).join('\n\n');

    $('reportMajorWrap').style.display = 'none';
    $('reportContent').style.display = 'block';
    $('reportContent').textContent = '리포트 생성 중...';
    $('reportCopyBtn').style.display = 'none';

    const majorPrompt = MAJOR_PROMPTS[majorField] || MAJOR_PROMPTS['자유전공'];
    const userPrompt = `[학생 정보]\n이름: ${studentName} / 학년: ${grade} / 계열: ${majorField}\n\n[상담 기록]\n${recordsText}\n\n${majorPrompt}`;

    try {
      const res = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: REPORT_SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.7 }
        })
      });
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '리포트 생성 실패';
      $('reportContent').textContent = text;
      $('reportCopyBtn').style.display = 'block';
    } catch(e) {
      $('reportContent').textContent = '오류: ' + e.message;
      $('reportMajorWrap').style.display = 'block';
    }
  });

  $('reportCopyBtn')?.addEventListener('click', () => {
    navigator.clipboard.writeText($('reportContent').textContent);
    $('reportCopyBtn').textContent = '복사 완료 ✓';
    setTimeout(() => $('reportCopyBtn').textContent = '복사하기', 2000);
  });
  $('reportModalClose')?.addEventListener('click', () => $('reportModal').classList.remove('show'));
  $('reportModal')?.addEventListener('click', e => { if (e.target === $('reportModal')) $('reportModal').classList.remove('show'); });

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
