import { getToken } from './auth.js'

const BASE = import.meta.env.VITE_API_URL
const auth = () => ({ Authorization: `Bearer ${getToken()}` })

export async function kirimSurvei(s) {
  const r = await fetch(`${BASE}/surveys/${s.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...auth() },
    body: JSON.stringify(s)
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
}

export async function kirimFoto(surveyId, tipe, blob) {
  const fd = new FormData()
  fd.append('file', blob, `${tipe}.jpg`)
  const r = await fetch(`${BASE}/surveys/${surveyId}/photos/${tipe}`,
    { method: 'PUT', headers: auth(), body: fd })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
}
