import { useState, useEffect, useRef } from 'react'

// ── 수정 #7: 서울마리나점 → 하남점 ──
const BRANCHES = [
  { id: 'gidc',   name: '광명GIDC점',  password: 'gidc1234' },
  { id: 'ingye',  name: '인계점',       password: 'ingye13' },
  { id: 'anyang', name: '안양일번가점', password: 'anyang30' },
  { id: 'iksan',  name: '익산점',       password: 'iksan08' },
  { id: 'juan',   name: '인천주안점',   password: 'juan00' },
  { id: 'hanam',  name: '하남점',       password: 'hanam77' },
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

// ── 수정 #2: 시간 문자열 자동 포맷 (9→09:00, 930→09:30, 18→18:00 등) ──
function formatTimeInput(raw) {
  const s = String(raw).replace(/[^0-9]/g, '')
  if (!s) return '00:00'
  if (s.length <= 2) {
    const h = parseInt(s, 10)
    return `${String(h).padStart(2, '0')}:00`
  }
  if (s.length === 3) {
    const h = parseInt(s.slice(0, 1), 10)
    const m = s.slice(1)
    return `${String(h).padStart(2, '0')}:${m}`
  }
  const h = parseInt(s.slice(0, 2), 10)
  const m = s.slice(2, 4)
  return `${String(h).padStart(2, '0')}:${m}`
}

// ── 수정 #2: 시작~종료 시간으로 기본 근무시간 자동 계산 ──
function calcAutoHours(startStr, endStr) {
  if (!startStr || !endStr) return null
  const parseTime = (t) => {
    const [h, m] = t.split(':').map(Number)
    return h + (m || 0) / 60
  }
  let start = parseTime(startStr)
  let end = parseTime(endStr)
  if (isNaN(start) || isNaN(end)) return null
  if (end <= start) end += 24 // 자정 넘기는 케이스
  const raw = end - start // 휴게 차감 없음 (수동 입력)
  return raw > 0 ? Math.round(raw * 2) / 2 : 0
}

const EMPTY_EMP = {
  name: '', residentId: '', phone: '', email: '',
  accountNumber: '',
  empType: '알바',
  hourlyWage: 10320,                          // ── 수정 A: 기본 시급 변경 ──
  defaultTimeStart: '00:00', defaultTimeEnd: '00:00', // ── 수정 A: 기본 시간 00:00 ──
  workData: {}, specialNote: '',
  manualBasic: 0, manualWeeklyHoliday: 0, manualOvertime: 0,
  manualNight: 0, manualHoliday: 0, manualHolidayOt: 0, manualHolidayNight: 0,
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
  // ── 수정 #2: 시간 입력 임시 상태 (셀별) ──
  const [timeInputs, setTimeInputs] = useState({}) // { [ds]: { start, end } }
  const saveTimer = useRef(null)

  useEffect(() => {
    const saved = localStorage.getItem('payroll_backup')
    if (saved) {
      try { setEmployees(JSON.parse(saved)) } catch (e) {}
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('payroll_backup', JSON.stringify(employees))
  }, [employees])

  // ── 버그픽스: empId를 인자로 받아 클로저 stale 문제 해결 ──
  async function loadData(branchName, empName, yr, mo, empId) {
    if (!branchName || !empName) return
    const targetId = empId || activeEmpId
    try {
      const res = await fetch(`/api/load?branch=${encodeURIComponent(branchName)}&name=${encodeURIComponent(empName)}&year=${yr}&month=${mo}`)
      const result = await res.json()
      if (result.success && result.data) {
        setEmployees(prev => prev.map(e =>
          e.id === targetId ? {
            ...e,
            workData: result.data.work_data || {},
            specialNote: result.data.special_note || '',
            hourlyWage: result.data.hourly_wage || 10320,
          } : e
        ))
      }
      // 데이터 없으면 workData 빈 상태 유지 (이미 초기화됐으므로 OK)
    } catch (e) { console.error('데이터 로드 실패:', e) }
  }

  const activeEmp = employees.find(e => e.id === activeEmpId) || employees[0]

  useEffect(() => {
    if (step === 'main' && selectedBranch && activeEmp?.name) {
      loadData(selectedBranch.name, activeEmp.name, activeEmp.year, activeEmp.month, activeEmpId)
    }
  }, [activeEmpId, activeEmp?.month, activeEmp?.year])

  useEffect(() => {
    if (selectedBranch) {
      const storageKey = `payroll_backup_${selectedBranch.name}`
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          setEmployees(parsed)
          if (parsed.length > 0) setActiveEmpId(parsed[0].id)
        } catch (e) {}
      } else {
        const initialEmp = [{ ...EMPTY_EMP, id: Date.now() }]
        setEmployees(initialEmp)
        setActiveEmpId(initialEmp[0].id)
      }
    }
  }, [selectedBranch])

  useEffect(() => {
    if (selectedBranch && employees.length > 0) {
      const storageKey = `payroll_backup_${selectedBranch.name}`
      localStorage.setItem(storageKey, JSON.stringify(employees))
    }
  }, [employees, selectedBranch])

  const handleBranchChange = () => {
    if (confirm('지점을 변경하시겠습니까? 현재 입력 중인 내용은 이 지점에 자동 저장됩니다.')) {
      setStep('branch')
      setSelectedBranch(null)
      setPw('')
      setPwError(false)
    }
  }

  function updateEmp(field, value) {
    setEmployees(prev => prev.map(e => e.id === activeEmpId ? { ...e, [field]: value } : e))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => autoSave(), 1500)
  }

  // ── 월 변경 시 로컬스토리지 저장 후 새 월 로드 (Supabase 호출 없음) ──
  async function handleMonthChange(newMonth) {
    const emp = employees.find(e => e.id === activeEmpId) || employees[0]
    // 1. 현재 데이터 로컬스토리지에 저장
    if (selectedBranch) {
      const storageKey = `payroll_backup_${selectedBranch.name}`
      localStorage.setItem(storageKey, JSON.stringify(employees))
    }
    // 2. 월 변경 + workData 초기화
    const newId = emp?.id
    setEmployees(prev => prev.map(e =>
      e.id === newId ? { ...e, month: newMonth, workData: {} } : e
    ))
    // 3. 새 월 데이터 Supabase에서 로드
    if (selectedBranch && emp?.name) {
      setTimeout(() => loadData(selectedBranch.name, emp.name, emp.year, newMonth, newId), 150)
    }
  }

  async function handleYearChange(newYear) {
    const emp = employees.find(e => e.id === activeEmpId) || employees[0]
    if (selectedBranch) {
      const storageKey = `payroll_backup_${selectedBranch.name}`
      localStorage.setItem(storageKey, JSON.stringify(employees))
    }
    const newId = emp?.id
    setEmployees(prev => prev.map(e =>
      e.id === newId ? { ...e, year: newYear, workData: {} } : e
    ))
    if (selectedBranch && emp?.name) {
      setTimeout(() => loadData(selectedBranch.name, emp.name, newYear, emp.month, newId), 150)
    }
  }

  function updateWorkDay(dateStr, field, value) {
    setEmployees(prev => prev.map(e => {
      if (e.id !== activeEmpId) return e
      return {
        ...e,
        workData: {
          ...e.workData,
          [dateStr]: {
            type: '평', basicH: 0, restH: 0, overtimeH: 0, nightH: 0,
            holidayH: 0, holidayRestH: 0, holidayOtH: 0, holidayNightH: 0,
            timeStart: e.defaultTimeStart, timeEnd: e.defaultTimeEnd,
            ...e.workData[dateStr], [field]: value
          }
        }
      }
    }))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => autoSave(), 1500)
  }

  // ── 수정 #2: 시간 입력 포커스 아웃 시 자동 포맷 + 기본시간 자동계산 ──
  function handleTimeBlur(dateStr, field, rawVal) {
    const formatted = formatTimeInput(rawVal)
    updateWorkDay(dateStr, field, formatted)

    const currentData = activeEmp.workData[dateStr] || {}
    const start = field === 'timeStart' ? formatted : (currentData.timeStart || activeEmp.defaultTimeStart)
    const end   = field === 'timeEnd'   ? formatted : (currentData.timeEnd   || activeEmp.defaultTimeEnd)

    const autoH = calcAutoHours(start, end)
    if (autoH !== null) {
      updateWorkDay(dateStr, 'basicH', autoH)
    }
    // 임시 입력 상태 초기화
    setTimeInputs(prev => {
      const next = { ...prev }
      if (next[dateStr]) {
        delete next[dateStr][field === 'timeStart' ? 'start' : 'end']
      }
      return next
    })
  }

  function handleTimeChange(dateStr, field, val) {
    setTimeInputs(prev => ({
      ...prev,
      [dateStr]: { ...prev[dateStr], [field === 'timeStart' ? 'start' : 'end']: val }
    }))
  }

  // ── 기본 근무시간 입력 포커스 아웃 시 자동 포맷 ──
  function handleDefaultTimeBlur(field, rawVal) {
    const formatted = formatTimeInput(rawVal)
    updateEmp(field, formatted)
  }

  function toggleDayType(dateStr) {
    const current = activeEmp.workData[dateStr]?.type || '평'
    let nextType = '평'
    if (current === '평') nextType = '휴'
    else if (current === '휴') nextType = '공'
    else nextType = '평'

    // ── B2: 타입 전환 시 이전 타입의 시간/급여 데이터 초기화 ──
    setEmployees(prev => prev.map(e => {
      if (e.id !== activeEmpId) return e
      const existing = e.workData[dateStr] || {}
      let resetFields = {}

      if (nextType === '휴' || nextType === '공') {
        // 평일→휴일근로 or 평일→휴무: 평일 데이터 초기화
        resetFields = {
          basicH: 0, restH: 0, nightH: 0, overtimeH: 0,
          timeStart: '00:00', timeEnd: '00:00',
        }
      } else if (nextType === '평') {
        // 휴일근로→평일 or 휴무→평일: 휴일 데이터 초기화
        resetFields = {
          holidayH: 0, holidayRestH: 0, holidayNightH: 0, holidayOtH: 0,
          timeStart: '00:00', timeEnd: '00:00',
        }
      }

      return {
        ...e,
        workData: {
          ...e.workData,
          [dateStr]: { ...existing, ...resetFields, type: nextType }
        }
      }
    }))

    // timeInputs 임시 상태도 초기화
    setTimeInputs(prev => ({ ...prev, [dateStr]: {} }))

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => autoSave(), 1500)
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
      weekBasicH += emp.workData[ds]?.basicH || 0
    })
    return { weekBasicH, weeklyHolidayPay: calcWeeklyHoliday(weekBasicH, emp.hourlyWage) }
  }

  // ── 수정 #5: 수동 입력 고정값 + 캘린더 계산값 합산 ──
  function calcTotal(emp) {
    const weeks = getWeeksInMonth(emp.year, emp.month)
    let autoBasic = 0, autoOvertime = 0, autoNight = 0
    let autoHoliday = 0, autoHolidayOtPay = 0, autoHolidayNightPay = 0
    let totalWeeklyHoliday = 0
    weeks.forEach(week => { totalWeeklyHoliday += calcWeekPay(week, emp).weeklyHolidayPay })
    Object.values(emp.workData).forEach(d => {
      if (d.type !== '휴') {
        autoBasic    += calcBasic(d.basicH || 0, emp.hourlyWage)
        autoOvertime += calcOvertime(d.overtimeH || 0, emp.hourlyWage)
        autoNight    += calcNight(d.nightH || 0, emp.hourlyWage)
      } else {
        autoHoliday       += calcHoliday(d.holidayH || 0, emp.hourlyWage)
        autoHolidayOtPay  += calcHolidayOt(d.holidayOtH || 0, emp.hourlyWage)
        autoHolidayNightPay += calcHolidayNight(d.holidayNightH || 0, emp.hourlyWage)
      }
    })
    const totalBasic         = (emp.manualBasic || 0) + autoBasic
    const totalOvertime      = (emp.manualOvertime || 0) + autoOvertime
    const totalNight         = (emp.manualNight || 0) + autoNight
    const totalHoliday       = (emp.manualHoliday || 0) + autoHoliday
    const totalHolidayOtPay  = (emp.manualHolidayOt || 0) + autoHolidayOtPay
    const totalHolidayNightPay = (emp.manualHolidayNight || 0) + autoHolidayNightPay
    const totalWeeklyFinal   = (emp.manualWeeklyHoliday || 0) + totalWeeklyHoliday
    const grandTotal = totalBasic + totalWeeklyFinal + totalOvertime + totalNight + totalHoliday + totalHolidayOtPay + totalHolidayNightPay
    return { totalBasic, totalWeeklyHoliday: totalWeeklyFinal, totalOvertime, totalNight, totalHoliday, totalHolidayOtPay, totalHolidayNightPay, grandTotal }
  }

  // ── 자동저장: 로컬스토리지에만 저장 (Supabase 호출 없음) ──
  function autoSave() {
    if (!selectedBranch) return
    const emp = employees.find(e => e.id === activeEmpId)
    if (!emp || !emp.name) return
    const storageKey = `payroll_backup_${selectedBranch.name}`
    localStorage.setItem(storageKey, JSON.stringify(employees))
  }

  // ── Supabase 저장: 임시저장/최종마감 버튼 클릭 시에만 호출 ──
  async function doSaveEmp(emp, status = 'saved') {
    if (!emp || !emp.name || !selectedBranch) return
    const totals = calcTotal(emp)
    const payload = {
      branch: selectedBranch.name,
      emp_name: emp.name,
      emp_type: emp.empType || '알바',
      resident_id: emp.residentId || '',
      phone: emp.phone || '',
      email: emp.email || '',
      account_number: emp.accountNumber || '',
      hourly_wage: emp.hourlyWage,
      scheduled_hours: emp.scheduledHours || 8,
      default_time: `${emp.defaultTimeStart}~${emp.defaultTimeEnd}`,
      year: emp.year,
      month: emp.month,
      work_data: emp.workData,
      special_note: emp.specialNote || '',
      status,
      totalBasic: totals.totalBasic,
      totalWeeklyHoliday: totals.totalWeeklyHoliday,
      totalOvertime: totals.totalOvertime,
      totalNight: totals.totalNight,
      totalHoliday: totals.totalHoliday,
      totalHolidayOtPay: totals.totalHolidayOtPay,
      totalHolidayNightPay: totals.totalHolidayNightPay,
      grandTotal: totals.grandTotal,
    }
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status } : e))
      } else {
        const errData = await res.json()
        console.error('저장 API 오류:', errData)
      }
    } catch (e) {
      console.error('저장 실패:', e)
    }
  }

  async function doSave(emp, status = 'saved') {
    await doSaveEmp(emp, status)
  }

  async function handleManualSave(targetStatus) {
    if (!activeEmp.name) { alert('직원 이름을 입력해주세요.'); return }
    await doSave(activeEmp, targetStatus)
    alert(targetStatus === 'final' ? '✅ 최종 마감이 완료되었습니다!' : '💾 임시 저장되었습니다!')
  }

  function handleTabSwitch(id) {
    // 탭 전환 시 로컬스토리지만 저장 (Supabase 호출 없음)
    if (selectedBranch) {
      const storageKey = `payroll_backup_${selectedBranch.name}`
      localStorage.setItem(storageKey, JSON.stringify(employees))
    }
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

  // ── 수정 #8: 급여계산 페이지 엑셀 다운로드 ──
  function downloadExcelSingle() {
    if (!activeEmp) return
    const totals = calcTotal(activeEmp)
    const headers = ['날짜', '유형', '시작', '종료', '기본', '휴게', '야간', '연장', '휴일근로', '휴일휴게', '휴일야간', '휴일연장']
    const rows = []
    const weeks = getWeeksInMonth(activeEmp.year, activeEmp.month)
    weeks.forEach(week => {
      week.forEach(day => {
        if (!day) return
        const ds = `${activeEmp.year}-${String(activeEmp.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
        const d = activeEmp.workData[ds]
        if (!d) return
        rows.push([
          ds, d.type || '평',
          d.timeStart || '', d.timeEnd || '',
          d.basicH || 0, d.restH || 0, d.nightH || 0, d.overtimeH || 0,
          d.holidayH || 0, d.holidayRestH || 0, d.holidayNightH || 0, d.holidayOtH || 0,
        ])
      })
    })
    const summaryHeaders = ['', '기본수당', '주휴수당', '연장수당', '야간수당', '휴일수당', '휴일연장', '휴일야간', '세전합계']
    const summaryRow = [
      '급여합계',
      Math.round(totals.totalBasic), Math.round(totals.totalWeeklyHoliday),
      Math.round(totals.totalOvertime), Math.round(totals.totalNight),
      Math.round(totals.totalHoliday), Math.round(totals.totalHolidayOtPay),
      Math.round(totals.totalHolidayNightPay), Math.round(totals.grandTotal),
    ]
    const infoRow = [`직원명: ${activeEmp.name}`, `지점: ${selectedBranch?.name}`, `${activeEmp.year}년 ${activeEmp.month}월`, `구분: ${activeEmp.empType || '알바'}`]
    const BOM = '\uFEFF'
    const csv = BOM + [
      infoRow.map(v => `"${v}"`).join(','),
      '',
      headers.map(v => `"${v}"`).join(','),
      ...rows.map(row => row.map(v => `"${String(v)}"`).join(',')),
      '',
      summaryHeaders.map(v => `"${v}"`).join(','),
      summaryRow.map(v => `"${String(v)}"`).join(','),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `급여명세_${activeEmp.year}년${activeEmp.month}월_${activeEmp.name}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
    .text-input::placeholder { color: #bbb; }

    .btn {
      background: #1a1a1a; color: #fff; border: none; border-radius: 8px;
      padding: 11px 24px; font-size: 12px; font-weight: 600; cursor: pointer;
      letter-spacing: 0.1em; font-family: 'DM Sans', sans-serif; transition: all 0.2s; white-space: nowrap;
    }
    .btn:hover { background: #333; }
    .btn.outline { background: #fff; color: #1a1a1a; border: 1px solid #d0ccc5; }
    .btn.outline:hover { border-color: #1a1a1a; }
    .btn.accent { background: #b8954a; }
    .btn.accent:hover { background: #a07c38; }
    .btn.danger { background: #e05555; }
    .btn.danger:hover { background: #c03030; }
    .btn.full { width: 100%; padding: 13px; }
    .error-msg { font-size: 12px; color: #e05555; margin-bottom: 12px; }

    .section-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; gap: 12px; flex-wrap: wrap; }
    .section-title { font-family: 'Playfair Display', serif; font-size: 22px; }
    .section-sub { font-size: 12px; color: #999; margin-top: 4px; }

    /* ── 수정 #6: 직원/알바 탭 스타일 ── */
    .emp-type-tabs { display: flex; gap: 0; margin-bottom: 10px; border-radius: 8px; overflow: hidden; border: 1.5px solid #d0ccc5; width: fit-content; }
    .emp-type-tab {
      padding: 6px 18px; font-size: 12px; font-weight: 600; cursor: pointer;
      background: #fff; color: #999; transition: all 0.15s; letter-spacing: 0.08em;
      border: none; font-family: 'DM Sans', sans-serif;
    }
    .emp-type-tab.active { background: #1a1a1a; color: #fff; }
    .emp-type-tab:first-child { border-right: 1.5px solid #d0ccc5; }

    .emp-tabs { display: flex; align-items: center; border-bottom: 2px solid #ebe9e4; margin-bottom: 28px; overflow-x: auto; }
    .emp-tab {
      padding: 10px 20px; font-size: 13px; font-weight: 500; cursor: pointer;
      border-bottom: 2px solid transparent; margin-bottom: -2px; white-space: nowrap;
      color: #999; transition: all 0.15s; display: flex; align-items: center; gap: 8px;
    }
    .emp-tab:hover { color: #1a1a1a; }
    .emp-tab.active { color: #1a1a1a; border-bottom-color: #b8954a; font-weight: 600; }
    .emp-tab-del {
      width: 18px; height: 18px; border-radius: 50%; background: #e8e5e0;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; color: #999; cursor: pointer; flex-shrink: 0; transition: all 0.15s;
    }
    .emp-tab-del:hover { background: #e05555; color: #fff; }
    .emp-tab-add { padding: 8px 16px; font-size: 20px; cursor: pointer; color: #b8954a; font-weight: 300; }
    .emp-tab-add:hover { color: #a07c38; }

    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex;
      align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(2px);
    }
    .modal-box {
      background: #fff; border-radius: 16px; padding: 36px 40px; width: 360px;
      text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    }
    .modal-icon { font-size: 36px; margin-bottom: 16px; }
    .modal-title { font-family: 'Playfair Display', serif; font-size: 20px; margin-bottom: 10px; color: #1a1a1a; }
    .modal-desc { font-size: 13px; color: #888; line-height: 1.6; margin-bottom: 28px; }
    .modal-emp-name { font-weight: 700; color: #e05555; }
    .modal-btns { display: flex; gap: 10px; }
    .modal-btns .btn { flex: 1; }

    .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
    .info-grid-2 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
    @media (max-width: 900px) { .info-grid, .info-grid-2 { grid-template-columns: repeat(2, 1fr); } }
    .info-card { background: #fff; border: 1px solid #d0ccc5; border-radius: 10px; padding: 14px 16px; }
    .info-card-label { font-size: 10px; letter-spacing: 0.15em; color: #999; margin-bottom: 8px; font-weight: 500; }
    .info-card input, .info-card select {
      width: 100%; background: transparent; border: none;
      border-bottom: 1.5px solid #d0ccc5; padding: 4px 0;
      font-size: 14px; font-weight: 600; color: #1a1a1a;
      font-family: 'DM Sans', sans-serif; outline: none;
    }
    .info-card input:focus, .info-card select:focus { border-bottom-color: #b8954a; }
    .time-range { display: flex; align-items: center; gap: 6px; }
    .time-sep { font-size: 12px; color: #bbb; flex-shrink: 0; }

    .note-row { margin-bottom: 24px; }
    .note-input {
      width: 100%; background: #fff; border: 1.5px solid #d0ccc5;
      border-radius: 8px; padding: 12px 16px; font-size: 14px; color: #1a1a1a;
      font-family: 'DM Sans', sans-serif; outline: none; transition: border-color 0.2s;
    }
    .note-input:focus { border-color: #b8954a; }
    .note-input::placeholder { color: #bbb; }

    .cal-wrap { background: #fff; border: 1px solid #d0ccc5; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
    .cal-week-header { display: grid; grid-template-columns: 56px repeat(7, 1fr); background: #f8f7f4; border-bottom: 1px solid #ebe9e4; }
    .cal-week-th {
      padding: 10px 4px; font-size: 10px; letter-spacing: 0.12em; color: #999;
      font-weight: 600; text-align: center; cursor: pointer; transition: background 0.15s;
      user-select: none;
    }
    .cal-week-th:first-child { text-align: left; padding-left: 12px; cursor: default; }
    .cal-week-th:not(:first-child):hover { background: #f0ede8; }

    .week-block { border-bottom: 1px solid #f0ede8; }
    .week-block:last-child { border-bottom: none; }
    .week-row { display: grid; grid-template-columns: 56px repeat(7, 1fr); }
    .week-label { padding: 10px 0 10px 12px; font-size: 10px; color: #bbb; font-weight: 600; display: flex; align-items: flex-start; padding-top: 14px; }

    /* ── 수정 #3: 칸이 4개로 늘어 min-height 증가 ── */
    .day-cell { padding: 6px 3px; border-left: 1px solid #f0ede8; min-height: 160px; position: relative; transition: background 0.2s; }
    .day-cell.empty { background: #fafaf9; }
    .day-cell.is-holiday { background: linear-gradient(160deg, #fff5f5 0%, #fff0e8 100%); }
    .day-cell.is-off {
      background: linear-gradient(160deg, #f0f0f0 0%, #e6e6e6 100%);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    }
    .off-text { font-size: 16px; font-weight: 800; color: #999; letter-spacing: 0.1em; margin-top: 10px; }

    .day-date {
      font-size: 11px; font-weight: 600; color: #1a1a1a; cursor: pointer;
      width: 22px; height: 22px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 4px; transition: all 0.15s;
    }
    .day-date:hover { background: #f0ede8; }
    .day-date.holiday-type { background: #ffe0e0; color: #e05555; }
    .day-date.holiday-type:hover { background: #ffc0c0; }
    .day-date.off-type { background: #dcdcdc; color: #777; }

    .hour-label { font-size: 9px; color: #bbb; text-align: center; margin-bottom: 1px; letter-spacing: 0.06em; }
    .hour-input {
      width: 100%; border: none; border-bottom: 1px solid #ebe9e4;
      background: transparent; font-size: 11px; color: #1a1a1a;
      font-family: 'DM Sans', sans-serif; padding: 2px; outline: none; text-align: center; margin-bottom: 3px;
    }
    .hour-input:focus { border-bottom-color: #b8954a; }
    .time-input-small {
      width: 100%; border: none; border-bottom: 1px solid #ebe9e4;
      background: transparent; font-size: 10px; color: #888;
      font-family: 'DM Sans', sans-serif; padding: 2px; outline: none; text-align: center;
    }
    .time-input-small:focus { border-bottom-color: #b8954a; }
    .time-row { display: flex; gap: 2px; align-items: center; margin-bottom: 4px; }
    .time-tilde { font-size: 9px; color: #ccc; }

    .week-summary { background: #faf9f6; border-top: 1px solid #f0ede8; padding: 7px 12px; display: flex; justify-content: space-between; }
    .week-summary-label { font-size: 11px; color: #999; }
    .week-summary-val { font-size: 11px; font-weight: 600; color: #b8954a; }

    /* ── 수정 #5: 급여 내역 수동 입력 스타일 ── */
    .summary-card { background: #1a1a1a; border-radius: 12px; padding: 28px; color: #fff; margin-bottom: 20px; }
    .summary-title { font-size: 10px; letter-spacing: 0.2em; color: #888; margin-bottom: 20px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .summary-item-label { font-size: 10px; color: #666; letter-spacing: 0.1em; margin-bottom: 4px; }
    .summary-item-val { font-size: 14px; font-weight: 600; color: #e8e0d0; }
    .summary-manual-input {
      width: 100%; background: transparent; border: none; border-bottom: 1px solid #333;
      color: #b8954a; font-size: 11px; font-family: 'DM Sans', sans-serif;
      padding: 2px 0; outline: none; margin-top: 4px; text-align: right;
    }
    .summary-manual-input:focus { border-bottom-color: #b8954a; }
    .summary-manual-input::placeholder { color: #444; }
    .summary-manual-hint { font-size: 9px; color: #555; margin-top: 2px; letter-spacing: 0.05em; }
    .summary-divider { border: none; border-top: 1px solid #2a2a2a; margin: 16px 0; }
    .summary-total-label { font-size: 11px; color: #888; letter-spacing: 0.15em; }
    .summary-total-val { font-family: 'Playfair Display', serif; font-size: 28px; color: #b8954a; font-weight: 600; }

    .action-row { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
    .autosave-hint { font-size: 11px; color: #bbb; align-self: center; }
  `

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-icon">⚠️</div>
            <div className="modal-title">직원 삭제</div>
            <div className="modal-desc">
              <span className="modal-emp-name">
                {employees.find(e => e.id === deleteConfirm)?.name || '이름 미입력'}
              </span>
              의 데이터를 삭제하시겠습니까?<br />
              삭제된 데이터는 복구할 수 없습니다.
            </div>
            <div className="modal-btns">
              <button className="btn outline" onClick={() => setDeleteConfirm(null)}>취소</button>
              <button className="btn danger" onClick={doDelete}>삭제하기</button>
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

          {/* STEP 1: 지점 선택 */}
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

          {/* STEP 2: 로그인 */}
          {step === 'login' && (
            <div className="login-wrap">
              <div className="login-box">
                <div className="login-branch">{selectedBranch?.name}</div>
                <h2 className="login-title">매니저 로그인</h2>
                <p className="field-label">비밀번호</p>
                <input type="password" className="text-input" placeholder="비밀번호 입력"
                  value={pw} onChange={e => setPw(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') pw === selectedBranch.password ? (setStep('main'), setPwError(false)) : setPwError(true)
                  }}
                />
                {pwError && <p className="error-msg">비밀번호가 틀렸습니다.</p>}
                <button className="btn full" onClick={() => pw === selectedBranch.password ? (setStep('main'), setPwError(false)) : setPwError(true)}>입장</button>
                <br /><br />
                <button className="btn outline full" onClick={() => setStep('branch')}>← 지점 재선택</button>
              </div>
            </div>
          )}

          {/* STEP 3: 급여 계산 */}
          {step === 'main' && activeEmp && (
            <div>
              <div className="section-header">
                <div>
                  <div className="section-title">{selectedBranch?.name} 급여 계산</div>
                  <div className="section-sub">근무시간을 입력하면 급여가 자동으로 계산됩니다</div>
                </div>
                {/* ── 수정 #8: 지점변경 버튼 옆에 엑셀 다운로드 버튼 ── */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={downloadExcelSingle}
                    disabled={!activeEmp?.name}
                    style={{
                      padding: '8px 16px',
                      background: !activeEmp?.name ? '#f0ede8' : '#1a1a1a',
                      color: !activeEmp?.name ? '#ccc' : '#fff',
                      border: 'none', borderRadius: 8,
                      fontSize: 13, fontWeight: 600,
                      cursor: !activeEmp?.name ? 'not-allowed' : 'pointer',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >엑셀 다운로드 ↓</button>
                  <button className="btn outline" onClick={handleBranchChange}>← 지점 변경</button>
                </div>
              </div>

              {/* 직원 탭 */}
              <div className="emp-tabs">
                {employees.map(emp => (
                  <div key={emp.id} className={`emp-tab${emp.id === activeEmpId ? ' active' : ''}`} onClick={() => handleTabSwitch(emp.id)}>
                    {emp.name || '이름 미입력'}
                    {employees.length > 1 && (
                      <span className="emp-tab-del" onClick={e => { e.stopPropagation(); confirmDelete(emp.id) }}>×</span>
                    )}
                  </div>
                ))}
                <div className="emp-tab-add" onClick={addEmployee} title="직원 추가">＋</div>
              </div>

              {/* ── 수정 #6: 직원/알바 탭 (이름 입력 위) ── */}
              <div style={{ marginBottom: 8 }}>
                <div className="field-label" style={{ marginBottom: 6 }}>구분</div>
                <div className="emp-type-tabs">
                  <button
                    className={`emp-type-tab${activeEmp.empType === '직원' ? ' active' : ''}`}
                    onClick={() => updateEmp('empType', '직원')}
                  >직원</button>
                  <button
                    className={`emp-type-tab${(activeEmp.empType === '알바' || !activeEmp.empType) ? ' active' : ''}`}
                    onClick={() => updateEmp('empType', '알바')}
                  >알바</button>
                </div>
              </div>

              {/* 직원 정보 1행 */}
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
                {/* ── 수정 A: 1행 4번째 → 기본 근무 시간 (계좌번호와 위치 교환) ── */}
                <div className="info-card">
                  <div className="info-card-label">기본 근무 시간</div>
                  <div className="time-range">
                    <input
                      value={activeEmp.defaultTimeStart}
                      onChange={e => updateEmp('defaultTimeStart', e.target.value)}
                      onBlur={e => handleDefaultTimeBlur('defaultTimeStart', e.target.value)}
                      placeholder="00:00"
                    />
                    <span className="time-sep">~</span>
                    <input
                      value={activeEmp.defaultTimeEnd}
                      onChange={e => updateEmp('defaultTimeEnd', e.target.value)}
                      onBlur={e => handleDefaultTimeBlur('defaultTimeEnd', e.target.value)}
                      placeholder="00:00"
                    />
                  </div>
                </div>
              </div>

              {/* 직원 정보 2행 */}
              <div className="info-grid-2">
                {/* ── 수정 A: 2행 1번째 → 계좌번호 (기본 근무 시간과 위치 교환) ── */}
                <div className="info-card">
                  <div className="info-card-label">계좌번호</div>
                  <input
                    value={activeEmp.accountNumber || ''}
                    onChange={e => updateEmp('accountNumber', e.target.value)}
                    placeholder="은행 및 계좌번호 입력"
                  />
                </div>
                <div className="info-card">
                  <div className="info-card-label">핸드폰 번호</div>
                  <input value={activeEmp.phone} onChange={e => updateEmp('phone', e.target.value)} placeholder="010-0000-0000" />
                </div>
                <div className="info-card">
                  <div className="info-card-label">이메일</div>
                  <input value={activeEmp.email} onChange={e => updateEmp('email', e.target.value)} placeholder="example@email.com" />
                </div>
                {/* ── 월/연도 변경 ── */}
                <div className="info-card" style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div className="info-card-label">연도</div>
                    <input
                      type="number"
                      value={activeEmp.year}
                      onChange={e => handleYearChange(Number(e.target.value))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="info-card-label">월</div>
                    <select
                      value={activeEmp.month}
                      onChange={e => handleMonthChange(Number(e.target.value))}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* 특이사항 */}
              <div className="note-row">
                <p className="field-label" style={{ marginBottom: 8 }}>이달의 특이사항</p>
                <input
                  className="note-input"
                  value={activeEmp.specialNote}
                  onChange={e => updateEmp('specialNote', e.target.value)}
                  placeholder="예) 11월 야간 추가 5시간"
                />
              </div>

              {/* 달력 */}
              <div className="cal-wrap">
                <div className="cal-week-header">
                  <div className="cal-week-th">주</div>
                  {DAY_LABELS.map((d) => (
                    <div key={d} className="cal-week-th"
                      style={d==='일' ? { color:'#e05555' } : d==='토' ? { color:'#4a90d9' } : {}}
                    >{d}</div>
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
                          const type = d.type || '평'
                          const isHolidayWork = type === '휴'
                          const isDayOff = type === '공'

                          // ── 수정 #2: 임시 입력 상태 우선 표시 ──
                          const tStart = timeInputs[ds]?.start !== undefined ? timeInputs[ds].start : (d.timeStart !== undefined ? d.timeStart : activeEmp.defaultTimeStart)
                          const tEnd   = timeInputs[ds]?.end   !== undefined ? timeInputs[ds].end   : (d.timeEnd   !== undefined ? d.timeEnd   : activeEmp.defaultTimeEnd)

                          return (
                            <div key={di} className={`day-cell ${isHolidayWork ? 'is-holiday' : ''} ${isDayOff ? 'is-off' : ''}`}>
                              <div
                                className={`day-date ${isHolidayWork ? 'holiday-type' : ''} ${isDayOff ? 'off-type' : ''}`}
                                onClick={() => toggleDayType(ds)}
                                title="클릭: 평일/휴일근로/휴무 전환"
                              >{day}</div>

                              {isDayOff ? (
                                <div className="off-text">휴무</div>
                              ) : (
                                <>
                                  {/* 시간 입력 행 */}
                                  <div className="time-row">
                                    <input
                                      className="time-input-small"
                                      value={tStart}
                                      onChange={e => handleTimeChange(ds, 'timeStart', e.target.value)}
                                      onFocus={e => e.target.select()}
                                      onBlur={e => handleTimeBlur(ds, 'timeStart', e.target.value)}
                                      placeholder="00:00"
                                    />
                                    <span className="time-tilde">~</span>
                                    <input
                                      className="time-input-small"
                                      value={tEnd}
                                      onChange={e => handleTimeChange(ds, 'timeEnd', e.target.value)}
                                      onFocus={e => e.target.select()}
                                      onBlur={e => handleTimeBlur(ds, 'timeEnd', e.target.value)}
                                      placeholder="00:00"
                                    />
                                  </div>

                                  {/* ── 수정 #3: 평일 4칸 (기본/휴게/야간/연장), 휴일 4칸 ── */}
                                  {!isHolidayWork ? (
                                    <>
                                      <div className="hour-label">기본</div>
                                      {numInput(d.basicH, v => updateWorkDay(ds, 'basicH', v))}
                                      <div className="hour-label">휴게</div>
                                      {numInput(d.restH, v => updateWorkDay(ds, 'restH', v))}
                                      <div className="hour-label">야간</div>
                                      {numInput(d.nightH, v => updateWorkDay(ds, 'nightH', v))}
                                      <div className="hour-label">연장</div>
                                      {numInput(d.overtimeH, v => updateWorkDay(ds, 'overtimeH', v))}
                                    </>
                                  ) : (
                                    <>
                                      <div className="hour-label" style={{color:'#e05555'}}>휴일근로</div>
                                      {numInput(d.holidayH, v => updateWorkDay(ds, 'holidayH', v))}
                                      <div className="hour-label" style={{color:'#e05555'}}>휴일휴게</div>
                                      {numInput(d.holidayRestH, v => updateWorkDay(ds, 'holidayRestH', v))}
                                      <div className="hour-label" style={{color:'#e05555'}}>휴일야간</div>
                                      {numInput(d.holidayNightH, v => updateWorkDay(ds, 'holidayNightH', v))}
                                      <div className="hour-label" style={{color:'#e05555'}}>휴일연장</div>
                                      {numInput(d.holidayOtH, v => updateWorkDay(ds, 'holidayOtH', v))}
                                    </>
                                  )}
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

              {/* ── 수정 #5: 급여 합계 (수동 입력 + 자동계산 합산) ── */}
              {totals && (
                <div className="summary-card">
                  <div className="summary-title">급여 내역 — 고정값 직접 입력 가능 (캘린더 자동계산액이 더해집니다)</div>
                  <div className="summary-grid">
                    {[
                      { label: '기본수당',  total: totals.totalBasic,          manualKey: 'manualBasic' },
                      { label: '주휴수당',  total: totals.totalWeeklyHoliday,  manualKey: 'manualWeeklyHoliday' },
                      { label: '연장수당',  total: totals.totalOvertime,       manualKey: 'manualOvertime' },
                      { label: '야간수당',  total: totals.totalNight,          manualKey: 'manualNight' },
                      { label: '휴일근로',  total: totals.totalHoliday,        manualKey: 'manualHoliday' },
                      { label: '휴일연장',  total: totals.totalHolidayOtPay,   manualKey: 'manualHolidayOt' },
                      { label: '휴일야간',  total: totals.totalHolidayNightPay, manualKey: 'manualHolidayNight' },
                    ].map(({ label, total, manualKey }) => (
                      <div key={label}>
                        <div className="summary-item-label">{label}</div>
                        <div className="summary-item-val">{fmt(total)}</div>
                        <input
                          type="number"
                          className="summary-manual-input"
                          value={activeEmp[manualKey] || ''}
                          placeholder="고정값 입력"
                          onChange={e => updateEmp(manualKey, parseFloat(e.target.value) || 0)}
                        />
                        <div className="summary-manual-hint">고정 + 자동계산</div>
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

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  className="btn outline"
                  onClick={() => handleManualSave('saved')}
                  style={{ flex: 1, padding: '18px', fontSize: '14px', cursor: 'pointer' }}
                >
                  💾 임시 저장하기
                </button>
                <button
                  className="btn accent"
                  onClick={() => handleManualSave('final')}
                  style={{ flex: 1, padding: '18px', fontSize: '14px', background: '#1a1a1a', color: '#fff', cursor: 'pointer' }}
                >
                  ✅ 최종 마감하기
                </button>
              </div>

              <div style={{ textAlign: 'center', marginTop: '15px' }}>
                <span className="autosave-hint">※ 입력 시 자동 저장은 '진행 중' 상태로 저장됩니다.</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button className="btn outline" style={{ padding: '6px 12px', fontSize: '11px', opacity: 0.5 }} onClick={() => {
                  if (confirm('이 직원의 근무 데이터를 초기화할까요?')) {
                    setEmployees(prev => prev.map(e => e.id === activeEmpId ? { ...e, workData: {}, specialNote: '' } : e))
                  }
                }}>데이터 초기화</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  )
}
