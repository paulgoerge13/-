import { useState, useEffect, useCallback, useRef } from 'react'

const BRANCHES = [
  { id: 'gidc',   name: '광명GIDC점',  password: 'gidc1234' },
  { id: 'ingye',  name: '인계점',       password: 'ingye1234' },
  { id: 'anyang', name: '안양일번가점', password: 'anyang1234' },
  { id: 'iksan',  name: '익산점',       password: 'iksan1234' },
  { id: 'juan',   name: '인천주안점',   password: 'juan1234' },
  { id: 'marina', name: '서울마리나점', password: 'marina1234' },
]

// ── 급여 계산 함수 ──────────────────────────────────────
function calcBasic(h, w)         { return Math.round(h * w) }
function calcOvertime(h, w)      { return Math.round(h * w * 1.5) }
function calcNight(h, w)         { return Math.round(h * w * 0.5) }
function calcHoliday(h, w)       { return Math.round(h * w * 1.5) }
function calcHolidayOt(h, w)     { return Math.round(h * w * 2.0) }
function calcHolidayNight(h, w)  { return Math.round(h * w * 0.5) }
function calcWeeklyHoliday(weekH, w) {
  if (weekH < 15) return 0
  return Math.round((weekH / 40) * 8 * w)
}

function getWeeksInMonth(year, month) {
  const lastDay = new Date(year, month, 0)
  const weeks = []
  let current = new Date(year, month - 1, 1)
  const dow = current.getDay()
  current = new Date(current.getTime() + (dow === 0 ? -6 : 1 - dow) * 86400000)
  while (current <= lastDay) {
    const week = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(current.getTime() + i * 86400000)
      week.push(d.getMonth() + 1 === month ? d.getDate() : null)
    }
    if (week.some(d => d !== null)) weeks.push(week)
    current = new Date(current.getTime() + 7 * 86400000)
  }
  return weeks
}

const EMPTY_EMP = {
  name: '', residentId: '', phone: '', email: '',
  hourlyWage: 10030, scheduledHours: 8,
  defaultTimeStart: '', defaultTimeEnd: '',
  workData: {}, specialNote: '',
  year: new Date().getFullYear(), month: new Date().getMonth() + 1,
}

