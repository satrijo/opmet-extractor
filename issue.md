# [BUG/ENHANCEMENT] Inkonsistensi Ingesti TAF/METAR ke Database MySQL (Data Masuk ke IDOP tetapi Tidak Masuk ke MySQL) dan Kebutuhan Traceable Logging

## 1. Latar Belakang Masalah (Background)
Ditemukan anomali di mana data buletin **TAF** untuk beberapa stasiun Indonesia (antara lain: **`WIMP`**, **`WIJJ`**, **`WIJB`**, **`WAWB`**, **`WAWD`**, **`WAWR`**, **`WAJI`**) berhasil terkirim dan diterima oleh **API IDOP**, namun **tidak ditemukan / tidak masuk ke database MySQL**.

Fakta bahwa IDOP menerima data membuktikan bahwa:
1. File mentah berhasil ditemukan dan dibaca oleh `opmet.js`.
2. Header buletin berhasil dikenali sebagai TAF (`identifier.startsWith("FT")` atau `startsWith("FC")`).
3. Kode stasiun berawalan `WI` / `WA` berhasil lolos validasi dan fungsi `idop()` berhasil dieksekusi.

Namun, mengapa data tersebut **tidak ada di MySQL** tidak dapat diinvestigasi karena **tidak adanya structured logging** pada alur database di `src/send.js`.

---

## 2. Hipotesis Penyebab Discrepancy (IDOP Sukses vs MySQL Hilang)

1. **Error Validasi Tanggal/Format pada Query MySQL:**
   - IDOP hanya menerima string mentah (`headerSandi + "\n" + line`), sehingga tidak terpengaruh oleh parsing internal.
   - Sedangkan MySQL memerlukan parsing waktu (`compiledIssuedTime`, `compiledValidFrom`, `compiledValidUntil`). Jika parsing tanggal menghasilkan format tidak valid (misal: jam `24` atau rollover bulan yang salah), MySQL dalam mode `STRICT_ALL_TABLES` / `STRICT_TRANS_TABLES` akan menolak query (*Data truncated / Incorrect datetime value*).
2. **Tertimpa oleh `ON DUPLICATE KEY UPDATE`:**
   - Jika `data_code` yang digenerate menghasilkan string yang identik dengan record yang sudah ada (misal akibat split `Z` yang salah), MySQL hanya akan melakukan *update* pada baris lama tanpa menambah baris baru.
3. **Kegagalan Asinkron / Connection Pool:**
   - Query dijalankan lewat `pool.query(...)` tanpa `await` di dalam loop `.map()`. Jika antrean koneksi penuh atau terjadi timeout, query gagal tanpa retry dan tanpa log yang terstruktur.

---

## 3. Masalah Visibilitas Saat Ini (Current Visibility Issues)

1. **Log Eksekusi Database yang Minim:**
   Callback `pool.query(query, values, (err, result) => ...)` hanya melakukan `console.log(result)` / `console.log(err)` tanpa menyebutkan stasiun (ICAO), jenis buletin, `data_code`, atau data mentah yang gagal.
2. **Silent Discard pada Validasi Tertentu:**
   Banyak pengecekan yang langsung melakukan `return;` tanpa log (misal: ketiadaan tanda `=`, filter `WIIX`/`K`, pesan `NIL`).
3. **Tidak Ada Ringkasan Per-Siklus:**
   Tidak ada log ringkasan berapa data yang berhasil di-insert ke MySQL vs berapa data yang berhasil dikirim ke IDOP.

---

## 4. Rencana Penambahan Traceable Logging (Logging Scope)

### 4.1 Log Alur Database (`src/send.js`)
Mencatat dengan detail setiap upaya penyimpanan ke MySQL:
* **Saat Query Dimulai:**
  `[DB:START] [TAF] Menyimpan data stasiun: <icao> | DataCode: <dataCode> | Valid: <valid_from> s/d <valid_until>`
* **Jika Berhasil (Insert Baru vs Update Duplicate):**
  `[DB:SUCCESS] [TAF] Sukses | ICAO: <icao> | Status: INSERTED (affectedRows: 1)`
  `[DB:SUCCESS] [TAF] Sukses (Duplicate Key) | ICAO: <icao> | Status: UPDATED (affectedRows: 2)`
* **Jika Gagal (Query Error):**
  `[DB:ERROR] [TAF] Gagal INSERT MySQL | ICAO: <icao> | DataCode: <dataCode> | Error: <errorMessage> | SQL: <query>`

### 4.2 Log Alur IDOP (`src/idop.js` & `src/send.js`)
Mencatat status pengiriman ke IDOP untuk korelasi dengan DB:
* `[IDOP:TRIGGER] [TAF] Mengirim ke IDOP untuk stasiun: <icao> (Header: <headerSandi>)`
* `[IDOP:SUCCESS] [TAF] Respon IDOP untuk stasiun: <icao> | Response: <responseBody>`
* `[IDOP:ERROR] [TAF] Gagal kirim IDOP untuk stasiun: <icao> | Error: <error>`

### 4.3 Log Filter & Rejection (`src/send.js`)
Setiap kali ada data yang diabaikan/dilewati, catat dengan log level `WARN`/`INFO`:
* `[WARN:DROP] [TAF] Dilewati karena tidak ada delimiter '=' | Stasiun: <icao> | Teks: "<line>"`
* `[WARN:DROP] [TAF] Dilewati oleh filter regionalCode (<regionalCode>) | Teks: "<line>"`
* `[INFO:SKIP] [TAF] Dilewati karena bertanda NIL | Stasiun: <icao>`

### 4.4 Log Ekstraksi File (`src/opmet.js`)
* `[FILE:READ] Membaca file: <nama_file> (<type>)`
* `[FILE:EXTRACT] <nama_file>: Berhasil mengekstrak X grup buletin`
* `[FILE:ARCHIVE] Memindahkan <nama_file> ke trash`

---

## 5. Kriteria Penerimaan (Acceptance Criteria)
- [ ] Setiap eksekusi query MySQL (sukses insert, update duplicate, maupun gagal) mencetak log terstruktur yang memuat ICAO dan statusnya.
- [ ] Log pengiriman IDOP dan log query MySQL memiliki format yang dapat dikorelasikan (traceable) per stasiun.
- [ ] Jika terjadi kegagalan query SQL (misal error format tanggal/datetime), error dicetak lengkap beserta nilai parameter yang dikirim.
- [ ] Setiap kondisi `return;` (data drop) mencetak log peringatan beserta teks mentahnya.
