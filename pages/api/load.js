// pages/api/load.js 내용
import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  const { branch, name, year, month } = req.query;
  const { data, error } = await supabase
    .from('payroll')
    .select('*')
    .eq('branch', branch)
    .eq('emp_name', name)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true, data });
}
