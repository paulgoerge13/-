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
  } = req.body

  if (!branch || !emp_name) {
    return res.status(400).json({ error: '지점과 직원 이름은 필수입니다.' })
  }

  const upsertData = {
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

  const { data, error } = await supabase
    .from('payroll')
    .upsert(upsertData, { onConflict: 'branch,emp_name,year,month' })
    .select()
    .single()

  if (error) {
    console.error('Supabase upsert error:', error)
    return res.status(500).json({ error: error.message, details: error.details, hint: error.hint })
  }

  return res.status(200).json({ success: true, data })
}
