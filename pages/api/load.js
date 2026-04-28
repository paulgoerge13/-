import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { branch, name, year, month } = req.query

  if (!branch || !name || !year || !month) {
    return res.status(400).json({ error: '파라미터 누락' })
  }

  const { data, error } = await supabase
    .from('payroll')
    .select('*')
    .eq('branch', branch)
    .eq('emp_name', name)
    .eq('year', Number(year))
    .eq('month', Number(month))
    .single()

  if (error && error.code !== 'PGRST116') {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ success: true, data: data || null })
}
