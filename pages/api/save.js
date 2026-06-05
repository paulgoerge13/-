import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    branch, emp_name, emp_type,
    resident_id, phone, email,
    account_number,
    hourly_wage,
    scheduled_hours,
    default_time,
    year, month,
    work_data,
    special_note,
    status,
    totalBasic,
    totalWeeklyHoliday,
    totalOvertime,
    totalNight,
    totalHoliday,
    totalHolidayOtPay,
    totalHolidayNightPay,
    grandTotal,
    // ── 여러 기기 공유용 고정 설정 (DB 컬럼 추가분) ──
    hire_date,
    resign_date,
    birth_date,
    deduction_type,
    income_tax,
    meal_allowance,
  } = req.body

  if (!branch || !emp_name) {
    return res.status(400).json({ error: '지점과 직원 이름은 필수입니다.' })
  }

  const baseData = {
    branch,
    emp_name,
    emp_type:             emp_type || '알바',
    resident_id:          resident_id || '',
    phone:                phone || '',
    email:                email || '',
    account_number:       account_number || '',
    hourly_wage:          Number(hourly_wage) || 0,
    scheduled_hours:      Number(scheduled_hours) || 8,
    default_time:         default_time || '',
    year:                 Number(year),
    month:                Number(month),
    work_data:            work_data || {},
    special_note:         special_note || '',
    status:               status || 'saved',
    basic_pay:            Number(totalBasic) || 0,
    weekly_holiday_pay:   Number(totalWeeklyHoliday) || 0,
    overtime_pay:         Number(totalOvertime) || 0,
    night_pay:            Number(totalNight) || 0,
    holiday_pay:          Number(totalHoliday) || 0,
    holiday_overtime_pay: Number(totalHolidayOtPay) || 0,
    holiday_night_pay:    Number(totalHolidayNightPay) || 0,
    grand_total:          Number(grandTotal) || 0,
    updated_at:           new Date().toISOString(),
  }

  // 새 컬럼(고정 설정). DB에 아직 컬럼이 없으면(마이그레이션 전) 자동으로 빼고 재시도한다.
  const extraData = {
    hire_date:      hire_date || '',
    resign_date:    resign_date || '',
    birth_date:     birth_date || '',
    deduction_type: deduction_type || 'none',
    income_tax:     Number(income_tax) || 0,
    meal_allowance: Number(meal_allowance) || 0,
  }

  const opts = { onConflict: 'branch,emp_name,year,month' }
  let { data, error } = await supabase
    .from('payroll')
    .upsert({ ...baseData, ...extraData }, opts)
    .select()
    .single()

  // 컬럼이 아직 없을 때(마이그레이션 전) → 새 필드 제외하고 재시도해 저장은 깨지지 않게 함
  if (error && /column|schema cache|could not find/i.test(`${error.message} ${error.details || ''}`)) {
    console.warn('새 컬럼 미존재 → 기본 필드만 저장:', error.message)
    ;({ data, error } = await supabase
      .from('payroll')
      .upsert(baseData, opts)
      .select()
      .single())
  }

  if (error) {
    console.error('Supabase upsert error:', error)
    return res.status(500).json({ error: error.message, details: error.details, hint: error.hint })
  }

  return res.status(200).json({ success: true, data })
}
