import { v4 as uuid } from 'uuid'
import { db, simpanSurvei, bacaSurvei, hapusSurvei } from './db.js'
import { tampilkanLayar, tampilkanNotifikasi, ikon } from './main.js'
import { tampilkanJumlahPending, kirimUlang, ambilGalatTerakhir, jalankanSync } from './sync.js'
import { JENIS_FOTO, muatPratinjau, pasangInputFoto } from './camera.js'
import { ambilLokasi, tampilkanPeta, pesanGalatLokasi, tingkatAkurasi, MAKS_AKURASI_TANPA_GESER_M } from './geo.js'

// ===================== Inti (sesuai panduan) =====================

export function surveiBaru(surveyorId) {
  return { id: uuid(), status: 'draft', createdAt: new Date().toISOString(), surveyorId,
           pelanggan: {}, permohonan: {}, teknis: {}, lokasi: null, persetujuan: {} }
}

export function validasi(s) {
  const err = {}
  if (!s.pelanggan.nama?.trim()) err.nama = 'Nama wajib diisi'
  if (!/^\d{16}$/.test(s.pelanggan.nik ?? '')) err.nik = 'NIK harus 16 digit'
  if (!/^\d{16}$/.test(s.pelanggan.noKK ?? '')) err.noKK = 'No. KK harus 16 digit'
  if (!/^08\d{8,11}$/.test(s.pelanggan.noHp ?? '')) err.noHp = 'Nomor HP tidak valid'
  if (!s.permohonan.dayaVA) err.daya = 'Pilih daya yang diajukan'
  if (!s.lokasi?.lat) err.lokasi = 'Lokasi rumah belum diambil'
  if (!s.persetujuan.setuju) err.setuju = 'Persetujuan pelanggan wajib dicentang'
  return err
}

// autosave draft, ditunda 500 ms setelah ketikan terakhir
let timer
export function autosave(s) {
  clearTimeout(timer)
  timer = setTimeout(() => simpanSurvei(s), 500)
}

export async function kirim(s) {
  const err = validasi(s)
  const jumlahFoto = await db.photos.where('surveyId').equals(s.id).count()
  if (jumlahFoto < 3) err.foto = 'Foto KTP, KK, dan rumah wajib'
  if (Object.keys(err).length) return err
  s.status = 'pending'
  await simpanSurvei(s)
  return null
}

// ===================== Pilihan tetap dan label =====================

export const LABEL_STATUS = {
  draft: 'Draf', pending: 'Menunggu kirim', sent: 'Terkirim', failed: 'Gagal'
}

const OPSI_DAYA = [450, 900, 1300, 2200, 3500, 4400, 5500, 7700]
const OPSI_TARIF = [
  ['R1', 'R1 – Rumah tangga'],
  ['R2', 'R2 – Rumah tangga 3.500–5.500 VA'],
  ['R3', 'R3 – Rumah tangga ≥ 6.600 VA'],
  ['B1', 'B1 – Bisnis kecil'],
  ['S2', 'S2 – Sosial'],
  ['P1', 'P1 – Kantor pemerintah'],
  ['I1', 'I1 – Industri kecil']
]
const OPSI_PERUNTUKAN = ['rumah tinggal', 'usaha', 'sosial/ibadah', 'kantor pemerintah', 'industri']

const opsi = (daftar, nilaiTerpilih) => daftar.map(o => {
  const [nilai, label] = Array.isArray(o) ? o : [o, o]
  return `<option value="${nilai}"${String(nilai) === String(nilaiTerpilih ?? '') ? ' selected' : ''}>${label}</option>`
}).join('')

