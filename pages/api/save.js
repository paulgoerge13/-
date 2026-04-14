import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    branch, emp_name, emp_type,           // ── 수정 #6: emp_type 추가 ──
    resident_id, phone, email,
    account_number,                        // ── 수정 #1: 계좌번호 추가 ──
    hourly_wage, default_time,
    year, month, work_data, special_note,
    status,
    totalBasic, totalWeeklyHoliday, totalOvertime, totalNight,
    totalHoliday, totalHolidayOtPay, totalHolidayNightPay, grandTotal
  } = req.body

  if (!branch || !emp_name) {
    return res.status(400).json({ error: '지점과 직원 이름은 필수입니다.' })
  }

  const { data, error } = await supabase
    .from('payroll')
    .upsert({
      branch,
      emp_name,
      emp_type: emp_type || '알바',        // ── 수정 #6 ──
      resident_id,
      phone,
      email,
      account_number,                      // ── 수정 #1 ──
      hourly_wage,
      default_time,
      year,
      month,
      work_data,
      special_note,
      status: status || 'saved',
      basic_pay: totalBasic,
      weekly_holiday_pay: totalWeeklyHoliday,
      overtime_pay: totalOvertime,
      night_pay: totalNight,
      holiday_pay: totalHoliday,
      holiday_overtime_pay: totalHolidayOtPay,
      holiday_night_pay: totalHolidayNightPay,
      grand_total: grandTotal,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'branch,emp_name,year,month' })
    .select().single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ success: true, data })
}
