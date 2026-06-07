import { useState, useEffect } from 'react'

// ── 지점별 재고 관리 (재사용 컴포넌트) ──
// props: branch(지점명, 필수), actor(기록자, 선택)
// 데이터는 /api/inventory, /api/inventory-tx 를 통해 Supabase 에 저장.
export default function BranchInventory({ branch, actor }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  // 품목 추가 폼
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', unit: '개', current_qty: '', min_qty: '', memo: '' })

  // 품목 수정 (인라인)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})

  // 입출고 모달
  const [move, setMove] = useState(null) // { item, type } type: '입고'|'사용'|'조정'
  const [moveQty, setMoveQty] = useState('')
  const [moveMemo, setMoveMemo] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/inventory?branch=${encodeURIComponent(branch)}`)
      const data = await res.json()
      if (data.unavailable) { setUnavailable(true); setItems([]) }
      else { setUnavailable(false); setItems(data.items || []) }
    } catch (e) { setItems([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (branch) load() }, [branch])

  const fmt = n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('ko-KR')
  const isLow = it => Number(it.current_qty) <= Number(it.min_qty)
  const lowItems = items.filter(isLow)

  async function addItem() {
    if (!form.name.trim()) { alert('품목명을 입력하세요.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, ...form }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || '추가 실패')
      setForm({ name: '', unit: '개', current_qty: '', min_qty: '', memo: '' })
      setShowAdd(false)
      load()
    } catch (e) { alert(e.message) }
    finally { setBusy(false) }
  }

  function startEdit(it) {
    setEditId(it.id)
    setEditForm({ name: it.name, unit: it.unit, min_qty: it.min_qty, memo: it.memo || '' })
  }
  async function saveEdit(id) {
    setBusy(true)
    try {
      const res = await fetch('/api/inventory', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editForm }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || '수정 실패')
      setEditId(null)
      load()
    } catch (e) { alert(e.message) }
    finally { setBusy(false) }
  }
  async function delItem(it) {
    if (!confirm(`'${it.name}' 품목을 삭제할까요?`)) return
    setBusy(true)
    try {
      await fetch(`/api/inventory?id=${it.id}`, { method: 'DELETE' })
      load()
    } catch (e) { alert('삭제 실패') }
    finally { setBusy(false) }
  }

  function openMove(item, type) {
    setMove({ item, type })
    setMoveQty(type === '조정' ? String(item.current_qty) : '')
    setMoveMemo('')
  }
  async function submitMove() {
    const q = Number(moveQty)
    if (isNaN(q) || (move.type !== '조정' && q <= 0)) { alert('수량을 올바르게 입력하세요.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/inventory-tx', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: move.item.id, type: move.type, qty: q, memo: moveMemo, actor: actor || branch }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || '처리 실패')
      setMove(null)
      load()
    } catch (e) { alert(e.message) }
    finally { setBusy(false) }
  }

  const css = `
    .inv-wrap { font-family: 'Pretendard', 'DM Sans', sans-serif; color: #1a1a1a; }
    .inv-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .inv-title { font-size: 20px; font-weight: 700; }
    .inv-sub { font-size: 12.5px; color: #9a9286; margin-top: 3px; }
    .inv-add-btn { padding: 9px 18px; background: #1a1a1a; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; letter-spacing: 0.03em; }
    .inv-add-btn:hover { background: #333; }

    .inv-summary { display: flex; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
    .inv-stat { flex: 1; min-width: 120px; background: #fff; border: 1px solid #e6e3dd; border-radius: 12px; padding: 14px 18px; }
    .inv-stat-label { font-size: 11.5px; color: #9a9286; margin-bottom: 6px; }
    .inv-stat-value { font-size: 24px; font-weight: 700; }
    .inv-stat.low .inv-stat-value { color: #d9534f; }

    .inv-addbox { background: #fbf9f5; border: 1px solid #e8e2d6; border-radius: 12px; padding: 16px; margin-bottom: 18px; }
    .inv-addrow { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; }
    .inv-fld { display: flex; flex-direction: column; gap: 4px; }
    .inv-fld label { font-size: 11px; color: #8a8276; font-weight: 600; }
    .inv-input { background: #fff; border: 1.5px solid #d0ccc5; border-radius: 8px; padding: 9px 11px; font-size: 13px; font-family: inherit; outline: none; }
    .inv-input:focus { border-color: #b8954a; }
    .inv-input.w-name { width: 150px; }
    .inv-input.w-unit { width: 70px; }
    .inv-input.w-num { width: 90px; }
    .inv-input.w-memo { width: 130px; }
    .inv-save-btn { padding: 9px 16px; background: #b8954a; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
    .inv-cancel-btn { padding: 9px 14px; background: #fff; color: #777; border: 1px solid #d0ccc5; border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; }

    .inv-table-wrap { background: #fff; border: 1px solid #e6e3dd; border-radius: 14px; overflow: hidden; }
    .inv-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    .inv-table th { text-align: left; padding: 12px 14px; font-size: 11.5px; font-weight: 600; color: #9a9286; border-bottom: 1px solid #efece6; white-space: nowrap; background: #faf9f6; }
    .inv-table th.r, .inv-table td.r { text-align: right; }
    .inv-table th.c, .inv-table td.c { text-align: center; }
    .inv-table td { padding: 11px 14px; border-bottom: 1px solid #f4f1ec; vertical-align: middle; }
    .inv-table tr:last-child td { border-bottom: none; }
    .inv-table tr.low td { background: #fdf3f2; }
    .inv-name { font-weight: 600; }
    .inv-qty { font-weight: 700; font-size: 15px; font-variant-numeric: tabular-nums; }
    .inv-qty.low { color: #d9534f; }
    .inv-unit { color: #9a9286; font-size: 12px; }
    .inv-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
    .inv-badge.ok { background: #eaf3ec; color: #3f8a57; }
    .inv-badge.low { background: #fbe9e7; color: #c0564a; }
    .inv-actions { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap; }
    .inv-mini { padding: 5px 10px; border-radius: 7px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; font-family: inherit; white-space: nowrap; }
    .inv-mini.in { background: #eaf3ec; color: #3f8a57; }
    .inv-mini.out { background: #fbe9e7; color: #c0564a; }
    .inv-mini.adj { background: #f0ede8; color: #6a6258; }
    .inv-mini.edit { background: #fff; color: #8a8276; border-color: #e0ddd6; }
    .inv-mini:hover { filter: brightness(0.96); }

    .inv-empty { padding: 48px 20px; text-align: center; color: #a89e90; font-size: 14px; }
    .inv-empty b { color: #777; }
    .inv-sql { display: inline-block; margin-top: 10px; font-size: 12px; color: #b8954a; }

    .inv-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
    .inv-modal { background: #fff; border-radius: 16px; padding: 24px; width: 100%; max-width: 340px; }
    .inv-modal-title { font-size: 17px; font-weight: 700; margin-bottom: 4px; }
    .inv-modal-sub { font-size: 12.5px; color: #9a9286; margin-bottom: 18px; }
    .inv-modal .inv-input { width: 100%; margin-bottom: 12px; font-size: 15px; }
    .inv-modal-btns { display: flex; gap: 8px; margin-top: 4px; }
    .inv-modal-btns button { flex: 1; padding: 12px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; border: none; }
    .inv-modal-go { background: #1a1a1a; color: #fff; }
    .inv-modal-cancel { background: #f0ede8; color: #777; }

    @media (max-width: 600px) {
      .inv-table th, .inv-table td { padding: 9px 8px; font-size: 12.5px; }
      .inv-input.w-name { width: 110px; }
      .inv-input.w-memo { width: 100px; }
    }
  `

  return (
    <div className="inv-wrap">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="inv-head">
        <div>
          <div className="inv-title">{branch} 재고 관리</div>
          <div className="inv-sub">품목별 현재고를 관리하고, 최소재고 아래로 떨어지면 빨간색으로 표시됩니다.</div>
        </div>
        <button className="inv-add-btn" onClick={() => setShowAdd(s => !s)}>{showAdd ? '닫기' : '+ 품목 추가'}</button>
      </div>

      {/* 요약 */}
      <div className="inv-summary">
        <div className="inv-stat">
          <div className="inv-stat-label">전체 품목</div>
          <div className="inv-stat-value">{items.length}</div>
        </div>
        <div className={`inv-stat${lowItems.length > 0 ? ' low' : ''}`}>
          <div className="inv-stat-label">부족 품목</div>
          <div className="inv-stat-value">{lowItems.length}</div>
        </div>
      </div>

      {/* 품목 추가 폼 */}
      {showAdd && (
        <div className="inv-addbox">
          <div className="inv-addrow">
            <div className="inv-fld">
              <label>품목명 *</label>
              <input className="inv-input w-name" value={form.name} placeholder="예: 원두"
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="inv-fld">
              <label>단위</label>
              <input className="inv-input w-unit" value={form.unit} placeholder="개"
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
            </div>
            <div className="inv-fld">
              <label>현재고</label>
              <input className="inv-input w-num" type="number" value={form.current_qty} placeholder="0"
                onChange={e => setForm(f => ({ ...f, current_qty: e.target.value }))} />
            </div>
            <div className="inv-fld">
              <label>최소재고</label>
              <input className="inv-input w-num" type="number" value={form.min_qty} placeholder="0"
                onChange={e => setForm(f => ({ ...f, min_qty: e.target.value }))} />
            </div>
            <div className="inv-fld">
              <label>비고(거래처 등)</label>
              <input className="inv-input w-memo" value={form.memo} placeholder=""
                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
            </div>
            <button className="inv-save-btn" onClick={addItem} disabled={busy}>{busy ? '저장 중…' : '추가'}</button>
          </div>
        </div>
      )}

      {/* 목록 */}
      <div className="inv-table-wrap">
        {loading ? (
          <div className="inv-empty">불러오는 중…</div>
        ) : unavailable ? (
          <div className="inv-empty">
            <b>재고 테이블이 아직 준비되지 않았습니다.</b><br />
            Supabase에 inventory 테이블을 1회 생성하면 사용할 수 있어요.
            <span className="inv-sql">(inventory-schema.sql 실행 필요)</span>
          </div>
        ) : items.length === 0 ? (
          <div className="inv-empty">아직 등록된 품목이 없습니다. <b>+ 품목 추가</b>로 시작하세요.</div>
        ) : (
          <table className="inv-table">
            <thead>
              <tr>
                <th>품목명</th>
                <th className="r">현재고</th>
                <th className="r">최소재고</th>
                <th className="c">상태</th>
                <th className="r">관리</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => editId === it.id ? (
                <tr key={it.id}>
                  <td>
                    <input className="inv-input w-name" value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                  </td>
                  <td className="r"><span className="inv-qty">{fmt(it.current_qty)}</span></td>
                  <td className="r">
                    <input className="inv-input w-num" type="number" value={editForm.min_qty}
                      onChange={e => setEditForm(f => ({ ...f, min_qty: e.target.value }))} />
                  </td>
                  <td className="c">
                    <input className="inv-input w-unit" value={editForm.unit}
                      onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} />
                  </td>
                  <td className="r">
                    <div className="inv-actions">
                      <button className="inv-mini in" onClick={() => saveEdit(it.id)} disabled={busy}>저장</button>
                      <button className="inv-mini edit" onClick={() => setEditId(null)}>취소</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={it.id} className={isLow(it) ? 'low' : ''}>
                  <td>
                    <span className="inv-name">{it.name}</span>
                    {it.memo ? <span className="inv-unit"> · {it.memo}</span> : null}
                  </td>
                  <td className="r">
                    <span className={`inv-qty${isLow(it) ? ' low' : ''}`}>{fmt(it.current_qty)}</span>
                    <span className="inv-unit"> {it.unit}</span>
                  </td>
                  <td className="r"><span className="inv-unit">{fmt(it.min_qty)} {it.unit}</span></td>
                  <td className="c">
                    <span className={`inv-badge ${isLow(it) ? 'low' : 'ok'}`}>{isLow(it) ? '부족' : '정상'}</span>
                  </td>
                  <td className="r">
                    <div className="inv-actions">
                      <button className="inv-mini in" onClick={() => openMove(it, '입고')}>+입고</button>
                      <button className="inv-mini out" onClick={() => openMove(it, '사용')}>−사용</button>
                      <button className="inv-mini adj" onClick={() => openMove(it, '조정')}>조정</button>
                      <button className="inv-mini edit" onClick={() => startEdit(it)}>수정</button>
                      <button className="inv-mini edit" onClick={() => delItem(it)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 입출고 모달 */}
      {move && (
        <div className="inv-overlay" onClick={() => setMove(null)}>
          <div className="inv-modal" onClick={e => e.stopPropagation()}>
            <div className="inv-modal-title">{move.item.name} · {move.type}</div>
            <div className="inv-modal-sub">
              현재고 {fmt(move.item.current_qty)} {move.item.unit}
              {move.type === '조정' ? ' → 실제 수량을 입력하세요' : move.type === '입고' ? ' → 들어온 수량' : ' → 사용한 수량'}
            </div>
            <input className="inv-input" type="number" autoFocus value={moveQty}
              placeholder={move.type === '조정' ? '실제 현재 수량' : '수량'}
              onChange={e => setMoveQty(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitMove()} />
            <input className="inv-input" value={moveMemo} placeholder="메모 (선택)"
              onChange={e => setMoveMemo(e.target.value)} />
            <div className="inv-modal-btns">
              <button className="inv-modal-cancel" onClick={() => setMove(null)}>취소</button>
              <button className="inv-modal-go" onClick={submitMove} disabled={busy}>{busy ? '처리 중…' : '확인'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
