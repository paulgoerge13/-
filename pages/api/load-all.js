import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { branch, year, month } = req.query

  if (!branch || !year || !month) {
    return res.status(400).json({ error: '파라미터 누락' })
  }

  const { data, error } = await supabase
    .from('payroll')
    .select('*')
    .eq('branch', branch)
    .eq('year', Number(year))
    .eq('month', Number(month))
    .order('emp_name', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  return res.status(200).json({ success: true, data: data || [] })
}
