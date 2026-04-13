import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    branch, emp_name, resident_id, phone, email,
    hourly_wage, scheduled_hours, default_time,
    year, month, work_data, special_note,
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
      resident_id,
      phone,
      email,
      hourly_wage,
      scheduled_hours,
      default_time,
      year,
      month,
      work_data,
      special_note,
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
