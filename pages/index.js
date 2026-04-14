import { useState, useEffect, useRef } from 'react'

const BRANCHES = [
  { id: 'gidc',   name: '광명GIDC점',  password: 'gidc1234' },
  { id: 'ingye',  name: '인계점',       password: 'ingye1234' },
  { id: 'anyang', name: '안양일번가점', password: 'anyang1234' },
  { id: 'iksan',  name: '익산점',       password: 'iksan1234' },
  { id: 'juan',   name: '인천주안점',   password: 'juan1234' },
  { id: 'marina', name: '서울마리나점', password: 'marina1234' },
]

function calcBasic(h, w)        { return Math.round(h * w) }
function calcOvertime(h, w)     { return Math.round(h * w * 1.5) }
function calcNight(h, w)        { return Math.round(h * w * 0.5) }
function calcHoliday(h, w)      { return Math.round(h * w * 1.5) }
function calcHolidayOt(h, w)    { return Math.round(h * w * 2.0) }
function calcHolidayNight(h, w) { return Math.round(h * w * 0.5) }
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
  defaultTimeStart: '00:00', defaultTimeEnd: '00:00', // 수정: 00:00으로 변경
  workData: {}, specialNote: '',
  year: new Date().getFullYear(), month: new Date().getMonth() + 1,
}

