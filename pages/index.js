import { useState } from 'react'

const BRANCHES = [
  { id: 'gidc',    name: '광명GIDC점',   password: 'gidc1234' },
  { id: 'ingye',   name: '인계점',        password: 'ingye1234' },
  { id: 'anyang',  name: '안양일번가점',  password: 'anyang1234' },
  { id: 'iksan',   name: '익산점',        password: 'iksan1234' },
  { id: 'juan',    name: '인천주안점',    password: 'juan1234' },
  { id: 'marina',  name: '서울마리나점',  password: 'marina1234' },
]

// 급여 계산 함수들
function calcBasic(hours, hourlyWage) {
  return Math.round(hours * hourlyWage)
}

function calcOvertime(hours, hourlyWage) {
  // 연장수당 = 시급 * 1.5
  return Math.round(hours * hourlyWage * 1.5)
}

function calcNight(hours, hourlyWage) {
  // 야간수당 = 시급 * 0.5 (22:00~06:00)
  return Math.round(hours * hourlyWage * 0.5)
}

function calcHoliday(hours, hourlyWage) {
  // 휴일근로 = 시급 * 1.5
  return Math.round(hours * hourlyWage * 1.5)
}

function calcHolidayOvertime(hours, hourlyWage) {
  // 휴일연장 = 시급 * 2.0
  return Math.round(hours * hourlyWage * 2.0)
}

function calcHolidayNight(hours, hourlyWage) {
  // 휴일야간 = 시급 * 0.5
  return Math.round(hours * hourlyWage * 0.5)
}

function calcWeeklyHoliday(weeklyHours, hourlyWage, scheduledHours) {
  // 주휴수당: 주 소정근로시간 >= 15시간이면 지급
  // 주휴수당 = (주근무시간 / 소정근로시간) * 소정근로시간 * 시급
  if (weeklyHours < 15) return 0
  return Math.round((weeklyHours / scheduledHours) * scheduledHours * hourlyWage)
}

const DAYS_OF_WEEK = ['월', '화', '수', '목', '금', '토', '일']

