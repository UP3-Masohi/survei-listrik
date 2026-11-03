import L from 'leaflet'
import { ambilDaftarSurvei, ambilUrlFoto } from './api.js'
import { ikon, tampilkanNotifikasi } from './main.js'
import { formatTanggal } from './form.js'
import { tingkatAkurasi } from './geo.js'

// Dasbor admin: ringkasan, peta sebaran, tabel, detail survei beserta foto, ekspor CSV.
// Data diambil dari GET /surveys (butuh role admin) dan tidak disimpan di HP.

const WARNA_DAYA = [
  { maks: 900, warna: '#15803d', label: '≤ 900 VA' },
  { maks: 2200, warna: '#0b5ed7', label: '1.300–2.200 VA' },
  { maks: Infinity, warna: '#d97706', label: '≥ 3.500 VA' }
]
const warnaDaya = (va) => (WARNA_DAYA.find(w => (va ?? 0) <= w.maks) ?? WARNA_DAYA[1]).warna

const tglInput = (d) => d.toISOString().slice(0, 10)
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

let peta = null
let lapisanMarker = null

export async function tampilkanDasbor(el) {
  const hariIni = new Date()
  const tigaPuluhHari = new Date(hariIni); tigaPuluhHari.setDate(hariIni.getDate() - 30)

  el.innerHTML = `
    <div class="dasbor-kepala">
      <div>
        <h2>Dasbor survei</h2>
        <p id="dasbor-sub">Memuat data dari server…</p>
      </div>
      <div style="display:flex;gap:8px">
        <button type="button" class="tombol kecil ringan" id="btn-segarkan">${ikon('segarkan')}<span>Segarkan</span></button>
        <button type="button" class="tombol kecil sekunder" id="btn-csv">${ikon('unduh')}<span>Unduh CSV</span></button>
      </div>
    </div>

    <section class="kartu dasbor-filter">
      <label>Dari tanggal<input type="date" id="f-dari" value="${tglInput(tigaPuluhHari)}"></label>
      <label>Sampai tanggal<input type="date" id="f-sampai" value="${tglInput(hariIni)}"></label>
      <label>Cari<input type="search" id="f-cari" placeholder="Nama, kelurahan, surveyor"></label>
      <div class="aksi-filter">
        <label style="flex:1">Daya<select id="f-daya"><option value="">Semua</option></select></label>
        <label style="flex:1">Akurasi GPS<select id="f-akurasi">
          <option value="">Semua</option>
          <option value="baik">Baik (≤ 20 m)</option>
          <option value="sedang">Sedang (21–50 m)</option>
          <option value="rendah">Perlu verifikasi (> 50 m)</option>
        </select></label>
        <button type="button" class="tombol kecil" id="btn-terapkan" style="align-self:end">Terapkan</button>
      </div>
    </section>

    <div class="dasbor-grid">
      <div class="ringkasan-grid" id="dasbor-tiles"></div>
      <section class="kartu kartu-peta">
        <h2>Peta sebaran</h2>
        <div id="peta-dasbor" class="peta peta-dasbor"></div>
        <div class="legenda">${WARNA_DAYA.map(w => `<span style="--w:${w.warna}">${w.label}</span>`).join('')}</div>
      </section>
      <section class="kartu kartu-samping">
        <h2>Per daya (VA)</h2>
        <div class="bar-daftar" id="bar-daya"></div>
        <h2 style="margin-top:18px">Per surveyor</h2>
        <div class="bar-daftar" id="bar-surveyor"></div>
      </section>
      <section class="kartu kartu-tabel" id="detail" hidden></section>
      <section class="kartu kartu-tabel">
        <h2>Daftar survei <span id="jumlah-tabel" style="color:var(--teks-muda);font-weight:500"></span></h2>
        <div class="tabel-wadah">
          <table class="tabel">
            <thead><tr>
              <th>Nama</th><th>Kelurahan</th><th>Daya</th><th>Tarif</th><th>Surveyor</th>
              <th>Tanggal survei</th><th>Diterima</th><th>Akurasi</th><th>Foto</th>
            </tr></thead>
            <tbody id="tabel-isi"></tbody>
          </table>
        </div>
      </section>
    </div>`

  let semua = []
  let tersaring = []

  const q = (id) => el.querySelector(id)

  // ---------- Peta ----------
  if (peta) { peta.remove(); peta = null }
  peta = L.map('peta-dasbor').setView([-2.5, 118], 5)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(peta)
  lapisanMarker = L.layerGroup().addTo(peta)
  peta.on('popupopen', e => {
    const tombol = e.popup.getElement()?.querySelector('[data-detail]')
    tombol?.addEventListener('click', () => {
      const baris = semua.find(x => x.id === tombol.dataset.detail)
      if (baris) tampilkanDetail(baris)
    })
  })

  // ---------- Memuat ----------
  const muat = async () => {
    q('#dasbor-sub').textContent = 'Memuat data dari server…'
    try {
      semua = await ambilDaftarSurvei(q('#f-dari').value, q('#f-sampai').value)
      const dayaSet = [...new Set(semua.map(s => s.data?.permohonan?.dayaVA).filter(Boolean))].sort((a, b) => a - b)
      const pilih = q('#f-daya')
      const nilaiLama = pilih.value
      pilih.innerHTML = '<option value="">Semua</option>' + dayaSet.map(d => `<option value="${d}">${d} VA</option>`).join('')
      pilih.value = dayaSet.includes(Number(nilaiLama)) ? nilaiLama : ''
      terapkan()
    } catch (e) {
      q('#dasbor-sub').textContent = navigator.onLine
        ? `Gagal memuat data (${e.message}). Pastikan akun Anda admin.`
        : 'Anda sedang offline. Dasbor membutuhkan koneksi ke server.'
      tampilkanNotifikasi('Dasbor gagal memuat data')
    }
  }

  const terapkan = () => {
    const kata = q('#f-cari').value.trim().toLowerCase()
    const daya = q('#f-daya').value
    const akurasi = q('#f-akurasi').value
    tersaring = semua.filter(s => {
      const d = s.data ?? {}
      if (daya && String(d.permohonan?.dayaVA) !== daya) return false
      if (akurasi) {
        const kode = s.accuracy_m == null ? 'rendah' : tingkatAkurasi(s.accuracy_m).kode
        if (akurasi === 'rendah' ? !(kode === 'rendah' || kode === 'buruk') : kode !== akurasi) return false
      }
      if (!kata) return true
      return [d.pelanggan?.nama, d.pelanggan?.kelurahan, d.pelanggan?.kecamatan, d.pelanggan?.alamat, s.surveyor]
        .filter(Boolean).join(' ').toLowerCase().includes(kata)
    })
    q('#dasbor-sub').textContent = `${tersaring.length} survei dari ${semua.length} pada rentang tanggal ini`
    renderTiles(); renderPeta(); renderBar(); renderTabel()
  }

  // ---------- Ringkasan ----------
  const renderTiles = () => {
    const awalHari = new Date(); awalHari.setHours(0, 0, 0, 0)
    const tujuhHari = new Date(awalHari); tujuhHari.setDate(awalHari.getDate() - 6)
    const hariIni = tersaring.filter(s => new Date(s.created_at) >= awalHari).length
    const mingguIni = tersaring.filter(s => new Date(s.created_at) >= tujuhHari).length
    const akurasi = tersaring.map(s => s.accuracy_m).filter(a => a != null)
    const rataAkurasi = akurasi.length ? Math.round(akurasi.reduce((a, b) => a + b, 0) / akurasi.length) : null
    const lengkap = tersaring.filter(s => (s.photos?.length ?? 0) >= 3).length
    const perluVerifikasi = tersaring.filter(s => s.accuracy_m == null || s.accuracy_m > 50).length
    q('#dasbor-tiles').innerHTML = `
      <div class="tile biru"><div class="tile-angka">${tersaring.length}</div><div class="tile-label">Total survei</div></div>
      <div class="tile"><div class="tile-angka">${hariIni}</div><div class="tile-label">Hari ini · ${mingguIni} dalam 7 hari</div></div>
      <div class="tile hijau"><div class="tile-angka">${lengkap}</div><div class="tile-label">Foto lengkap (3 foto)</div></div>
      <div class="tile kuning"><div class="tile-angka">${rataAkurasi ?? '–'}<small style="font-size:0.9rem"> m</small></div><div class="tile-label">Rata-rata akurasi GPS · ${perluVerifikasi} perlu verifikasi (> 50 m)</div></div>`
  }

  // ---------- Peta ----------
  const renderPeta = () => {
    lapisanMarker.clearLayers()
    const titik = tersaring.filter(s => s.lat != null && s.lng != null)
    for (const s of titik) {
      const d = s.data ?? {}
      const m = L.circleMarker([s.lat, s.lng], {
        radius: 8, color: '#fff', weight: 2, fillColor: warnaDaya(d.permohonan?.dayaVA), fillOpacity: 0.9
      })
      m.bindPopup(`
        <strong>${esc(d.pelanggan?.nama || 'Tanpa nama')}</strong><br>
        ${esc(d.permohonan?.dayaVA ? d.permohonan.dayaVA + ' VA' : '')} ${esc(d.permohonan?.tarif || '')}<br>
        <small>${esc(formatTanggal(s.created_at))} · akurasi ${esc(s.accuracy_m ?? '?')} m</small><br>
        <button type="button" data-detail="${s.id}" style="margin-top:6px;font:inherit;color:#0b5ed7;background:#e8f0fd;border:0;border-radius:6px;padding:4px 10px;cursor:pointer">Lihat detail</button>`)
      lapisanMarker.addLayer(m)
    }
    if (titik.length) peta.fitBounds(L.latLngBounds(titik.map(s => [s.lat, s.lng])).pad(0.2), { maxZoom: 16 })
    setTimeout(() => peta.invalidateSize(), 0)
  }

  // ---------- Batang per daya dan per surveyor ----------
  const renderBar = () => {
    const bar = (wadah, kelompok) => {
      const entri = Object.entries(kelompok).sort((a, b) => b[1] - a[1])
      const maks = Math.max(1, ...entri.map(e => e[1]))
      wadah.innerHTML = entri.length ? entri.map(([k, n]) => `
        <div class="bar-baris"><span>${esc(k)}</span><div class="bar"><i style="width:${Math.round(n / maks * 100)}%"></i></div><b>${n}</b></div>`).join('')
        : '<p>Belum ada data.</p>'
    }
    const perDaya = {}, perSurveyor = {}
    for (const s of tersaring) {
      const va = s.data?.permohonan?.dayaVA
      perDaya[va ? `${va} VA` : 'Tanpa daya'] = (perDaya[va ? `${va} VA` : 'Tanpa daya'] ?? 0) + 1
      perSurveyor[s.surveyor || '–'] = (perSurveyor[s.surveyor || '–'] ?? 0) + 1
    }
    bar(q('#bar-daya'), perDaya)
    bar(q('#bar-surveyor'), perSurveyor)
  }

  // ---------- Tabel ----------
  const renderTabel = () => {
    const tbody = q('#tabel-isi')
    q('#jumlah-tabel').textContent = `(${tersaring.length})`
    tbody.innerHTML = tersaring.map(s => {
      const d = s.data ?? {}
      return `<tr data-id="${s.id}">
        <td class="nama">${esc(d.pelanggan?.nama || 'Tanpa nama')}</td>
        <td>${esc(d.pelanggan?.kelurahan || '–')}</td>
        <td>${esc(d.permohonan?.dayaVA ? d.permohonan.dayaVA + ' VA' : '–')}</td>
        <td>${esc(d.permohonan?.tarif || '–')}</td>
        <td>${esc(s.surveyor || '–')}</td>
        <td>${esc(formatTanggal(s.created_at))}</td>
        <td>${esc(formatTanggal(s.received_at))}</td>
        <td class="${s.accuracy_m != null ? 'akurasi-' + (['rendah', 'buruk'].includes(tingkatAkurasi(s.accuracy_m).kode) ? 'rendah' : tingkatAkurasi(s.accuracy_m).kode) : ''}">${s.accuracy_m != null ? esc(s.accuracy_m) + ' m' : '–'}</td>
        <td>${(s.photos?.length ?? 0)}/3</td>
      </tr>`
    }).join('') || '<tr><td colspan="9" style="color:var(--teks-muda)">Tidak ada survei pada rentang ini.</td></tr>'
    tbody.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => {
      tbody.querySelectorAll('tr').forEach(x => x.classList.remove('aktif'))
      tr.classList.add('aktif')
      tampilkanDetail(semua.find(x => x.id === tr.dataset.id))
    }))
  }

  // ---------- Detail satu survei ----------
  const tampilkanDetail = async (s) => {
    const d = s.data ?? {}
    const wadah = q('#detail')
    const baris = (label, nilai) => `<dt>${label}</dt><dd>${esc(nilai ?? '–') || '–'}</dd>`
    wadah.hidden = false
    wadah.innerHTML = `
      <div class="form-atas">
        <h2>${esc(d.pelanggan?.nama || 'Tanpa nama')}</h2>
        <button type="button" class="tautan" id="btn-tutup-detail">Tutup</button>
      </div>
      <dl class="detail-baris">
        ${baris('NIK', d.pelanggan?.nik)}
        ${baris('No. KK', d.pelanggan?.noKK)}
        ${baris('No. HP', d.pelanggan?.noHp)}
        ${baris('Alamat', [d.pelanggan?.alamat, d.pelanggan?.rt && `RT ${d.pelanggan.rt}`, d.pelanggan?.rw && `RW ${d.pelanggan.rw}`].filter(Boolean).join(', '))}
        ${baris('Kelurahan / Kecamatan', [d.pelanggan?.kelurahan, d.pelanggan?.kecamatan].filter(Boolean).join(' / '))}
        ${baris('Daya / tarif / peruntukan', [d.permohonan?.dayaVA && `${d.permohonan.dayaVA} VA`, d.permohonan?.tarif, d.permohonan?.peruntukan].filter(Boolean).join(' · '))}
        ${baris('Jarak ke tiang', d.teknis?.jarakTiangM != null ? `${d.teknis.jarakTiangM} m${d.teknis?.perluTiangBaru ? ', perlu tiang baru' : ''}` : null)}
        ${baris('Catatan', d.teknis?.catatan)}
        ${baris('Koordinat', s.lat != null ? `${s.lat.toFixed(6)}, ${s.lng.toFixed(6)} (akurasi ${s.accuracy_m ?? '?'} m${d.lokasi?.manual ? ', digeser manual' : ''})` : null)}
        ${baris('Surveyor', s.surveyor)}
        ${baris('Tanggal survei', formatTanggal(s.created_at))}
        ${baris('Diterima server', formatTanggal(s.received_at))}
        ${baris('Persetujuan', d.persetujuan?.setuju ? 'Disetujui pelanggan' : 'Belum')}
      </dl>
      ${d.persetujuan?.ttdPelangganPng ? `<p style="margin-top:10px">Tanda tangan</p><img class="ttd-kecil" alt="Tanda tangan pelanggan" src="${esc(d.persetujuan.ttdPelangganPng)}">` : ''}
      <div class="detail-foto" id="detail-foto">
        ${(s.photos ?? []).map(p => `<figure><img alt="Foto ${esc(p.type)}" data-tipe="${esc(p.type)}"><figcaption>${esc(p.type.toUpperCase())} · ${Math.round((p.size ?? 0) / 1024)} KB</figcaption></figure>`).join('')}
      </div>`
    wadah.querySelector('#btn-tutup-detail').addEventListener('click', () => { wadah.hidden = true })
    wadah.scrollIntoView({ behavior: 'smooth', block: 'start' })
    for (const img of wadah.querySelectorAll('img[data-tipe]')) {
      try { img.src = await ambilUrlFoto(s.id, img.dataset.tipe) } catch { img.alt = 'Foto tidak bisa dimuat' }
    }
  }

  // ---------- Ekspor CSV ----------
  const unduhCsv = () => {
    const kolom = ['id', 'nama', 'nik', 'noKK', 'noHp', 'alamat', 'rt', 'rw', 'kelurahan', 'kecamatan',
      'dayaVA', 'tarif', 'peruntukan', 'jarakTiangM', 'perluTiangBaru', 'catatan', 'lat', 'lng', 'akurasiM',
      'surveyor', 'tanggalSurvei', 'diterima', 'jumlahFoto']
    const baris = tersaring.map(s => {
      const d = s.data ?? {}
      return [s.id, d.pelanggan?.nama, d.pelanggan?.nik, d.pelanggan?.noKK, d.pelanggan?.noHp, d.pelanggan?.alamat,
        d.pelanggan?.rt, d.pelanggan?.rw, d.pelanggan?.kelurahan, d.pelanggan?.kecamatan,
        d.permohonan?.dayaVA, d.permohonan?.tarif, d.permohonan?.peruntukan,
        d.teknis?.jarakTiangM, d.teknis?.perluTiangBaru ? 'ya' : 'tidak', d.teknis?.catatan,
        s.lat, s.lng, s.accuracy_m, s.surveyor, s.created_at, s.received_at, s.photos?.length ?? 0]
    })
    const sel = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [kolom, ...baris].map(r => r.map(sel).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `survei-${q('#f-dari').value}-sd-${q('#f-sampai').value}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  q('#btn-terapkan').addEventListener('click', muat)
  q('#btn-segarkan').addEventListener('click', muat)
  q('#btn-csv').addEventListener('click', unduhCsv)
  q('#f-cari').addEventListener('input', terapkan)
  q('#f-daya').addEventListener('change', terapkan)
  q('#f-akurasi').addEventListener('change', terapkan)

  await muat()
}
