import { supabase } from '../../lib/supabase'

// ── 재고 품목 CRUD ──
// GET    /api/inventory?branch=...        → 그 지점 품목 목록
// POST   /api/inventory                   → 품목 추가  { branch, name, unit, min_qty, current_qty, category, memo }
// PATCH  /api/inventory                   → 품목 수정  { id, ...fields }
// DELETE /api/inventory?id=...            → 품목 삭제
// 테이블이 아직 없으면(마이그레이션 전) 조용히 빈 목록/안내 플래그 반환.
export default async function handler(req, res) {
  // ── 목록 조회 ──
  if (req.method === 'GET') {
    const { branch } = req.query
    if (!branch) return res.status(400).json({ error: 'branch가 필요합니다.' })
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('branch', branch)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) return res.status(200).json({ items: [], unavailable: true })
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ items: data || [] })
  }

  // ── 품목 추가 ──
  if (req.method === 'POST') {
    const { branch, name, unit, category, current_qty, min_qty, memo } = req.body || {}
    if (!branch || !name) return res.status(400).json({ error: '지점과 품목명은 필수입니다.' })
    const row = {
      branch,
      name: String(name).trim(),
      unit: unit || '개',
      category: category || '',
      current_qty: Number(current_qty) || 0,
      min_qty: Number(min_qty) || 0,
      memo: memo || '',
    }
    const { data, error } = await supabase.from('inventory_items').insert(row).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true, item: data })
  }

  // ── 품목 수정 ──
  if (req.method === 'PATCH') {
    const { id, ...fields } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id가 필요합니다.' })
    const allowed = ['name', 'unit', 'category', 'current_qty', 'min_qty', 'memo', 'sort_order']
    const patch = { updated_at: new Date().toISOString() }
    for (const k of allowed) {
      if (fields[k] !== undefined) {
        patch[k] = (k === 'current_qty' || k === 'min_qty' || k === 'sort_order') ? Number(fields[k]) || 0 : fields[k]
      }
    }
    const { data, error } = await supabase.from('inventory_items').update(patch).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true, item: data })
  }

  // ── 품목 삭제 ──
  if (req.method === 'DELETE') {
    const id = req.query.id || (req.body && req.body.id)
    if (!id) return res.status(400).json({ error: 'id가 필요합니다.' })
    const { error } = await supabase.from('inventory_items').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(405).end()
}