export function formatTanggal(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

// ===================== Template halaman form =====================

function templateForm(s, hanyaBaca) {
  const field = (label, name, atribut = '', galat = '') =>
    `<label class="field">
       <span>${label}</span>
       <input name="${name}" ${atribut}>
       <small class="galat" data-galat="${galat || name.split('.').pop()}"></small>
     </label>`
  const legenda = (nomor, judul) => `<legend><span class="nomor">${nomor}</span>${judul}</legend>`
  return `
    <div class="form-atas">
      <button type="button" class="tautan" id="btn-kembali">${ikon('kembali')}Daftar survei</button>
      <span class="status status-${s.status}">${LABEL_STATUS[s.status]}</span>
    </div>
    ${s.status === 'pending' ? '<p class="info">Survei ini menunggu kirim dan tidak bisa diubah lagi.</p>' : ''}
    ${s.status === 'failed' ? `<p class="galat-info" id="info-gagal">${ikon('peringatan')}<span>Pengiriman gagal setelah beberapa percobaan.</span></p>` : ''}
    <form id="form-survei" novalidate ${hanyaBaca ? 'class="hanya-baca"' : ''}>
      ${hanyaBaca ? '' : `
      <div class="progres" id="progres">
        <div class="progres-teks"><span>Kelengkapan survei</span><strong id="progres-teks">0 dari 10</strong></div>
        <div class="progres-bar"><div class="progres-isi" id="progres-isi"></div></div>
      </div>`}
      <p class="galat-ringkasan" id="galat-ringkasan" hidden></p>

      <fieldset class="kartu">
        ${legenda(1, 'Data pelanggan')}
        ${field('Nama lengkap', 'pelanggan.nama', 'type="text" autocomplete="name" placeholder="Sesuai KTP"')}
        ${field('NIK', 'pelanggan.nik', 'type="text" inputmode="numeric" maxlength="16" pattern="\\d{16}" placeholder="16 digit"')}
        ${field('No. KK', 'pelanggan.noKK', 'type="text" inputmode="numeric" maxlength="16" pattern="\\d{16}" placeholder="16 digit"')}
        ${field('No. HP', 'pelanggan.noHp', 'type="text" inputmode="numeric" maxlength="13" placeholder="08…"')}
        <label class="field">
          <span>Alamat</span>
          <textarea name="pelanggan.alamat" rows="2" placeholder="Jalan, nomor rumah, patokan"></textarea>
          <small class="galat" data-galat="alamat"></small>
        </label>
        <div class="baris-2">
          ${field('RT', 'pelanggan.rt', 'type="text" inputmode="numeric" maxlength="3"')}
          ${field('RW', 'pelanggan.rw', 'type="text" inputmode="numeric" maxlength="3"')}
        </div>
        ${field('Kelurahan / Desa', 'pelanggan.kelurahan', 'type="text"')}
        ${field('Kecamatan', 'pelanggan.kecamatan', 'type="text"')}
      </fieldset>

      <fieldset class="kartu">
        ${legenda(2, 'Permohonan')}
        <label class="field">
          <span>Daya yang diajukan (VA)</span>
          <select name="permohonan.dayaVA">
            <option value="">– pilih daya –</option>
            ${opsi(OPSI_DAYA, s.permohonan.dayaVA)}
          </select>
          <small class="galat" data-galat="daya"></small>
        </label>
        <label class="field">
          <span>Golongan tarif</span>
          <select name="permohonan.tarif">
            <option value="">– pilih tarif –</option>
            ${opsi(OPSI_TARIF, s.permohonan.tarif)}
          </select>
          <small class="galat" data-galat="tarif"></small>
        </label>
        <label class="field">
          <span>Peruntukan</span>
          <select name="permohonan.peruntukan">
            <option value="">– pilih peruntukan –</option>
            ${opsi(OPSI_PERUNTUKAN, s.permohonan.peruntukan)}
          </select>
          <small class="galat" data-galat="peruntukan"></small>
        </label>
      </fieldset>

      <fieldset class="kartu">
        ${legenda(3, 'Data teknis')}
        ${field('Jarak ke tiang terdekat (meter)', 'teknis.jarakTiangM', 'type="number" inputmode="decimal" min="0" step="1"', 'jarak')}
        <label class="centang">
          <input type="checkbox" name="teknis.perluTiangBaru">
          <span>Perlu tiang baru</span>
        </label>
        <label class="field">
          <span>Catatan</span>
          <textarea name="teknis.catatan" rows="2" placeholder="Kondisi jaringan, akses, dan lain-lain"></textarea>
        </label>
      </fieldset>

      <fieldset class="kartu">
        ${legenda(4, 'Foto dan lokasi')}
        <div class="field">
          <span>Foto KTP, KK, dan tampak depan rumah</span>
          <div class="foto-grid">
            ${JENIS_FOTO.map(([tipe, label]) => `
            <div class="foto-blok">
              <label class="foto-tile" title="${label}">
                <input type="file" accept="image/*" capture="environment" data-tipe="${tipe}" hidden>
                ${ikon('kamera')}
                <img id="pratinjau-${tipe}" alt="" hidden>
                <span class="cek" hidden>${ikon('cek')}</span>
              </label>
              <span class="foto-label">${label.replace('Foto ', '').replace('tampak depan rumah', 'Rumah')}</span>
              <small class="foto-ket" data-ket-foto="${tipe}">Belum ada</small>
            </div>`).join('')}
          </div>
          <small class="galat" data-galat="foto"></small>
        </div>
        <div class="field">
          <span>Lokasi rumah</span>
          <button type="button" class="tombol sekunder" id="btn-gps">${ikon('lokasi')}<span>Ambil lokasi GPS</span></button>
          <p class="info" id="status-gps">Belum ada titik lokasi. GPS bekerja tanpa internet.</p>
          <div id="peta" class="peta" hidden></div>
          <small class="galat" data-galat="lokasi"></small>
        </div>
      </fieldset>

      <fieldset class="kartu">
        ${legenda(5, 'Persetujuan pelanggan')}
        <label class="centang">
          <input type="checkbox" name="persetujuan.setuju">
          <span>Saya setuju data saya dipakai untuk permohonan sambungan listrik</span>
        </label>
        <small class="galat" data-galat="setuju"></small>
        <div class="field">
          <span>Tanda tangan pelanggan</span>
          <canvas id="ttd" class="ttd" height="160"></canvas>
          <button type="button" class="tautan" id="btn-hapus-ttd">Hapus tanda tangan</button>
        </div>
      </fieldset>

      <p class="autosave" id="status-autosave"></p>
      <p class="hapus-baris"><button type="button" class="tautan bahaya" id="btn-hapus">${ikon('hapus')}Hapus survei ini</button></p>
      <div class="aksi" ${hanyaBaca ? 'hidden' : ''}>
        <button type="submit" class="tombol" id="btn-kirim">${ikon('kirim')}<span>${s.status === 'failed' ? 'Kirim ulang' : 'Simpan dan kirim'}</span></button>
        <button type="button" class="tombol sekunder" id="btn-draf">${ikon('simpan')}<span>Draf</span></button>
      </div>
    </form>
  `
}

// Kelengkapan: 10 hal wajib (7 field + 3 foto); lokasi dihitung satu, tanda tangan tidak wajib
export function hitungKelengkapan(s, jumlahFoto) {
  const wajib = [
    !!s.pelanggan.nama?.trim(),
    /^\d{16}$/.test(s.pelanggan.nik ?? ''),
    /^\d{16}$/.test(s.pelanggan.noKK ?? ''),
    /^08\d{8,11}$/.test(s.pelanggan.noHp ?? ''),
    !!s.permohonan.dayaVA,
    !!s.lokasi?.lat,
    !!s.persetujuan.setuju
  ]
  return { terisi: wajib.filter(Boolean).length + Math.min(3, jumlahFoto), total: 10 }
}

// ===================== Pengikatan data =====================

const ambil = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)
const setel = (obj, path, nilai) => {
  const kunci = path.split('.')
  const akhir = kunci.pop()
  const induk = kunci.reduce((o, k) => (o[k] ??= {}), obj)
  if (nilai === undefined || nilai === '') delete induk[akhir]
  else induk[akhir] = nilai
}