function getWeeksInMonth(year, month) {
  // month는 1-indexed
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const weeks = []
  let current = new Date(firstDay)

  // 첫 주 시작 (월요일 기준)
  let dayOfWeek = current.getDay() // 0=일
  let mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  current = new Date(current.getTime() + mondayOffset * 86400000)

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

export default function Home() {
  const [step, setStep] = useState('branch') // branch | login | main
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)

  // 직원 정보
  const [empName, setEmpName] = useState('')
  const [hourlyWage, setHourlyWage] = useState(10030)
  const [scheduledHours, setScheduledHours] = useState(8)
  const [calcYear, setCalcYear] = useState(new Date().getFullYear())
  const [calcMonth, setCalcMonth] = useState(new Date().getMonth() + 1)
  const [bonus, setBonus] = useState(0)
  const [specialNote, setSpecialNote] = useState('')

  // 일별 근무 데이터: { [date]: { type: '평'|'휴', basicH, overtimeH, nightH, holidayH, holidayOtH, holidayNightH } }
  const [workData, setWorkData] = useState({})

  const weeks = getWeeksInMonth(calcYear, calcMonth)

  function handleBranchSelect(branch) {
    setSelectedBranch(branch)
    setStep('login')
    setPw('')
    setPwError(false)
  }

  function handleLogin() {
    if (pw === selectedBranch.password) {
      setStep('main')
      setPwError(false)
    } else {
      setPwError(true)
    }
  }

  function updateDay(date, field, value) {
    setWorkData(prev => ({
      ...prev,
      [date]: { type: '평', basicH: 0, overtimeH: 0, nightH: 0, holidayH: 0, holidayOtH: 0, holidayNightH: 0, ...prev[date], [field]: value }
    }))
  }

  function getDayType(date) {
    return workData[date]?.type || '평'
  }

  function toggleDayType(date) {
    const current = getDayType(date)
    updateDay(date, 'type', current === '평' ? '휴' : '평')
  }

  // 주별 급여 계산
  function calcWeekPay(week) {
    let weekBasicH = 0
    let weeklyHolidayPay = 0

    week.forEach((day, idx) => {
      if (!day) return
      const dateStr = `${calcYear}-${String(calcMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      const d = workData[dateStr] || {}
      weekBasicH += d.basicH || 0
    })

    weeklyHolidayPay = calcWeeklyHoliday(weekBasicH, hourlyWage, scheduledHours)
    return { weekBasicH, weeklyHolidayPay }
  }

  // 전체 합계 계산
  function calcTotal() {
    let totalBasic = 0, totalOvertime = 0, totalNight = 0
    let totalHoliday = 0, totalHolidayOt = 0, totalHolidayNight = 0
    let totalWeeklyHoliday = 0

    weeks.forEach(week => {
      const { weeklyHolidayPay } = calcWeekPay(week)
      totalWeeklyHoliday += weeklyHolidayPay
    })

    Object.values(workData).forEach(d => {
      if (d.type === '평') {
        totalBasic += calcBasic(d.basicH || 0, hourlyWage)
        totalOvertime += calcOvertime(d.overtimeH || 0, hourlyWage)
        totalNight += calcNight(d.nightH || 0, hourlyWage)
      } else {
        totalHoliday += calcHoliday(d.holidayH || 0, hourlyWage)
        totalHolidayOt += calcHolidayOvertime(d.holidayOtH || 0, hourlyWage)
        totalHolidayNight += calcHolidayNight(d.holidayNightH || 0, hourlyWage)
      }
    })

    const grandTotal = totalBasic + totalWeeklyHoliday + totalOvertime + totalNight + totalHoliday + totalHolidayOt + totalHolidayNight + Number(bonus)

    return { totalBasic, totalWeeklyHoliday, totalOvertime, totalNight, totalHoliday, totalHolidayOt, totalHolidayNight, grandTotal }
  }

  const totals = step === 'main' ? calcTotal() : null

  function fmt(n) {
    return Math.round(n).toLocaleString('ko-KR') + '원'
  }

  function numInput(val, onChange, placeholder = '0') {
    return (
      <input
        type="number"
        min="0"
        step="0.5"
        value={val || ''}
        placeholder={placeholder}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="hour-input"
      />
    )
  }

  async function handleSave() {
    if (!empName) { alert('직원 이름을 입력해주세요.'); return }
    const payload = {
      branch: selectedBranch.name,
      emp_name: empName,
      hourly_wage: hourlyWage,
      scheduled_hours: scheduledHours,
      year: calcYear,
      month: calcMonth,
      work_data: workData,
      bonus: Number(bonus),
      special_note: specialNote,
      ...totals,
    }
    try {
      const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (res.ok) alert('✓ 저장되었습니다!')
      else alert('저장 실패: ' + data.error)
    } catch { alert('네트워크 오류가 발생했습니다.') }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f8f7f4; color: #1a1a1a; font-family: 'DM Sans', sans-serif; min-height: 100vh; }

        .wrap { min-height: 100vh; display: flex; flex-direction: column; }

        /* HEADER */
        .header {
          background: #fff;
          border-bottom: 1px solid #ebe9e4;
          padding: 18px 40px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .logo-the { font-size: 9px; letter-spacing: 0.3em; color: #b8954a; font-weight: 500; }
        .logo-main { font-family: 'Playfair Display', serif; font-size: 24px; color: #1a1a1a; letter-spacing: 0.03em; }
        .logo-main span { font-style: italic; color: #b8954a; }
        .logo-sub { font-size: 9px; letter-spacing: 0.25em; color: #999; margin-top: 1px; }
        .header-tag { font-size: 10px; letter-spacing: 0.2em; color: #999; }

        /* MAIN */
        .main { flex: 1; padding: 48px 40px; max-width: 1100px; width: 100%; margin: 0 auto; }

        /* BRANCH SELECTION */
        .page-title { font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 600; color: #1a1a1a; margin-bottom: 8px; }
        .page-sub { font-size: 13px; color: #999; letter-spacing: 0.05em; margin-bottom: 40px; }

        .branch-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; max-width: 680px; }
        @media (max-width: 640px) { .branch-grid { grid-template-columns: repeat(2, 1fr); } .header { padding: 16px 20px; } .main { padding: 32px 20px; } }

        .branch-card {
          background: #fff;
          border: 1px solid #ebe9e4;
          border-radius: 12px;
          padding: 22px 20px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
        }
        .branch-card::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 2px;
          background: #b8954a;
          transform: scaleX(0);
          transition: transform 0.25s;
        }
        .branch-card:hover { border-color: #d4b87a; box-shadow: 0 4px 20px rgba(184,149,74,0.1); }
        .branch-card:hover::after { transform: scaleX(1); }
        .branch-num { font-size: 10px; color: #ccc; letter-spacing: 0.15em; margin-bottom: 8px; }
        .branch-name { font-size: 15px; font-weight: 600; color: #1a1a1a; }

        /* LOGIN */
        .login-wrap { display: flex; justify-content: center; align-items: center; min-height: 60vh; }
        .login-box {
          background: #fff;
          border: 1px solid #ebe9e4;
          border-radius: 16px;
          padding: 40px;
          width: 340px;
          text-align: center;
          box-shadow: 0 8px 40px rgba(0,0,0,0.06);
        }
        .login-branch { font-size: 11px; letter-spacing: 0.2em; color: #b8954a; margin-bottom: 6px; }
        .login-title { font-family: 'Playfair Display', serif; font-size: 22px; color: #1a1a1a; margin-bottom: 28px; }

        /* INPUTS */
        .field-label { font-size: 11px; letter-spacing: 0.12em; color: #999; margin-bottom: 6px; font-weight: 500; text-align: left; }
        .text-input {
          width: 100%;
          background: #f8f7f4;
          border: 1px solid #ebe9e4;
          border-radius: 8px;
          padding: 11px 14px;
          font-size: 14px;
          color: #1a1a1a;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: border-color 0.2s;
          margin-bottom: 12px;
        }
        .text-input:focus { border-color: #b8954a; background: #fff; }
        .text-input::placeholder { color: #ccc; }

        /* BUTTONS */
        .btn-gold {
          background: #1a1a1a;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 12px 28px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          letter-spacing: 0.1em;
          font-family: 'DM Sans', sans-serif;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .btn-gold:hover { background: #333; }
        .btn-gold.outline {
          background: #fff;
          color: #1a1a1a;
          border: 1px solid #ebe9e4;
        }
        .btn-gold.outline:hover { border-color: #1a1a1a; }
        .btn-gold.accent { background: #b8954a; }
        .btn-gold.accent:hover { background: #a07c38; }
        .btn-full { width: 100%; padding: 13px; }

        .error-msg { font-size: 12px; color: #e05555; margin-bottom: 12px; letter-spacing: 0.05em; }

        /* MAIN CALC */
        .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; flex-wrap: wrap; gap: 12px; }
        .section-title { font-family: 'Playfair Display', serif; font-size: 22px; color: #1a1a1a; }
        .section-sub { font-size: 12px; color: #999; letter-spacing: 0.05em; margin-top: 2px; }

        /* INFO ROW */
        .info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 32px; }
        .info-card { background: #fff; border: 1px solid #ebe9e4; border-radius: 10px; padding: 16px; }
        .info-card-label { font-size: 10px; letter-spacing: 0.15em; color: #999; margin-bottom: 8px; font-weight: 500; }
        .info-card input, .info-card select {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid #ebe9e4;
          padding: 4px 0;
          font-size: 15px;
          font-weight: 600;
          color: #1a1a1a;
          font-family: 'DM Sans', sans-serif;
          outline: none;
        }
        .info-card input:focus, .info-card select:focus { border-bottom-color: #b8954a; }

        /* CALENDAR TABLE */
        .cal-wrap { background: #fff; border: 1px solid #ebe9e4; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
        .cal-week-header { display: grid; grid-template-columns: 80px repeat(7, 1fr); background: #f8f7f4; border-bottom: 1px solid #ebe9e4; }
        .cal-week-th { padding: 10px 8px; font-size: 10px; letter-spacing: 0.12em; color: #999; font-weight: 600; text-align: center; }
        .cal-week-th:first-child { text-align: left; padding-left: 16px; }

        .week-block { border-bottom: 1px solid #f0ede8; }
        .week-block:last-child { border-bottom: none; }

        .week-row { display: grid; grid-template-columns: 80px repeat(7, 1fr); }
        .week-label { padding: 12px 16px; font-size: 11px; letter-spacing: 0.1em; color: #999; font-weight: 600; display: flex; align-items: flex-start; padding-top: 14px; }

        .day-cell { padding: 8px 4px; border-left: 1px solid #f0ede8; min-height: 60px; }
        .day-cell.empty { background: #fafaf9; }
        .day-date {
          font-size: 11px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 4px;
          text-align: center;
          cursor: pointer;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 4px;
          transition: all 0.15s;
        }
        .day-date.holiday-type { background: #fff3e0; color: #b8954a; }
        .day-date:hover { background: #f0ede8; }
        .day-date.holiday-type:hover { background: #ffe0a0; }

        .hour-input {
          width: 100%;
          border: none;
          border-bottom: 1px solid #ebe9e4;
          background: transparent;
          font-size: 12px;
          color: #1a1a1a;
          font-family: 'DM Sans', sans-serif;
          padding: 2px 2px;
          outline: none;
          text-align: center;
        }
        .hour-input:focus { border-bottom-color: #b8954a; }
        .hour-label { font-size: 9px; color: #bbb; text-align: center; margin-bottom: 2px; letter-spacing: 0.08em; }

        /* WEEKLY HOLIDAY */
        .week-summary { background: #faf9f6; border-top: 1px solid #f0ede8; padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; }
        .week-summary-label { font-size: 11px; color: #999; letter-spacing: 0.08em; }
        .week-summary-val { font-size: 12px; font-weight: 600; color: #b8954a; }

        /* SUMMARY CARD */
        .summary-card {
          background: #1a1a1a;
          border-radius: 12px;
          padding: 28px;
          color: #fff;
          margin-bottom: 20px;
        }
        .summary-title { font-size: 10px; letter-spacing: 0.2em; color: #888; margin-bottom: 20px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; margin-bottom: 20px; }
        .summary-item-label { font-size: 10px; color: #666; letter-spacing: 0.1em; margin-bottom: 4px; }
        .summary-item-val { font-size: 14px; font-weight: 600; color: #e8e0d0; }
        .summary-divider { border: none; border-top: 1px solid #2a2a2a; margin: 16px 0; }
        .summary-total-label { font-size: 11px; color: #888; letter-spacing: 0.15em; }
        .summary-total-val { font-family: 'Playfair Display', serif; font-size: 28px; color: #b8954a; font-weight: 600; }

        /* BONUS ROW */
        .bonus-row { display: flex; gap: 12px; margin-bottom: 20px; align-items: flex-end; }
        .bonus-field { flex: 1; }

        .action-row { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
      `}</style>

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

          {/* STEP 1: 지점 선택 */}
          {step === 'branch' && (
            <div>
              <h2 className="page-title">지점 선택</h2>
              <p className="page-sub">급여 계산할 지점을 선택해주세요</p>
              <div className="branch-grid">
                {BRANCHES.map((b, i) => (
                  <div key={b.id} className="branch-card" onClick={() => handleBranchSelect(b)}>
                    <div className="branch-num">0{i + 1}</div>
                    <div className="branch-name">{b.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: 로그인 */}
          {step === 'login' && (
            <div className="login-wrap">
              <div className="login-box">
                <div className="login-branch">{selectedBranch?.name}</div>
                <h2 className="login-title">매니저 로그인</h2>
                <p className="field-label">비밀번호</p>
                <input
                  type="password"
                  className="text-input"
                  placeholder="비밀번호 입력"
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                />
                {pwError && <p className="error-msg">비밀번호가 틀렸습니다.</p>}
                <button className="btn-gold btn-full" onClick={handleLogin}>입장</button>
                <br /><br />
                <button className="btn-gold outline btn-full" onClick={() => setStep('branch')}>← 지점 재선택</button>
              </div>
            </div>
          )}

          {/* STEP 3: 급여 계산 */}
          {step === 'main' && (
            <div>
              <div className="section-header">
                <div>
                  <div className="section-title">{selectedBranch?.name} 급여 계산</div>
                  <div className="section-sub">근무시간을 입력하면 급여가 자동으로 계산됩니다</div>
                </div>
                <button className="btn-gold outline" onClick={() => { setStep('branch'); setWorkData({}); setEmpName('') }}>← 지점 변경</button>
              </div>

              {/* 직원 정보 */}
              <div className="info-grid">
                <div className="info-card">
                  <div className="info-card-label">직원 이름</div>
                  <input value={empName} onChange={e => setEmpName(e.target.value)} placeholder="이름 입력" />
                </div>
                <div className="info-card">
                  <div className="info-card-label">시급 (원)</div>
                  <input type="number" value={hourlyWage} onChange={e => setHourlyWage(Number(e.target.value))} />
                </div>
                <div className="info-card">
                  <div className="info-card-label">소정근로시간 (일)</div>
                  <input type="number" value={scheduledHours} onChange={e => setScheduledHours(Number(e.target.value))} />
                </div>
                <div className="info-card">
                  <div className="info-card-label">연도</div>
                  <input type="number" value={calcYear} onChange={e => { setCalcYear(Number(e.target.value)); setWorkData({}) }} />
                </div>
                <div className="info-card">
                  <div className="info-card-label">월</div>
                  <select value={calcMonth} onChange={e => { setCalcMonth(Number(e.target.value)); setWorkData({}) }}>
                    {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}
                  </select>
                </div>
              </div>

              {/* 달력 입력 */}
              <div className="cal-wrap">
                <div className="cal-week-header">
                  <div className="cal-week-th">주차</div>
                  {['월','화','수','목','금','토','일'].map(d => (
                    <div key={d} className="cal-week-th" style={d==='일'?{color:'#e05555'}:d==='토'?{color:'#4a90d9'}:{}}>{d}</div>
                  ))}
                </div>

                {weeks.map((week, wi) => {
                  const { weekBasicH, weeklyHolidayPay } = calcWeekPay(week)
                  return (
                    <div key={wi} className="week-block">
                      <div className="week-row">
                        <div className="week-label">{wi + 1}주</div>
                        {week.map((day, di) => {
                          if (!day) return <div key={di} className="day-cell empty" />
                          const dateStr = `${calcYear}-${String(calcMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                          const d = workData[dateStr] || {}
                          const isHoliday = d.type === '휴'
                          return (
                            <div key={di} className="day-cell">
                              <div
                                className={`day-date${isHoliday ? ' holiday-type' : ''}`}
                                onClick={() => toggleDayType(dateStr)}
                                title="클릭하면 평일/휴일 전환"
                              >{day}</div>
                              {!isHoliday ? (
                                <>
                                  <div className="hour-label">기본</div>
                                  {numInput(d.basicH, v => updateDay(dateStr, 'basicH', v))}
                                  <div className="hour-label">연장</div>
                                  {numInput(d.overtimeH, v => updateDay(dateStr, 'overtimeH', v))}
                                  <div className="hour-label">야간</div>
                                  {numInput(d.nightH, v => updateDay(dateStr, 'nightH', v))}
                                </>
                              ) : (
                                <>
                                  <div className="hour-label">휴일</div>
                                  {numInput(d.holidayH, v => updateDay(dateStr, 'holidayH', v))}
                                  <div className="hour-label">휴연장</div>
                                  {numInput(d.holidayOtH, v => updateDay(dateStr, 'holidayOtH', v))}
                                  <div className="hour-label">휴야간</div>
                                  {numInput(d.holidayNightH, v => updateDay(dateStr, 'holidayNightH', v))}
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

              {/* 교통비/보너스 + 특이사항 */}
              <div className="bonus-row">
                <div className="bonus-field">
                  <p className="field-label">교통비 / 보너스 (원)</p>
                  <input type="number" className="text-input" value={bonus} onChange={e => setBonus(e.target.value)} placeholder="0" style={{marginBottom:0}} />
                </div>
                <div className="bonus-field">
                  <p className="field-label">이달의 특이사항</p>
                  <input className="text-input" value={specialNote} onChange={e => setSpecialNote(e.target.value)} placeholder="예) 11월 야간 추가 5시간" style={{marginBottom:0}} />
                </div>
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
                      ['휴일연장', totals.totalHolidayOt],
                      ['휴일야간', totals.totalHolidayNight],
                      ['교통비/보너스', Number(bonus)],
                    ].map(([label, val]) => (
                      <div key={label}>
                        <div className="summary-item-label">{label}</div>
                        <div className="summary-item-val">{fmt(val)}</div>
                      </div>
                    ))}
                  </div>
                  <hr className="summary-divider" />
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div className="summary-total-label">세전 합계</div>
                    <div className="summary-total-val">{fmt(totals.grandTotal)}</div>
                  </div>
                </div>
              )}

              <div className="action-row">
                <button className="btn-gold outline" onClick={() => { if(confirm('초기화하시겠습니까?')) { setWorkData({}); setBonus(0); setSpecialNote('') } }}>초기화</button>
                <button className="btn-gold accent" onClick={handleSave}>저장하기 ✓</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  )
}