export default function Home() {
  const [step, setStep] = useState('branch')
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)

  // 직원 탭 관리
  const [employees, setEmployees] = useState([{ ...EMPTY_EMP, id: Date.now() }])
  const [activeEmpId, setActiveEmpId] = useState(null)
  const saveTimer = useRef(null)

  const activeEmp = employees.find(e => e.id === activeEmpId) || employees[0]

  useEffect(() => {
    if (employees.length > 0 && !activeEmpId) {
      setActiveEmpId(employees[0].id)
    }
  }, [employees, activeEmpId])

  // ── 직원 데이터 업데이트 (자동저장 포함) ──
  function updateEmp(field, value) {
    setEmployees(prev => prev.map(e =>
      e.id === activeEmpId ? { ...e, [field]: value } : e
    ))
    // 자동저장 디바운스 (1.5초 후)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => autoSave(), 1500)
  }

  function updateWorkDay(dateStr, field, value) {
    setEmployees(prev => prev.map(e => {
      if (e.id !== activeEmpId) return e
      return {
        ...e,
        workData: {
          ...e.workData,
          [dateStr]: {
            type: '평', basicH: 0, overtimeH: 0, nightH: 0,
            holidayH: 0, holidayOtH: 0, holidayNightH: 0,
            timeStart: e.defaultTimeStart, timeEnd: e.defaultTimeEnd,
            ...e.workData[dateStr], [field]: value
          }
        }
      }
    }))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => autoSave(), 1500)
  }

  function toggleDayType(dateStr) {
    const current = activeEmp.workData[dateStr]?.type || '평'
    updateWorkDay(dateStr, 'type', current === '평' ? '휴' : '평')
  }

  function addEmployee() {
    const newEmp = { ...EMPTY_EMP, id: Date.now(),
      year: activeEmp.year, month: activeEmp.month,
      hourlyWage: activeEmp.hourlyWage,
      defaultTimeStart: activeEmp.defaultTimeStart,
      defaultTimeEnd: activeEmp.defaultTimeEnd,
    }
    setEmployees(prev => [...prev, newEmp])
    setActiveEmpId(newEmp.id)
  }

  function removeEmployee(id) {
    if (employees.length === 1) return
    const remaining = employees.filter(e => e.id !== id)
    setEmployees(remaining)
    if (activeEmpId === id) setActiveEmpId(remaining[0].id)
  }

  // ── 주별/전체 합계 계산 ──
  function calcWeekPay(week, emp) {
    let weekBasicH = 0
    week.forEach(day => {
      if (!day) return
      const ds = `${emp.year}-${String(emp.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      weekBasicH += emp.workData[ds]?.basicH || 0
    })
    return { weekBasicH, weeklyHolidayPay: calcWeeklyHoliday(weekBasicH, emp.hourlyWage) }
  }

  function calcTotal(emp) {
    const weeks = getWeeksInMonth(emp.year, emp.month)
    let totalBasic = 0, totalOvertime = 0, totalNight = 0
    let totalHoliday = 0, totalHolidayOtPay = 0, totalHolidayNightPay = 0
    let totalWeeklyHoliday = 0

    weeks.forEach(week => {
      totalWeeklyHoliday += calcWeekPay(week, emp).weeklyHolidayPay
    })
    Object.values(emp.workData).forEach(d => {
      if (d.type !== '휴') {
        totalBasic += calcBasic(d.basicH || 0, emp.hourlyWage)
        totalOvertime += calcOvertime(d.overtimeH || 0, emp.hourlyWage)
        totalNight += calcNight(d.nightH || 0, emp.hourlyWage)
      } else {
        totalHoliday += calcHoliday(d.holidayH || 0, emp.hourlyWage)
        totalHolidayOtPay += calcHolidayOt(d.holidayOtH || 0, emp.hourlyWage)
        totalHolidayNightPay += calcHolidayNight(d.holidayNightH || 0, emp.hourlyWage)
      }
    })
    const grandTotal = totalBasic + totalWeeklyHoliday + totalOvertime + totalNight + totalHoliday + totalHolidayOtPay + totalHolidayNightPay
    return { totalBasic, totalWeeklyHoliday, totalOvertime, totalNight, totalHoliday, totalHolidayOtPay, totalHolidayNightPay, grandTotal }
  }

  // ── 저장 ──
  async function autoSave() {
    if (!selectedBranch) return
    const emp = employees.find(e => e.id === activeEmpId)
    if (!emp || !emp.name) return
    await doSave(emp)
  }

  async function doSave(emp) {
    const totals = calcTotal(emp)
    const payload = {
      branch: selectedBranch.name,
      emp_name: emp.name,
      resident_id: emp.residentId,
      phone: emp.phone,
      email: emp.email,
      hourly_wage: emp.hourlyWage,
      scheduled_hours: emp.scheduledHours,
      default_time: `${emp.defaultTimeStart}~${emp.defaultTimeEnd}`,
      year: emp.year,
      month: emp.month,
      work_data: emp.workData,
      special_note: emp.specialNote,
      ...totals,
    }
    try {
      await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } catch (e) { console.error('자동저장 실패', e) }
  }

  async function handleManualSave() {
    if (!activeEmp.name) { alert('직원 이름을 입력해주세요.'); return }
    await doSave(activeEmp)
    alert('✓ 저장되었습니다!')
  }

  function handleTabSwitch(id) {
    // 현재 탭 자동저장
    if (activeEmp.name) doSave(activeEmp)
    setActiveEmpId(id)
  }

  function fmt(n) { return Math.round(n || 0).toLocaleString('ko-KR') + '원' }

  function numInput(val, onChange) {
    return (
      <input type="number" min="0" step="0.5"
        value={val || ''}
        placeholder="0"
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="hour-input"
      />
    )
  }

  const totals = activeEmp ? calcTotal(activeEmp) : null
  const weeks = activeEmp ? getWeeksInMonth(activeEmp.year, activeEmp.month) : []

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=DM+Sans:wght@300;400;500;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f8f7f4; color: #1a1a1a; font-family: 'DM Sans', sans-serif; min-height: 100vh; }

    .wrap { min-height: 100vh; display: flex; flex-direction: column; }

    .header {
      background: #fff; border-bottom: 1px solid #ebe9e4;
      padding: 18px 40px; display: flex; justify-content: space-between; align-items: center;
    }
    .logo-the { font-size: 9px; letter-spacing: 0.3em; color: #b8954a; font-weight: 500; }
    .logo-main { font-family: 'Playfair Display', serif; font-size: 24px; color: #1a1a1a; }
    .logo-main span { font-style: italic; color: #b8954a; }
    .logo-sub { font-size: 9px; letter-spacing: 0.25em; color: #999; margin-top: 1px; }
    .header-tag { font-size: 10px; letter-spacing: 0.2em; color: #999; }

    .main { flex: 1; padding: 48px 40px; max-width: 1200px; width: 100%; margin: 0 auto; }
    @media (max-width: 640px) { .header { padding: 16px 20px; } .main { padding: 28px 16px; } }

    /* ── 지점 선택 ── */
    .page-title { font-family: 'Playfair Display', serif; font-size: 30px; margin-bottom: 8px; }
    .page-sub { font-size: 13px; color: #999; letter-spacing: 0.05em; margin-bottom: 48px; }

    .branch-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      max-width: 900px;
      margin: 0 auto;
    }
    @media (max-width: 640px) { .branch-grid { grid-template-columns: repeat(2, 1fr); } }

    .branch-card {
      background: #fff; border: 1px solid #ebe9e4; border-radius: 16px;
      padding: 40px 32px; cursor: pointer; transition: all 0.2s;
      position: relative; overflow: hidden;
    }
    .branch-card::after {
      content: ''; position: absolute; bottom: 0; left: 0; right: 0;
      height: 3px; background: #b8954a; transform: scaleX(0); transition: transform 0.25s;
    }
    .branch-card:hover { border-color: #d4b87a; box-shadow: 0 8px 32px rgba(184,149,74,0.12); transform: translateY(-2px); }
    .branch-card:hover::after { transform: scaleX(1); }
    .branch-num { font-size: 11px; color: #ccc; letter-spacing: 0.2em; margin-bottom: 16px; font-weight: 500; }
    .branch-name { font-size: 18px; font-weight: 600; color: #1a1a1a; }

    /* ── 로그인 ── */
    .login-wrap { display: flex; justify-content: center; align-items: center; min-height: 60vh; }
    .login-box {
      background: #fff; border: 1px solid #ebe9e4; border-radius: 16px;
      padding: 40px; width: 340px; text-align: center;
      box-shadow: 0 8px 40px rgba(0,0,0,0.06);
    }
    .login-branch { font-size: 11px; letter-spacing: 0.2em; color: #b8954a; margin-bottom: 6px; }
    .login-title { font-family: 'Playfair Display', serif; font-size: 22px; margin-bottom: 28px; }

    /* ── 인풋 공통 ── */
    .field-label { font-size: 11px; letter-spacing: 0.12em; color: #999; margin-bottom: 6px; font-weight: 500; }
    .text-input {
      width: 100%; background: #f8f7f4; border: 1px solid #ebe9e4;
      border-radius: 8px; padding: 11px 14px; font-size: 14px; color: #1a1a1a;
      font-family: 'DM Sans', sans-serif; outline: none; transition: border-color 0.2s; margin-bottom: 12px;
    }
    .text-input:focus { border-color: #b8954a; background: #fff; }
    .text-input::placeholder { color: #ccc; }

    /* ── 버튼 ── */
    .btn {
      background: #1a1a1a; color: #fff; border: none; border-radius: 8px;
      padding: 11px 24px; font-size: 12px; font-weight: 600; cursor: pointer;
      letter-spacing: 0.1em; font-family: 'DM Sans', sans-serif; transition: all 0.2s; white-space: nowrap;
    }
    .btn:hover { background: #333; }
    .btn.outline { background: #fff; color: #1a1a1a; border: 1px solid #ebe9e4; }
    .btn.outline:hover { border-color: #1a1a1a; }
    .btn.accent { background: #b8954a; }
    .btn.accent:hover { background: #a07c38; }
    .btn.full { width: 100%; padding: 13px; }
    .error-msg { font-size: 12px; color: #e05555; margin-bottom: 12px; }

    /* ── 섹션 헤더 ── */
    .section-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; gap: 12px; flex-wrap: wrap; }
    .section-title { font-family: 'Playfair Display', serif; font-size: 22px; }
    .section-sub { font-size: 12px; color: #999; margin-top: 4px; }

    /* ── 직원 탭 ── */
    .emp-tabs {
      display: flex; align-items: center; gap: 0;
      border-bottom: 2px solid #ebe9e4; margin-bottom: 28px; overflow-x: auto;
    }
    .emp-tab {
      padding: 10px 20px; font-size: 13px; font-weight: 500; cursor: pointer;
      border-bottom: 2px solid transparent; margin-bottom: -2px; white-space: nowrap;
      color: #999; transition: all 0.15s; display: flex; align-items: center; gap: 6px;
    }
    .emp-tab:hover { color: #1a1a1a; }
    .emp-tab.active { color: #1a1a1a; border-bottom-color: #b8954a; font-weight: 600; }
    .emp-tab-del {
      width: 16px; height: 16px; border-radius: 50%; background: #e5e5e5;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; color: #999; cursor: pointer; line-height: 1;
    }
    .emp-tab-del:hover { background: #e05555; color: #fff; }
    .emp-tab-add {
      padding: 8px 14px; font-size: 18px; cursor: pointer; color: #b8954a;
      font-weight: 300; margin-left: 4px;
    }
    .emp-tab-add:hover { color: #a07c38; }

    /* ── 직원 정보 그리드 ── */
    .info-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 12px;
    }
    .info-grid-2 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 28px;
    }
    @media (max-width: 900px) {
      .info-grid, .info-grid-2 { grid-template-columns: repeat(2, 1fr); }
    }
    .info-card {
      background: #fff; border: 1px solid #ebe9e4; border-radius: 10px; padding: 14px 16px;
    }
    .info-card-label { font-size: 10px; letter-spacing: 0.15em; color: #999; margin-bottom: 8px; font-weight: 500; }
    .info-card input, .info-card select {
      width: 100%; background: transparent; border: none;
      border-bottom: 1px solid #ebe9e4; padding: 4px 0;
      font-size: 14px; font-weight: 600; color: #1a1a1a;
      font-family: 'DM Sans', sans-serif; outline: none;
    }
    .info-card input:focus, .info-card select:focus { border-bottom-color: #b8954a; }
    .time-range { display: flex; align-items: center; gap: 6px; }
    .time-range input { font-size: 13px; text-align: center; }
    .time-sep { font-size: 12px; color: #ccc; flex-shrink: 0; }

    /* ── 달력 ── */
    .cal-wrap { background: #fff; border: 1px solid #ebe9e4; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
    .cal-week-header { display: grid; grid-template-columns: 56px repeat(7, 1fr); background: #f8f7f4; border-bottom: 1px solid #ebe9e4; }
    .cal-week-th { padding: 10px 4px; font-size: 10px; letter-spacing: 0.12em; color: #999; font-weight: 600; text-align: center; }
    .cal-week-th:first-child { text-align: left; padding-left: 12px; }
    .week-block { border-bottom: 1px solid #f0ede8; }
    .week-block:last-child { border-bottom: none; }
    .week-row { display: grid; grid-template-columns: 56px repeat(7, 1fr); }
    .week-label { padding: 10px 0 10px 12px; font-size: 10px; color: #bbb; font-weight: 600; display: flex; align-items: flex-start; padding-top: 14px; }
    .day-cell { padding: 6px 3px; border-left: 1px solid #f0ede8; min-height: 120px; }
    .day-cell.empty { background: #fafaf9; }
    .day-date {
      font-size: 11px; font-weight: 600; color: #1a1a1a; cursor: pointer;
      width: 22px; height: 22px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 4px; transition: all 0.15s;
    }
    .day-date:hover { background: #f0ede8; }
    .day-date.holiday-type { background: #fff3e0; color: #b8954a; }
    .day-date.holiday-type:hover { background: #ffe0a0; }

    .hour-label { font-size: 9px; color: #bbb; text-align: center; margin-bottom: 1px; letter-spacing: 0.06em; }
    .hour-input {
      width: 100%; border: none; border-bottom: 1px solid #ebe9e4;
      background: transparent; font-size: 11px; color: #1a1a1a;
      font-family: 'DM Sans', sans-serif; padding: 2px 2px; outline: none; text-align: center; margin-bottom: 3px;
    }
    .hour-input:focus { border-bottom-color: #b8954a; }
    .time-input-small {
      width: 100%; border: none; border-bottom: 1px solid #ebe9e4;
      background: transparent; font-size: 10px; color: #888;
      font-family: 'DM Sans', sans-serif; padding: 2px 2px; outline: none; text-align: center;
      margin-bottom: 4px;
    }
    .time-input-small:focus { border-bottom-color: #b8954a; }
    .time-row { display: flex; gap: 2px; align-items: center; margin-bottom: 4px; }
    .time-tilde { font-size: 9px; color: #ccc; }

    .week-summary { background: #faf9f6; border-top: 1px solid #f0ede8; padding: 7px 12px; display: flex; justify-content: space-between; }
    .week-summary-label { font-size: 11px; color: #999; }
    .week-summary-val { font-size: 11px; font-weight: 600; color: #b8954a; }

    /* ── 특이사항 ── */
    .note-row { margin-bottom: 20px; }

    /* ── 급여 합계 ── */
    .summary-card { background: #1a1a1a; border-radius: 12px; padding: 28px; color: #fff; margin-bottom: 20px; }
    .summary-title { font-size: 10px; letter-spacing: 0.2em; color: #888; margin-bottom: 20px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .summary-item-label { font-size: 10px; color: #666; letter-spacing: 0.1em; margin-bottom: 4px; }
    .summary-item-val { font-size: 14px; font-weight: 600; color: #e8e0d0; }
    .summary-divider { border: none; border-top: 1px solid #2a2a2a; margin: 16px 0; }
    .summary-total-label { font-size: 11px; color: #888; letter-spacing: 0.15em; }
    .summary-total-val { font-family: 'Playfair Display', serif; font-size: 28px; color: #b8954a; font-weight: 600; }

    .action-row { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
    .autosave-hint { font-size: 11px; color: #bbb; letter-spacing: 0.05em; align-self: center; }
  `

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="wrap">

        {/* HEADER */}
        <header className="header">
          <div>
            <div className="logo-the">THE</div>
            <div className="logo-main">COMMA<span>'</span></div>
            <div className="logo-sub">LOUNGE</div>
          </div>
          <span className="header-tag">CREW PAYROLL</span>
        </header>

        <main className="main">

          {/* ── STEP 1: 지점 선택 ── */}
          {step === 'branch' && (
            <div>
              <h2 className="page-title">지점 선택</h2>
              <p className="page-sub">급여 계산할 지점을 선택해주세요</p>
              <div className="branch-grid">
                {BRANCHES.map((b, i) => (
                  <div key={b.id} className="branch-card" onClick={() => { setSelectedBranch(b); setStep('login'); setPw(''); setPwError(false) }}>
                    <div className="branch-num">0{i + 1}</div>
                    <div className="branch-name">{b.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 2: 로그인 ── */}
          {step === 'login' && (
            <div className="login-wrap">
              <div className="login-box">
                <div className="login-branch">{selectedBranch?.name}</div>
                <h2 className="login-title">매니저 로그인</h2>
                <p className="field-label">비밀번호</p>
                <input type="password" className="text-input" placeholder="비밀번호 입력"
                  value={pw} onChange={e => setPw(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (pw === selectedBranch.password ? (setStep('main'), setPwError(false)) : setPwError(true))}
                />
                {pwError && <p className="error-msg">비밀번호가 틀렸습니다.</p>}
                <button className="btn full" onClick={() => pw === selectedBranch.password ? (setStep('main'), setPwError(false)) : setPwError(true)}>입장</button>
                <br /><br />
                <button className="btn outline full" onClick={() => setStep('branch')}>← 지점 재선택</button>
              </div>
            </div>
          )}

          {/* ── STEP 3: 급여 계산 ── */}
          {step === 'main' && activeEmp && (
            <div>
              {/* 섹션 헤더 */}
              <div className="section-header">
                <div>
                  <div className="section-title">{selectedBranch?.name} 급여 계산</div>
                  <div className="section-sub">근무시간을 입력하면 급여가 자동으로 계산됩니다</div>
                </div>
                <button className="btn outline" onClick={() => { setStep('branch'); setEmployees([{ ...EMPTY_EMP, id: Date.now() }]); setActiveEmpId(null) }}>← 지점 변경</button>
              </div>

              {/* ── 직원 탭 ── */}
              <div className="emp-tabs">
                {employees.map(emp => (
                  <div key={emp.id} className={`emp-tab${emp.id === activeEmpId ? ' active' : ''}`} onClick={() => handleTabSwitch(emp.id)}>
                    {emp.name || '이름 미입력'}
                    {employees.length > 1 && (
                      <span className="emp-tab-del" onClick={e => { e.stopPropagation(); removeEmployee(emp.id) }}>×</span>
                    )}
                  </div>
                ))}
                <div className="emp-tab-add" onClick={addEmployee} title="직원 추가">＋</div>
              </div>

              {/* ── 직원 정보 1행: 이름, 주민번호, 시급, 소정근로시간 ── */}
              <div className="info-grid">
                <div className="info-card">
                  <div className="info-card-label">직원 이름</div>
                  <input value={activeEmp.name} onChange={e => updateEmp('name', e.target.value)} placeholder="이름 입력" />
                </div>
                <div className="info-card">
                  <div className="info-card-label">주민등록번호</div>
                  <input value={activeEmp.residentId} onChange={e => updateEmp('residentId', e.target.value)} placeholder="000000-0000000" />
                </div>
                <div className="info-card">
                  <div className="info-card-label">시급 (원)</div>
                  <input type="number" value={activeEmp.hourlyWage} onChange={e => updateEmp('hourlyWage', Number(e.target.value))} />
                </div>
                <div className="info-card">
                  <div className="info-card-label">소정근로시간 (일)</div>
                  <input type="number" value={activeEmp.scheduledHours} onChange={e => updateEmp('scheduledHours', Number(e.target.value))} />
                </div>
              </div>

              {/* ── 직원 정보 2행: 고정근무시간, 핸드폰, 이메일, 연도/월 ── */}
              <div className="info-grid-2">
                <div className="info-card">
                  <div className="info-card-label">고정 근무 시간</div>
                  <div className="time-range">
                    <input value={activeEmp.defaultTimeStart} onChange={e => updateEmp('defaultTimeStart', e.target.value)} placeholder="20:00" />
                    <span className="time-sep">~</span>
                    <input value={activeEmp.defaultTimeEnd} onChange={e => updateEmp('defaultTimeEnd', e.target.value)} placeholder="29:00" />
                  </div>
                </div>
                <div className="info-card">
                  <div className="info-card-label">핸드폰 번호</div>
                  <input value={activeEmp.phone} onChange={e => updateEmp('phone', e.target.value)} placeholder="010-0000-0000" />
                </div>
                <div className="info-card">
                  <div className="info-card-label">이메일</div>
                  <input value={activeEmp.email} onChange={e => updateEmp('email', e.target.value)} placeholder="example@email.com" />
                </div>
                <div className="info-card" style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div className="info-card-label">연도</div>
                    <input type="number" value={activeEmp.year} onChange={e => updateEmp('year', Number(e.target.value))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="info-card-label">월</div>
                    <select value={activeEmp.month} onChange={e => updateEmp('month', Number(e.target.value))}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* ── 달력 ── */}
              <div className="cal-wrap">
                <div className="cal-week-header">
                  <div className="cal-week-th">주</div>
                  {['월','화','수','목','금','토','일'].map(d => (
                    <div key={d} className="cal-week-th" style={d==='일'?{color:'#e05555'}:d==='토'?{color:'#4a90d9'}:{}}>{d}</div>
                  ))}
                </div>

                {weeks.map((week, wi) => {
                  const { weekBasicH, weeklyHolidayPay } = calcWeekPay(week, activeEmp)
                  return (
                    <div key={wi} className="week-block">
                      <div className="week-row">
                        <div className="week-label">{wi + 1}주</div>
                        {week.map((day, di) => {
                          if (!day) return <div key={di} className="day-cell empty" />
                          const ds = `${activeEmp.year}-${String(activeEmp.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                          const d = activeEmp.workData[ds] || {}
                          const isHoliday = d.type === '휴'
                          const tStart = d.timeStart !== undefined ? d.timeStart : activeEmp.defaultTimeStart
                          const tEnd = d.timeEnd !== undefined ? d.timeEnd : activeEmp.defaultTimeEnd
                          return (
                            <div key={di} className="day-cell">
                              <div className={`day-date${isHoliday ? ' holiday-type' : ''}`}
                                onClick={() => toggleDayType(ds)} title="클릭: 평일/휴일 전환"
                              >{day}</div>

                              {/* 근무 시간 (개별 수정 가능) */}
                              <div className="time-row">
                                <input className="time-input-small" value={tStart}
                                  onChange={e => updateWorkDay(ds, 'timeStart', e.target.value)}
                                  placeholder={activeEmp.defaultTimeStart || '시작'} />
                                <span className="time-tilde">~</span>
                                <input className="time-input-small" value={tEnd}
                                  onChange={e => updateWorkDay(ds, 'timeEnd', e.target.value)}
                                  placeholder={activeEmp.defaultTimeEnd || '종료'} />
                              </div>

                              {!isHoliday ? (
                                <>
                                  <div className="hour-label">기본</div>
                                  {numInput(d.basicH, v => updateWorkDay(ds, 'basicH', v))}
                                  <div className="hour-label">연장</div>
                                  {numInput(d.overtimeH, v => updateWorkDay(ds, 'overtimeH', v))}
                                  <div className="hour-label">야간</div>
                                  {numInput(d.nightH, v => updateWorkDay(ds, 'nightH', v))}
                                </>
                              ) : (
                                <>
                                  <div className="hour-label">휴일</div>
                                  {numInput(d.holidayH, v => updateWorkDay(ds, 'holidayH', v))}
                                  <div className="hour-label">휴연장</div>
                                  {numInput(d.holidayOtH, v => updateWorkDay(ds, 'holidayOtH', v))}
                                  <div className="hour-label">휴야간</div>
                                  {numInput(d.holidayNightH, v => updateWorkDay(ds, 'holidayNightH', v))}
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="week-summary">
                        <span className="week-summary-label">주 근무 {weekBasicH}시간 · 주휴수당</span>
                        <span className="week-summary-val">{weekBasicH >= 15 ? fmt(weeklyHolidayPay) : '미적용 (15시간 미만)'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 특이사항 */}
              <div className="note-row">
                <p className="field-label">이달의 특이사항</p>
                <input className="text-input" value={activeEmp.specialNote}
                  onChange={e => updateEmp('specialNote', e.target.value)}
                  placeholder="예) 11월 야간 추가 5시간" style={{ marginBottom: 0 }} />
              </div>

              {/* 급여 합계 */}
              {totals && (
                <div className="summary-card">
                  <div className="summary-title">급여 내역</div>
                  <div className="summary-grid">
                    {[
                      ['기본수당', totals.totalBasic],
                      ['주휴수당', totals.totalWeeklyHoliday],
                      ['연장수당', totals.totalOvertime],
                      ['야간수당', totals.totalNight],
                      ['휴일근로', totals.totalHoliday],
                      ['휴일연장', totals.totalHolidayOtPay],
                      ['휴일야간', totals.totalHolidayNightPay],
                    ].map(([label, val]) => (
                      <div key={label}>
                        <div className="summary-item-label">{label}</div>
                        <div className="summary-item-val">{fmt(val)}</div>
                      </div>
                    ))}
                  </div>
                  <hr className="summary-divider" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="summary-total-label">세전 합계</div>
                    <div className="summary-total-val">{fmt(totals.grandTotal)}</div>
                  </div>
                </div>
              )}

              <div className="action-row">
                <span className="autosave-hint">입력 시 자동 저장됩니다</span>
                <button className="btn outline" onClick={() => {
                  if (confirm('이 직원의 데이터를 초기화할까요?')) {
                    setEmployees(prev => prev.map(e => e.id === activeEmpId ? { ...e, workData: {}, specialNote: '' } : e))
                  }
                }}>초기화</button>
                <button className="btn accent" onClick={handleManualSave}>저장하기 ✓</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  )
}