const FIELD_ANGKA = new Set(['permohonan.dayaVA', 'teknis.jarakTiangM'])

function isiFormDariRecord(form, s) {
  form.querySelectorAll('[name]').forEach(el => {
    const nilai = ambil(s, el.name)
    if (el.type === 'checkbox') el.checked = Boolean(nilai)
    else el.value = nilai ?? ''
  })
}

function bacaInput(el) {
  if (el.type === 'checkbox') return el.checked
  const v = el.value
  if (FIELD_ANGKA.has(el.name)) return v === '' ? undefined : Number(v)
  return v
}

function tampilkanGalat(form, err) {
  form.querySelectorAll('.galat').forEach(el => { el.textContent = '' })
  form.querySelectorAll('.salah').forEach(el => el.classList.remove('salah'))
  const ringkasan = form.querySelector('#galat-ringkasan')
  const kunci = Object.keys(err ?? {})
  if (!kunci.length) { ringkasan.hidden = true; return }
  let pertama = null
  for (const k of kunci) {
    const el = form.querySelector(`.galat[data-galat="${k}"]`)
    if (!el) continue
    el.textContent = err[k]
    el.closest('.field, .centang')?.classList.add('salah')
    pertama ??= el
  }
  ringkasan.textContent = `Masih ada ${kunci.length} hal yang perlu dilengkapi.`
  ringkasan.hidden = false
  pertama?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

// ===================== Tanda tangan di canvas =====================

function pasangTandaTangan(canvas, s, { hanyaBaca, onUbah }) {
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1

  function siapkanUkuran() {
    const lebar = canvas.clientWidth || 300
    const tinggi = 160
    canvas.width = Math.round(lebar * dpr)
    canvas.height = Math.round(tinggi * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1f2933'
    gambarUlang()
  }

  function gambarUlang() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const data = s.persetujuan.ttdPelangganPng
    if (!data) return
    const img = new Image()
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.clientWidth, 160)
    img.src = data
  }

  siapkanUkuran()
  if (hanyaBaca) return

  let menggambar = false
  let adaGoresan = false
  const titik = e => {
    const r = canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault()
    canvas.setPointerCapture(e.pointerId)
    menggambar = true
    ctx.beginPath()
    ctx.moveTo(...titik(e))
  })
  canvas.addEventListener('pointermove', e => {
    if (!menggambar) return
    e.preventDefault()
    ctx.lineTo(...titik(e))
    ctx.stroke()
    adaGoresan = true
  })
  const selesai = e => {
    if (!menggambar) return
    menggambar = false
    if (adaGoresan) {
      s.persetujuan.ttdPelangganPng = canvas.toDataURL('image/png')
      onUbah()
    }
  }
  canvas.addEventListener('pointerup', selesai)
  canvas.addEventListener('pointercancel', selesai)

  return {
    hapus() {
      delete s.persetujuan.ttdPelangganPng
      adaGoresan = false
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      onUbah()
    }
  }
}

