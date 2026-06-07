import { supabase } from '../../lib/supabase'

// ── 재고 입출고(변동) 처리 + 변동 이력 ──
// POST /api/inventory-tx
//   body: { item_id, type: '입고'|'사용'|'조정', qty, memo, actor }
//   - '입고' : 현재고 += qty
//   - '사용' : 현재고 -= qty
//   - '조정' : 현재고 = qty (실사 보정 — qty를 새 현재고로 덮어씀)
//   현재고를 갱신하고 inventory_logs 에 변동 1건 기록한다.
// GET  /api/inventory-tx?branch=...&limit=... → 그 지점 변동 이력
export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { item_id, type, qty, memo, actor } = req.body || {}
    if (!item_id || !type) return res.status(400).json({ error: 'item_id와 type이 필요합니다.' })

    // 현재 품목 조회
    const { data: item, error: e1 } = await supabase
      .from('inventory_items').select('*').eq('id', item_id).single()
    if (e1 || !item) return res.status(404).json({ error: '품목을 찾을 수 없습니다.' })

    const amount = Number(qty) || 0
    const prev = Number(item.current_qty) || 0
    let next = prev
    let delta = 0
    if (type === '입고') { next = prev + amount; delta = amount }
    else if (type === '사용') { next = prev - amount; delta = -amount }
    else if (type === '조정') { next = amount; delta = amount - prev }
    else return res.status(400).json({ error: '알 수 없는 type 입니다.' })

    // 현재고 갱신
    const { data: updated, error: e2 } = await supabase
      .from('inventory_items')
      .update({ current_qty: next, updated_at: new Date().toISOString() })
      .eq('id', item_id).select().single()
    if (e2) return res.status(500).json({ error: e2.message })

    // 변동 이력 기록 (실패해도 본 동작은 성공 처리)
    const logRow = {
      branch: item.branch,
      item_id: item.id,
      item_name: item.name,
      type,
      qty: delta,
      result_qty: next,
      memo: memo || '',
      actor: actor || '',
    }
    const { error: e3 } = await supabase.from('inventory_logs').insert(logRow)
    if (e3) console.warn('inventory_logs insert skipped:', e3.message)

    return res.status(200).json({ success: true, item: updated })
  }

  if (req.method === 'GET') {
    const { branch, item_id, limit } = req.query
    let q = supabase
      .from('inventory_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(limit) || 100)
    if (branch) q = q.eq('branch', branch)
    if (item_id) q = q.eq('item_id', item_id)
    const { data, error } = await q
    if (error) return res.status(200).json({ logs: [], unavailable: true })
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ logs: data || [] })
  }

  return res.status(405).end()
}