export default function Home() {
  const [step, setStep] = useState('branch')
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [employees, setEmployees] = useState([{ ...EMPTY_EMP, id: Date.now() }])
  const [activeEmpId, setActiveEmpId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const saveTimer = useRef(null)

  const activeEmp = employees.find(e => e.id === activeEmpId) || employees[0]

  useEffect(() => {
    if (employees.length > 0 && !activeEmpId) setActiveEmpId(employees[0].id)
  }, [employees, activeEmpId])

  function updateEmp(field, value) {
    setEmployees(prev => prev.map(e => e.id === activeEmpId ? { ...e, [field]: value } : e))
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

  // 수정: 3단계 토글 로직 (평 -> 휴 -> 공)
  function toggleDayType(dateStr) {
    const current = activeEmp.workData[dateStr]?.type || '평'
    let next = '평'
    if (current === '평') next = '휴'
    else if (current === '휴') next = '공'
    else next = '평'
    updateWorkDay(dateStr, 'type', next)
  }

  function toggleWeekDayOff(week, dayIndex) {
    const day = week[dayIndex]
    if (!day) return
    const ds = `${activeEmp.year}-${String(activeEmp.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    toggleDayType(ds)
  }

  function addEmployee() {
    const newEmp = {
      ...EMPTY_EMP, id: Date.now(),
      year: activeEmp.year, month: activeEmp.month,
      hourlyWage: activeEmp.hourlyWage,
      defaultTimeStart: activeEmp.defaultTimeStart,
      defaultTimeEnd: activeEmp.defaultTimeEnd,
    }
    setEmployees(prev => [...prev, newEmp])
    setActiveEmpId(newEmp.id)
  }

  function confirmDelete(id) { setDeleteConfirm(id) }

  function doDelete() {
    if (!deleteConfirm || employees.length === 1) { setDeleteConfirm(null); return }
    const remaining = employees.filter(e => e.id !== deleteConfirm)
    setEmployees(remaining)
    if (activeEmpId === deleteConfirm) setActiveEmpId(remaining[0].id)
    setDeleteConfirm(null)
  }

  function calcWeekPay(week, emp) {
    let weekBasicH = 0
    week.forEach(day => {
      if (!day) return
      const ds = `${emp.year}-${String(emp.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      const d = emp.workData[ds]
      if (d?.type === '평') weekBasicH += d.basicH || 0
    })
    return { weekBasicH, weeklyHolidayPay: calcWeeklyHoliday(weekBasicH, emp.hourlyWage) }
  }

  function calcTotal(emp) {
    const weeks = getWeeksInMonth(emp.year, emp.month)
    let totalBasic = 0, totalOvertime = 0, totalNight = 0
    let totalHoliday = 0, totalHolidayOtPay = 0, totalHolidayNightPay = 0
    let totalWeeklyHoliday = 0
    weeks.forEach(week => { totalWeeklyHoliday += calcWeekPay(week, emp).weeklyHolidayPay })
    Object.values(emp.workData).forEach(d => {
      if (d.type === '평') {
        totalBasic += calcBasic(d.basicH || 0, emp.hourlyWage)
        totalOvertime += calcOvertime(d.overtimeH || 0, emp.hourlyWage)
        totalNight += calcNight(d.nightH || 0, emp.hourlyWage)
      } else if (d.type === '휴') {
        totalHoliday += calcHoliday(d.holidayH || 0, emp.hourlyWage)
        totalHolidayOtPay += calcHolidayOt(d.holidayOtH || 0, emp.hourlyWage)
        totalHolidayNightPay += calcHolidayNight(d.holidayNightH || 0, emp.hourlyWage)
      }
      // '공'(휴무) 타입은 계산에서 제외됨
    })
    const grandTotal = totalBasic + totalWeeklyHoliday + totalOvertime + totalNight + totalHoliday + totalHolidayOtPay + totalHolidayNightPay
    return { totalBasic, totalWeeklyHoliday, totalOvertime, totalNight, totalHoliday, totalHolidayOtPay, totalHolidayNightPay, grandTotal }
  }

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
    if (activeEmp.name) doSave(activeEmp)
    setActiveEmpId(id)
  }

  function fmt(n) { return Math.round(n || 0).toLocaleString('ko-KR') + '원' }

  function numInput(val, onChange) {
    return (
      <input type="number" min="0" step="0.5"
        value={val || ''} placeholder="0"
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="hour-input"
      />
    )
  }

  const totals = activeEmp ? calcTotal(activeEmp) : null
  const weeks = activeEmp ? getWeeksInMonth(activeEmp.year, activeEmp.month) : []
  const DAY_LABELS = ['월','화','수','목','금','토','일']

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

    .page-title { font-family: 'Playfair Display', serif; font-size: 30px; margin-bottom: 8px; }
    .page-sub { font-size: 13px; color: #999; letter-spacing: 0.05em; margin-bottom: 48px; }
    .branch-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; max-width: 900px; margin: 0 auto; }
    @media (max-width: 640px) { .branch-grid { grid-template-columns: repeat(2, 1fr); } }
    .branch-card {
      background: #fff; border: 1px solid #ebe9e4; border-radius: 16px;
      padding: 40px 32px; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden;
    }
    .branch-card::after {
      content: ''; position: absolute; bottom: 0; left: 0; right: 0;
      height: 3px; background: #b8954a; transform: scaleX(0); transition: transform 0.25s;
    }
    .branch-card:hover { border-color: #d4b87a; box-shadow: 0 8px 32px rgba(184,149,74,0.12); transform: translateY(-2px); }
    .branch-card:hover::after { transform: scaleX(1); }
    .branch-num { font-size: 11px; color: #ccc; letter-spacing: 0.2em; margin-bottom: 16px; font-weight: 500; }
    .branch-name { font-size: 18px; font-weight: 600; color: #1a1a1a; }

    .login-wrap { display: flex; justify-content: center; align-items: center; min-height: 60vh; }
    .login-box {
      background: #fff; border: 1px solid #ebe9e4; border-radius: 16px;
      padding: 40px; width: 340px; text-align: center; box-shadow: 0 8px 40px rgba(0,0,0,0.06);
    }
    .login-branch { font-size: 11px; letter-spacing: 0.2em; color: #b8954a; margin-bottom: 6px; }
    .login-title { font-family: 'Playfair Display', serif; font-size: 22px; margin-bottom: 28px; }
    .field-label { font-size: 11px; letter-spacing: 0.12em; color: #999; margin-bottom: 6px; font-weight: 500; }
    .text-input {
      width: 100%; background: #fff; border: 1.5px solid #d0ccc5;
      border-radius: 8px; padding: 11px 14px; font-size: 14px; color: #1a1a1a;
      font-family: 'DM Sans', sans-serif; outline: none; transition: border-color 0.2s; margin-bottom: 12px;
    }
    .text-input:focus { border-color: #b8954a; }

    .btn {
      background: #1a1a1a; color: #fff; border: none; border-radius: 8px;
      padding: 11px 24px; font-size: 12px; font-weight: 600; cursor: pointer;
      letter-spacing: 0.1em; font-family: 'DM Sans', sans-serif; transition: all 0.2s; white-space: nowrap;
    }
    .btn:hover { background: #333; }
    .btn.outline { background: #fff; color: #1a1a1a; border: 1px solid #d0ccc5; }
    .btn.outline:hover { border-color: #1a1a1a; }
    .btn.accent { background: #b8954a; }
    .btn.danger { background: #e05555; }
    .btn.full { width: 100%; padding: 13px; }

    .section-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; gap: 12px; flex-wrap: wrap; }
    .section-title { font-family: 'Playfair Display', serif; font-size: 22px; }
    .section-sub { font-size: 12px; color: #999; margin-top: 4px; }

    .emp-tabs { display: flex; align-items: center; border-bottom: 2px solid #ebe9e4; margin-bottom: 28px; overflow-x: auto; }
    .emp-tab {
      padding: 10px 20px; font-size: 13px; font-weight: 500; cursor: pointer;
      border-bottom: 2px solid transparent; margin-bottom: -2px; white-space: nowrap;
      color: #999; transition: all 0.15s; display: flex; align-items: center; gap: 8px;
    }
    .emp-tab.active { color: #1a1a1a; border-bottom-color: #b8954a; font-weight: 600; }
    .emp-tab-del {
      width: 18px; height: 18px; border-radius: 50%; background: #e8e5e0;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; color: #999; cursor: pointer; flex-shrink: 0;
    }
    .emp-tab-del:hover { background: #e05555; color: #fff; }
    .emp-tab-add { padding: 8px 16px; font-size: 20px; cursor: pointer; color: #b8954a; }

    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex;
      align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(2px);
    }
    .modal-box {
      background: #fff; border-radius: 16px; padding: 36px 40px; width: 360px;
      text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    }

    .info-grid, .info-grid-2 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
    @media (max-width: 900px) { .info-grid, .info-grid-2 { grid-template-columns: repeat(2, 1fr); } }
    .info-card { background: #fff; border: 1px solid #d0ccc5; border-radius: 10px; padding: 14px 16px; }
    .info-card-label { font-size: 10px; letter-spacing: 0.15em; color: #999; margin-bottom: 8px; font-weight: 500; }
    .info-card input, .info-card select {
      width: 100%; background: transparent; border: none;
      border-bottom: 1.5px solid #d0ccc5; padding: 4px 0;
      font-size: 14px; font-weight: 600; color: #1a1a1a; outline: none;
    }
    .info-card input:focus { border-bottom-color: #b8954a; }

    .note-row { margin-bottom: 24px; }
    .note-input {
      width: 100%; background: #fff; border: 1.5px solid #d0ccc5;
      border-radius: 8px; padding: 12px 16px; font-size: 14px; outline: none;
    }

    .cal-wrap { background: #fff; border: 1px solid #d0ccc5; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
    .cal-week-header { display: grid; grid-template-columns: 56px repeat(7, 1fr); background: #f8f7f4; border-bottom: 1px solid #ebe9e4; }
    .cal-week-th { padding: 10px 4px; font-size: 10px; color: #999; font-weight: 600; text-align: center; }

    .week-block { border-bottom: 1px solid #f0ede8; }
    .week-row { display: grid; grid-template-columns: 56px repeat(7, 1fr); }
    .week-label { padding: 14px 0 0 12px; font-size: 10px; color: #bbb; font-weight: 600; }

    .day-cell { padding: 6px 3px; border-left: 1px solid #f0ede8; min-height: 135px; position: relative; }
    .day-cell.empty { background: #fafaf9; }
    
    /* 수정: 휴일근로(휴) - 빨간색 그라데이션 */
    .day-cell.is-holiday { background: linear-gradient(160deg, #fff5f5 0%, #fff0e8 100%); }
    
    /* 수정: 완전휴무(공) - 회색 그라데이션 및 중앙 정렬 */
    .day-cell.is-off { 
      background: linear-gradient(160deg, #f0f0f0 0%, #e6e6e6 100%); 
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    }
    
    .off-text { font-size: 16px; font-weight: 800; color: #999; letter-spacing: 0.1em; margin-top: 10px; }
    .day-off-label { position: absolute; top: 6px; right: 5px; font-size: 11px; font-weight: 700; color: #e05555; }

    .day-date {
      font-size: 11px; font-weight: 600; cursor: pointer;
      width: 22px; height: 22px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 4px; transition: all 0.15s;
    }
    .day-date.holiday-type { background: #ffe0e0; color: #e05555; }
    .day-date.off-type { background: #dcdcdc; color: #777; }

    .hour-label { font-size: 9px; color: #bbb; text-align: center; margin-bottom: 1px; }
    .hour-input {
      width: 100%; border: none; border-bottom: 1px solid #ebe9e4;
      background: transparent; font-size: 11px; text-align: center; margin-bottom: 3px; outline: none;
    }
    .time-input-small {
      width: 100%; border: none; border-bottom: 1px solid #ebe9e4;
      background: transparent; font-size: 10px; color: #888; text-align: center; outline: none;
    }
    .time-row { display: flex; gap: 2px; align-items: center; margin-bottom: 4px; }
    .time-tilde { font-size: 9px; color: #ccc; }

    .week-summary { background: #faf9f6; border-top: 1px solid #f0ede8; padding: 7px 12px; display: flex; justify-content: space-between; }
    .week-summary-val { font-size: 11px; font-weight: 600; color: #b8954a; }

    .summary-card { background: #1a1a1a; border-radius: 12px; padding: 28px; color: #fff; margin-bottom: 20px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .summary-item-val { font-size: 14px; font-weight: 600; color: #e8e0d0; }
    .summary-total-val { font-family: 'Playfair Display', serif; font-size: 28px; color: #b8954a; font-weight: 600; }

    .action-row { display: flex; gap: 10px; justify-content: flex-end; }
    .autosave-hint { font-size: 11px; color: #bbb; align-self: center; }
  `

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">직원 삭제</div>
            <div className="modal-desc">정말 삭제하시겠습니까?</div>
            <div className="modal-btns" style={{display:'flex', gap:10}}>
              <button className="btn outline" style={{flex:1}} onClick={() => setDeleteConfirm(null)}>취소</button>
              <button className="btn danger" style={{flex:1}} onClick={doDelete}>삭제</button>
            </div>
          </div>
        </div>
      )}

      <div className="wrap">
        <header className="header">
          <div>
            <div className="logo-the">THE</div>
            <div className="logo-main">COMMA<span>'</span></div>
            <div className="logo-sub">LOUNGE</div>
          </div>
          <span className="header-tag">CREW PAYROLL</span>
        </header>

        <main className="main">
          {step === 'branch' && (
            <div>
              <h2 className="page-title">지점 선택</h2>
              <div className="branch-grid">
                {BRANCHES.map((b, i) => (
                  <div key={b.id} className="branch-card" onClick={() => { setSelectedBranch(b); setStep('login'); setPw(''); }}>
                    <div className="branch-num">0{i + 1}</div>
                    <div className="branch-name">{b.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'login' && (
            <div className="login-wrap">
              <div className="login-box">
                <div className="login-branch">{selectedBranch?.name}</div>
                <h2 className="login-title">매니저 로그인</h2>
                <input type="password" className="text-input" placeholder="비밀번호"
                  value={pw} onChange={e => setPw(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') pw === selectedBranch.password ? setStep('main') : setPwError(true) }}
                />
                <button className="btn full" onClick={() => pw === selectedBranch.password ? setStep('main') : setPwError(true)}>입장</button>
                <button className="btn outline full" style={{marginTop:10}} onClick={() => setStep('branch')}>지점 재선택</button>
              </div>
            </div>
          )}

          {step === 'main' && activeEmp && (
            <div>
              <div className="emp-tabs">
                {employees.map(emp => (
                  <div key={emp.id} className={`emp-tab${emp.id === activeEmpId ? ' active' : ''}`} onClick={() => handleTabSwitch(emp.id)}>
                    {emp.name || '이름 미입력'}
                    {employees.length > 1 && <span className="emp-tab-del" onClick={e => { e.stopPropagation(); confirmDelete(emp.id) }}>×</span>}
                  </div>
                ))}
                <div className="emp-tab-add" onClick={addEmployee}>＋</div>
              </div>

              <div className="info-grid">
                <div className="info-card">
                  <div className="info-card-label">직원 이름</div>
                  <input value={activeEmp.name} onChange={e => updateEmp('name', e.target.value)} />
                </div>
                <div className="info-card">
                  <div className="info-card-label">시급 (원)</div>
                  <input type="number" value={activeEmp.hourlyWage} onChange={e => updateEmp('hourlyWage', Number(e.target.value))} />
                </div>
                <div className="info-card">
                   {/* 수정: 고정 근무 시간 입력부 */}
                  <div className="info-card-label">고정 근무 시간</div>
                  <div className="time-range" style={{display:'flex', gap:5, alignItems:'center'}}>
                    <input value={activeEmp.defaultTimeStart} onChange={e => updateEmp('defaultTimeStart', e.target.value)} placeholder="00:00" />
                    <span style={{color:'#ccc'}}>~</span>
                    <input value={activeEmp.defaultTimeEnd} onChange={e => updateEmp('defaultTimeEnd', e.target.value)} placeholder="00:00" />
                  </div>
                </div>
                <div className="info-card">
                  <div className="info-card-label">해당 월</div>
                  <select value={activeEmp.month} onChange={e => updateEmp('month', Number(e.target.value))}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
                  </select>
                </div>
              </div>

              <div className="cal-wrap">
                <div className="cal-week-header">
                  <div className="cal-week-th">주</div>
                  {DAY_LABELS.map(d => <div key={d} className="cal-week-th">{d}</div>)}
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
                          
                          const type = d.type || '평'
                          const isHolidayWork = type === '휴'
                          const isDayOff = type === '공'
                          
                          const tStart = d.timeStart !== undefined ? d.timeStart : activeEmp.defaultTimeStart
                          const tEnd = d.timeEnd !== undefined ? d.timeEnd : activeEmp.defaultTimeEnd
                          return (
                            <div key={di} className={`day-cell ${isHolidayWork ? 'is-holiday' : ''} ${isDayOff ? 'is-off' : ''}`}>
                              {isHolidayWork && <span className="day-off-label">휴</span>}
                              <div className={`day-date ${isHolidayWork ? 'holiday-type' : ''} ${isDayOff ? 'off-type' : ''}`}
                                onClick={() => toggleDayType(ds)}>{day}</div>

                              {isDayOff ? (
                                <div className="off-text">휴무</div>
                              ) : (
                                <>
                                  <div className="time-row">
                                    <input className="time-input-small" value={tStart}
                                      onChange={e => updateWorkDay(ds, 'timeStart', e.target.value)} placeholder="00:00" />
                                    <span className="time-tilde">~</span>
                                    <input className="time-input-small" value={tEnd}
                                      onChange={e => updateWorkDay(ds, 'timeEnd', e.target.value)} placeholder="00:00" />
                                  </div>
                                  {!isHolidayWork ? (
                                    <>
                                      <div className="hour-label">기본</div>
                                      {numInput(d.basicH, v => updateWorkDay(ds, 'basicH', v))}
                                      <div className="hour-label">야간</div>
                                      {numInput(d.nightH, v => updateWorkDay(ds, 'nightH', v))}
                                    </>
                                  ) : (
                                    <>
                                      <div className="hour-label" style={{color:'#e05555'}}>휴일근로</div>
                                      {numInput(d.holidayH, v => updateWorkDay(ds, 'holidayH', v))}
                                      <div className="hour-label" style={{color:'#e05555'}}>휴야간</div>
                                      {numInput(d.holidayNightH, v => updateWorkDay(ds, 'holidayNightH', v))}
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="week-summary">
                        <span>주 {weekBasicH}시간 근로</span>
                        <span className="week-summary-val">{fmt(weeklyHolidayPay)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {totals && (
                <div className="summary-card">
                  <div className="summary-grid">
                    <div><div style={{fontSize:10, color:'#666'}}>기본수당</div><div className="summary-item-val">{fmt(totals.totalBasic)}</div></div>
                    <div><div style={{fontSize:10, color:'#666'}}>주휴수당</div><div className="summary-item-val">{fmt(totals.totalWeeklyHoliday)}</div></div>
                    <div><div style={{fontSize:10, color:'#666'}}>야간수당</div><div className="summary-item-val">{fmt(totals.totalNight)}</div></div>
                    <div><div style={{fontSize:10, color:'#666'}}>휴일근로</div><div className="summary-item-val">{fmt(totals.totalHoliday + totals.totalHolidayNightPay)}</div></div>
                  </div>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #333', paddingTop:15}}>
                    <div style={{fontSize:12, color:'#888'}}>세전 합계</div>
                    <div className="summary-total-val">{fmt(totals.grandTotal)}</div>
                  </div>
                </div>
              )}

              <div className="action-row">
                <span className="autosave-hint">자동 저장 중...</span>
                <button className="btn accent" onClick={handleManualSave}>저장하기</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  )
}