// ===================== Halaman form =====================

export async function tampilkanForm(el, { id, surveyorId }) {
  const s = id ? await bacaSurvei(id) : surveiBaru(surveyorId)
  if (!s) {
    tampilkanNotifikasi('Survei tidak ditemukan')
    return tampilkanLayar('beranda')
  }
  if (s.status === 'sent') {
    // Isi form dan foto sudah dihapus dari HP setelah server mengonfirmasi (Langkah 8)
    el.innerHTML = `
      <div class="form-atas">
        <button type="button" class="tautan" id="btn-kembali">${ikon('kembali')}Daftar survei</button>
        <span class="status status-sent">${LABEL_STATUS.sent}</span>
      </div>
      <section class="kartu">
        <h2 id="ringkasan-nama"></h2>
        <p id="ringkasan-kelurahan"></p>
        <p>Terkirim ${formatTanggal(s.sentAt)}. Data pelanggan, lokasi, dan foto sudah dihapus dari HP ini
           sesuai aturan privasi; data lengkap tersimpan di server.</p>
        <p style="margin-top:12px"><button type="button" class="tautan bahaya" id="btn-hapus">Hapus ringkasan ini dari HP</button></p>
      </section>`
    el.querySelector('#ringkasan-nama').textContent = s.ringkasan?.nama || 'Tanpa nama'
    el.querySelector('#ringkasan-kelurahan').textContent = s.ringkasan?.kelurahan ? `Kelurahan/Desa ${s.ringkasan.kelurahan}` : ''
    el.querySelector('#btn-kembali').addEventListener('click', () => tampilkanLayar('beranda'))
    el.querySelector('#btn-hapus').addEventListener('click', async () => {
      if (!confirm('Hapus ringkasan survei ini dari HP? Data di server tidak ikut terhapus.')) return
      await hapusSurvei(s.id)
      tampilkanNotifikasi('Ringkasan dihapus dari HP')
      tampilkanLayar('beranda')
    })
    return
  }
  const hanyaBaca = s.status === 'sent' || s.status === 'pending'   // status hanya bergerak maju
  const statusAwal = s.status

  el.innerHTML = templateForm(s, hanyaBaca)
  const form = el.querySelector('#form-survei')
  const statusAutosave = el.querySelector('#status-autosave')
  isiFormDariRecord(form, s)
  if (hanyaBaca) form.querySelectorAll('input, select, textarea, #btn-hapus-ttd, #btn-gps').forEach(x => { x.disabled = true })

  // Indikator tampilan: autosave() menyimpan 500 ms setelah ketikan terakhir,
  // jadi 700 ms setelah itu draf dipastikan sudah ada di IndexedDB.
  let timerIndikator
  const perbaruiProgres = () => {
    const isi = el.querySelector('#progres-isi')
    if (!isi) return
    const { terisi, total } = hitungKelengkapan(s, form.querySelectorAll('.foto-tile.ada').length)
    el.querySelector('#progres-teks').textContent = `${terisi} dari ${total}`
    isi.style.width = `${Math.round(terisi / total * 100)}%`
    isi.classList.toggle('lengkap', terisi === total)
  }
  const tandaiPerubahan = () => {
    perbaruiProgres()
    statusAutosave.textContent = 'Menyimpan draf…'
    autosave(s)
    clearTimeout(timerIndikator)
    timerIndikator = setTimeout(() => {
      statusAutosave.textContent = `Draf tersimpan ${formatTanggal(s.updatedAt)}`
    }, 700)
  }
  if (s.updatedAt) statusAutosave.textContent = `Terakhir disimpan ${formatTanggal(s.updatedAt)}`
  perbaruiProgres()

  if (!hanyaBaca) {
    form.addEventListener('input', e => {
      const t = e.target
      if (!t.name) return
      setel(s, t.name, bacaInput(t))
      tandaiPerubahan()
    })
  }

  const ttd = pasangTandaTangan(el.querySelector('#ttd'), s, { hanyaBaca, onUbah: tandaiPerubahan })
  el.querySelector('#btn-hapus-ttd').addEventListener('click', () => ttd?.hapus())

  if (statusAwal === 'failed') {
    const antrian = await ambilGalatTerakhir(s.id)
    if (antrian?.lastError) {
      el.querySelector('#info-gagal span').textContent =
        `Pengiriman gagal ${antrian.attempts} kali. Galat terakhir: ${antrian.lastError}. Periksa data lalu tekan "Kirim ulang".`
    }
  }

  // ---- Foto (Langkah 4) ----
  await muatPratinjau(form, s.id)
  perbaruiProgres()
  if (!hanyaBaca) {
    pasangInputFoto(form, s, () => {
      form.querySelector('.galat[data-galat="foto"]').textContent = ''
      perbaruiProgres()
    })
  }

  // ---- Lokasi GPS dan peta (Langkah 5) ----
  const btnGps = form.querySelector('#btn-gps')
  const statusGps = form.querySelector('#status-gps')
  const elPeta = form.querySelector('#peta')
  let peta = null

  const tulisStatusLokasi = () => {
    const l = s.lokasi
    const tingkat = tingkatAkurasi(l.accuracyM)
    const perluGeser = l.accuracyM > MAKS_AKURASI_TANPA_GESER_M && !l.manual
    statusGps.className = `info ${tingkat.kode}`
    statusGps.textContent = `${tingkat.label}, ${l.accuracyM} m. ` +
      (l.manual ? 'Marker sudah digeser ke posisi rumah. ' : (perluGeser ? tingkat.pesan + ' ' : tingkat.pesan + ' ')) +
      `(${l.lat.toFixed(5)}, ${l.lng.toFixed(5)})`
    if (!perluGeser) form.querySelector('.galat[data-galat="lokasi"]').textContent = ''
  }
  const gambarPeta = () => {
    if (!s.lokasi) return
    tulisStatusLokasi()
    elPeta.hidden = false
    if (peta) { peta.remove(); peta = null }
    peta = tampilkanPeta('peta', s.lokasi, lokasiBaru => {
      if (hanyaBaca) return
      s.lokasi = lokasiBaru
      tulisStatusLokasi()
      tandaiPerubahan()
    })
    setTimeout(() => peta.invalidateSize(), 0)
  }
  gambarPeta()

  btnGps.addEventListener('click', async () => {
    btnGps.disabled = true
    btnGps.querySelector('span').textContent = 'Mencari sinyal GPS…'
    statusGps.className = 'info'
    statusGps.textContent = 'Mencari sinyal GPS, sampai 30 detik. Tetap di tempat terbuka.'
    try {
      s.lokasi = await ambilLokasi(undefined, {
        onUpdate: (sekarang, terbaik) => {
          statusGps.textContent = `Mencari sinyal GPS… akurasi ${sekarang} m (terbaik ${terbaik} m). Menunggu sampai ≤ 20 m atau 30 detik.`
        }
      })
      form.querySelector('.galat[data-galat="lokasi"]').textContent = ''
      gambarPeta()
      tandaiPerubahan()
      btnGps.querySelector('span').textContent = 'Ambil ulang lokasi'
    } catch (e) {
      statusGps.className = 'info buruk'
      statusGps.textContent = `${pesanGalatLokasi(e).replace(/\.?$/, '.')} Tekan "Coba lagi".`
      btnGps.querySelector('span').textContent = 'Coba lagi'
    } finally {
      btnGps.disabled = false
    }
  })
  if (s.lokasi) btnGps.querySelector('span').textContent = 'Ambil ulang lokasi'

  const keluar = () => {
    clearTimeout(timerIndikator)
    if (peta) { peta.remove(); peta = null }
    tampilkanLayar('beranda')
  }
  el.querySelector('#btn-kembali').addEventListener('click', keluar)

  // Hapus survei yang salah input: draf, menunggu kirim (dikeluarkan dari antrian), atau gagal
  el.querySelector('#btn-hapus').addEventListener('click', async () => {
    const nama = s.pelanggan?.nama?.trim() || 'tanpa nama'
    const pesan = s.status === 'pending'
      ? `Survei "${nama}" masih menunggu kirim. Hapus dari HP dan batalkan pengirimannya?`
      : `Hapus survei "${nama}" beserta fotonya dari HP? Tindakan ini tidak bisa dibatalkan.`
    if (!confirm(pesan)) return
    clearTimeout(timer)   // batalkan autosave yang masih tertunda agar record tidak ditulis ulang
    await hapusSurvei(s.id)
    await tampilkanJumlahPending()
    tampilkanNotifikasi('Survei dihapus')
    keluar()
  })

  el.querySelector('#btn-draf')?.addEventListener('click', async () => {
    clearTimeout(timer)
    await simpanSurvei(s)
    tampilkanNotifikasi('Draf disimpan')
    keluar()
  })

  form.addEventListener('submit', async e => {
    e.preventDefault()
    if (hanyaBaca) return
    const tombol = form.querySelector('#btn-kirim')
    tombol.disabled = true
    try {
      // Aturan tabel panduan: jarak ke tiang harus angka >= 0 (dicek lewat atribut min input)
      const inputJarak = form.querySelector('[name="teknis.jarakTiangM"]')
      if (inputJarak.validity.rangeUnderflow || inputJarak.validity.badInput) {
        tampilkanGalat(form, { jarak: 'Jarak harus angka 0 atau lebih' })
        return
      }
      if (s.lokasi?.lat && s.lokasi.accuracyM > MAKS_AKURASI_TANPA_GESER_M && !s.lokasi.manual) {
        tampilkanGalat(form, { lokasi: `Akurasi GPS ${s.lokasi.accuracyM} m. Geser marker ke posisi rumah dulu, atau ambil ulang di tempat terbuka.` })
        return
      }
      const err = await kirim(s)
      tampilkanGalat(form, err)
      if (err) return
      if (statusAwal === 'failed') await kirimUlang(s.id)   // attempts kembali 0, lalu coba kirim
      await tampilkanJumlahPending()
      tampilkanNotifikasi('Survei disimpan, menunggu kirim')
      keluar()
      jalankanSync()   // bila sedang online, langsung dikirim tanpa menunggu putaran 60 detik
    } finally {
      tombol.disabled = false
    }
  })
}
