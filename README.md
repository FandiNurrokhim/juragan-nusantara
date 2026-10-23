# Juragan Nusantara

Permainan papan **3D** bertahan hidup di tengah ekonomi Indonesia untuk **2–20 pemain**. Bisa juga main bareng **bot**. Setiap pemain memakai HP atau laptopnya sendiri, dan semua tersambung secara real time lewat **Wi-Fi yang sama**. Server tetap berjalan di laptopmu dan permainan tidak butuh internet: perangkat lain cukup membuka alamat laptop itu di browser.

## Yang dibutuhkan

- Satu komputer (Windows, macOS, atau Linux) dengan **Node.js versi 18 atau lebih baru**. Unduh dari nodejs.org, pilih versi LTS.
- Semua HP dan laptop pemain tersambung ke **Wi-Fi yang sama** dengan komputer itu. Hotspot dari salah satu HP juga bisa.
- Browser yang mendukung grafis 3D (WebGL): Chrome, Edge, Firefox, atau Safari versi terbaru.

## Cara menjalankan

1. Buka terminal atau Command Prompt di folder ini.
2. Pasang paket (cukup sekali, dan butuh internet hanya untuk langkah ini):
   ```
   npm install
   ```
3. Jalankan server:
   ```
   npm start
   ```
4. Terminal akan menampilkan alamat seperti `http://192.168.1.5:3000` beserta kode QR-nya.
   - Di komputer server, buka `http://localhost:3000`.
   - Di HP teman, pindai QR atau ketik alamat tadi di browser.
5. Isi nama, lalu atur avatar: pilih model bidak, unggah foto wajah (PNG), lalu pilih warna, baju, topi, aksesoris, dan warna kulit.
6. Pemain pertama yang bergabung menjadi **host**. Di lobi, host bisa:
   - **Tambah bot** untuk mengisi kursi kosong (maksimal 20 pemain),
   - **Hapus/keluarkan** bot atau pemain sampai tersisa minimal 2,
   - lalu menekan **Mulai permainan**.

**Layar TV atau proyektor:** buka alamat yang sama lalu pilih "Tonton saja", atau tambahkan `?tv` di akhir alamat.

## Kalau HP tidak bisa membuka alamatnya

- Pastikan HP tidak memakai data seluler dan benar-benar tersambung ke Wi-Fi yang sama.
- **Windows:** saat muncul peringatan Windows Defender Firewall, centang **Private networks** lalu klik **Allow**. Kalau terlanjur ditolak, buka Windows Security → Firewall → *Allow an app through firewall*, lalu izinkan **Node.js**.
- **macOS:** klik **Allow** saat ditanya apakah `node` boleh menerima koneksi masuk.
- Beberapa Wi-Fi kantor, kampus, atau kafe memblokir koneksi antarperangkat (fitur *client isolation*). Pakai hotspot HP sebagai gantinya.
- Port 3000 sudah dipakai program lain? Jalankan dengan port lain: `PORT=4000 npm start` (macOS/Linux) atau `set PORT=4000 && npm start` (Windows).

## Aturan singkat

**Inti permainan: bertahan selama mungkin.** Pemenangnya adalah pemain terakhir yang belum gugur, meski sebenarnya semua sama-sama susah ekonominya.

- Setiap pemain mulai dengan **Rp 10.000.000**. Gaji **Rp 5.000.000 setiap satu putaran** (melewati Mulai), ditambah **Rp 1.000.000 per tambang/kebun sawit** yang beroperasi.
- Berhenti di kota kosong: boleh dibeli.
- **Punya semua kota sewarna** (misalnya Kupang dan Ambon): semua sewa di kota-kota itu otomatis **×2**, baik tanah kosong maupun yang sudah dibangun.
- **Berhenti di tanah orang lain atau petak pajak** memunculkan pop-up tagihan berisi jumlah yang harus dibayar, lengkap dengan tombol **Bayar**.
  - Uang kurang? **Pinjam ke bank** dengan menggadaikan aset atau menjual bangunan (setengah harga bangunan). **Nilai gadai = setengah dari harga tanah + bangunan + biaya usaha di atasnya**, jadi tanah berbangunan bisa digadai dengan nilai lebih tinggi. Bangunan di tanah yang digadai ikut jadi jaminan dan baru bisa dijual setelah ditebus.
  - Sudah tidak punya aset dan tetap tidak sanggup bayar: **gugur**.
- Uang minus karena Musibah juga harus dilunasi lewat gadai. Kalau tidak ada lagi yang bisa digadaikan, kamu gugur otomatis. Menebus gadai kena bunga 10%.
- **Pemain yang gugur:** semua tanah dan bangunannya disita negara dan kembali jadi tanah kosong yang bisa dibeli siapa saja.
- **Upgrade tanah** kota milikmu kapan saja saat giliranmu, tanpa harus punya satu warna lengkap:
  - 🏠 **Rumah** (sampai 4) lalu **hotel**: sewa naik.
  - ⛏️ **Tambang** (Rp 1 jt) atau 🌴 **Kebun sawit** (Rp 500 rb): tambah gaji Rp 1 jt tiap gajian. Hanya untuk tanah tanpa bangunan.
  - Setiap **berhenti di tanah sendiri**, muncul pop-up "Upgrade tanah ini?" berisi pilihan dan harganya. Bisa dilewati.
  - Setiap gajian dapat **voucher subsidi** (diskon 50% untuk 1 upgrade, misalnya KPR bersubsidi). Kartu **"Pujianmu Bagus, Boomer Suka"** memberi 1 upgrade gratis.
- 🍱 **Dapur Gizi Gratis** (Rp 10 jt, hanya di tanah tanpa bangunan): memberi **Rp 300 rb di awal setiap giliranmu**. Risikonya, setelah masa aman 2 gajian, ada peluang 8% per giliran **siswa keracunan**. Pilihannya bayar denda Rp 3 jt, atau dapur **ditutup BPOM dan dibongkar** (tanahnya kembali kosong dan modal Rp 10 jt hangus).
- **Risiko tambang, sawit & dapur:** usaha yang dibangun **sebelum pemiliknya gajian 2 kali** dapat masa aman 2 gajian (ikon 🛡️). Usaha yang baru dibangun setelah itu langsung bisa kena kejadian acak, tanpa masa aman. Di awal giliranmu ada peluang acak kecil (tambang ditutup akamsi 5%, sawit terbakar 10%, dapur keracunan 8%). Tambang yang sedang disegel tidak bisa disegel lagi, dan setelah segel dibuka atau api dipadamkan, tanah itu aman lagi 2 putaran.
  - 🔥 Kebun sawit terbakar: bayar Rp 500 rb untuk memadamkan, atau biarkan hangus jadi tanah kosong.
  - ⛏️ Tambang ditutup akamsi selama 5 giliran (tanpa penghasilan). Bayar Rp 1 jt untuk memangkas tiap giliran, atau Rp 5 jt untuk buka langsung (lewat detail tanah).
- **Penjara:** keluar dengan dadu kembar, denda Rp 500.000, atau kartu Orang Dalam. Selama dipenjara, **uang yang mestinya kamu terima (misalnya sewa) masuk kas negara**.
- **Travelling** (pojok kiri atas): bebas pilih kotak tujuan mana saja. Kalau melewati Mulai, tetap gajian.
- Papan tidak punya stasiun, pelabuhan, atau bandara. Ada **5 petak Musibah** (minimal satu di tiap sisi) **dan 5 petak Kesempatan** (selalu berjarak minimal 2 petak satu sama lain). **PLN dan PDAM:** sewa 4× angka dadu × Rp 10 rb, atau 10× kalau punya keduanya.
- **Pajak:** Pajak Penghasilan Rp 1 jt, Pajak Barang Mewah Rp 750 rb.
- **Melempar dadu:** tahan tombol **🎲 Tahan untuk membidik**. Bar angka 2–12 bergerak naik-turun, lalu lepas di angka yang kamu mau. Peluang hasilnya tepat sesuai bidikan = stat **kontrol dadu** avatarmu, sisanya tetap acak. Di penjara dadu selalu acak. Tombol Spasi melempar tanpa membidik.
- **Stat avatar** (model bidak) menentukan diskon beli tanah, diskon bangun/upgrade, kontrol dadu, dan modal awal. Model dengan kontrol dadu tinggi (Angkot, Pocong, Tuyul, Monster) hanya mulai dengan Rp 5 jt. Stat tampil di editor avatar dan bisa diatur di `AVATAR_STATS` dalam `board.js`.
- **Dadu kembar:** lempar lagi. Kembar 3 kali berturut-turut langsung masuk penjara.

## Kartu Kesempatan dan Musibah

Kartu yang dibuka tampil sebagai pop-up di semua layar dan **tidak tertutup otomatis**. Tekan **Tutup** setelah selesai membaca.

**Kartu tidak berulang:** kartu yang sudah keluar disisihkan sampai seluruh tumpukan habis, baru semuanya dikocok ulang. Jadi setiap kartu pasti sempat muncul. Pojok pop-up menunjukkan sisa kartu sebelum pengocokan berikutnya.

**Musibah (merah)** langsung berlaku sesuai tulisan di kartunya.
- **Bencana bersama** (kena semua pemain, Doa Orang Tua tidak mempan): harga cabai meroket, banjir kiriman, gelombang PHK, PPN naik lagi, gempa bumi, mudik macet total, kabut asap karhutla, rupiah anjlok.
- **Musibah pribadi** (kalau menyimpan Doa Orang Tua, kamu ditanya dulu mau menolaknya atau tidak): pinjol sebar data, tanah disita negara, kena mafia tanah, pungli, razia, salah ngetwit (UU ITE), robot trading, proyek strategis nasional, BPJS nunggak, file Paket.apk, terseret kasus.
- **Musibah Spesial** ☠️ (satu-satunya yang memakai **1 dadu**: hasil 1–2, 3–4, dan 5–6 berbeda, ditekan lewat tombol **Kocok dadu**): setelah semua pemain gajian 2 kali, kartu yang sangat berat masuk ke tumpukan, yaitu Krismon Jilid 2, Pagebluk & PPKM, Moratorium Tambang & Sawit, Gagal Bayar Utang Negara, dan Gempa Megathrust.

**Kesempatan (hijau)** sengaja tidak terlalu kuat: bansos, lembur, cashback, arisan, tiket promo ke Travelling, undian minimarket, tes CPNS, serta:

| Kartu | Efek |
|---|---|
| 🔄 Putar Balik Fakta | Pemain terkaya **selain kamu** menukar seluruh uang tunainya dengan pemain termiskin. Tidak pernah merugikan pengambil kartu. |
| 👴 Pujianmu Bagus, Boomer Suka | 1 upgrade tanah gratis dari pejabat. |
| 🙏 Doa Orang Tua *(sakti)* | Pakai: Rp 500 rb. Disimpan: menangkis Mafia Tanah dan Buzzer, atau menolak satu Musibah pribadi. |
| 📢 Buzzer *(sakti)* | Satu lawan membayar Rp 500 rb kepadamu. |
| 🕴️ Mafia Tanah *(sakti)* | Rebut satu tanah lawan yang belum ada bangunannya. |
| 🤝 Orang Dalam *(sakti)* | Keluar penjara gratis. |

Kartu *sakti* bisa **disimpan** atau **langsung dipakai**.

**✨ Kesempatan Ultra Rare**: setiap mengambil Kesempatan ada peluang 0,5% kartu diganti kartu Ultra Rare. Masing-masing kartu paling banyak keluar sekali per permainan. Saat keluar, layar dan papan berguncang dan backsound khususnya berbunyi.
- 👑 **Orang Luar Negeri Beli Pulau**: +Rp 30 jt, merebut tanah termahal dari pemain terkaya lain, dan 2 upgrade gratis.
- 🎖️ **Pejabat Tanpa Ijazah** (5 giliranmu): sekali tiap giliran boleh **mengambil alih** tanah/bangunan milik pemain lain, dan sekali tiap giliran boleh **mengklaim tanah kosong** lalu langsung membangun apa pun secara gratis (rumah, hotel, tambang, kebun sawit, atau Dapur Gizi). Selama menjabat, memadamkan kebakaran dan membuka segel akamsi gratis. Tombolnya ada di panel *Kartu & voucher*.

Peluangnya diatur di `ULTRA_RARE_CHANCE` dan lama jabatan di `PEJABAT_TURNS`, keduanya di `board.js`.

## Mode Normal

Dipilih di lobi (tombol **WNI / Normal**) sebelum permainan dimulai. Aturan di atas berlaku untuk mode WNI; mode Normal berbeda:

- **Papan 32 petak ala Get Rich**, 8 petak per sisi. Sudutnya: Mulai, 🌴 Pulau Terpencil (penjara), 🎪 Festival, dan 🧳 Travelling. Tidak ada Musibah, PLN, atau PDAM, dan petak Pajak hanya satu.
- **4 tempat wisata**, satu di tiap sisi: Labuan Bajo, Danau Toba, Borobudur, Raja Ampat. Tempat wisata **tidak bisa diambil alih** dan tidak bisa dikontrak. Tiap kali pemiliknya berhenti di sana, tingkatnya naik gratis (Destinasi → Ramai → Populer → Landmark pada kunjungan ke-3) dan bangunannya di papan ikut berubah. Sewa per tingkat naik sedikit saja, tapi dikali jumlah wisata milik pemiliknya: punya 2 = ×2, punya 3 = ×3 di semua wisatanya. **Kuasai keempatnya = langsung menang.** Begitu ada pemain yang punya 3, semua pemain diberi peringatan supaya mengamankan wisata terakhir.
- **Batas waktu 60 menit** (kedua mode): 5 menit sebelum habis ada peringatan; saat waktu habis permainan selesai otomatis dan pemain (atau tim) dengan total kekayaan terbesar menang. Jam di pojok papan menunjukkan lama main / batas waktu. Atur di `GAME_MINUTES` (`board.js`).
- **Waktu tunggu giliran 10 detik** (kedua mode): ada hitung mundur ⏳ di label giliran. Pemain yang diam lebih dari 10 detik dijalankan otomatis: lempar dadu, pilihan aman (tidak membeli, tidak mengambil alih, kartu disimpan, tetap di tempat), bayar tagihan kalau uangnya cukup, lalu selesai giliran. Atur di `TURN_IDLE_SECONDS`.
- **Pajak dinamis** (kedua mode): tarif dasar petak pajak + Rp 200 rb per properti yang dimiliki (yang digadai tidak dihitung). Atur di `TAX_PER_PROPERTY`.
- **4 cara menang** (ala Get Rich), dicek otomatis setiap saat. Kartu pemain menunjukkan kemajuannya (📏 line, 🎨 triple, 🏝️ wisata), dan semua pemain diberi peringatan kalau ada yang tinggal selangkah lagi:
  - **Bangkrut**: semua lawan bangkrut.
  - **Tourism Monopoly**: menguasai 4 tempat wisata.
  - **Line Monopoly**: menguasai semua properti di satu sisi papan (kota dan tempat wisata di sisi itu).
  - **Triple Monopoly**: menguasai 3 kawasan warna penuh, misalnya coklat, biru muda, dan pink.
- **Main tim**: di lobi host bisa memilih *Main tim (2 orang)*. Pemain dipasangkan berdua (4 pemain = 2 tim, 6 pemain = 3 tim), satu tim satu warna, dan giliran bergantian antar tim. Tombol *Acak tim* mengacak pasangan. Rekan setim tidak saling menagih sewa, tidak bisa saling serang atau ambil alih, dan semua kondisi menang dihitung gabungan satu tim.
- Modal awal Rp 15 jt untuk semua avatar, gaji Rp 5 jt tiap melewati Mulai.
- **Festival**: sewa satu propertimu ×2; festival lagi di properti yang sama jadi ×4, ×8, … maksimal ×80. Festival di tempat lain mengakhiri festival sebelumnya.
- **Mesin Game**: pilih taruhan Rp 300 rb, Rp 1 jt, atau Rp 3 jt, lalu cocokkan gulungan. Hadiah = taruhan × pengali (2 sama 1,5×, 3 sama 10×, tiga angka 7 25×).
- **Skill avatar** lebih sering aktif (peluang 45–80%; Kokok Pagi paling banyak sekali per giliran, Terbang Bebas milik Pesawat istirahat 1 giliran setelah aktif). Muncul notifikasi kecil setiap skill atau liontinmu aktif, dan peluangnya bisa diatur lewat `chance` di `NORMAL_AVATARS` (`board.js`).
- **Tingkat bangunan kota**: Tanah → 🏡 Desa → 🏘️ Kota → 🏙️ Kabupaten → 🏛️ Landmark (tidak ada rumah ke-4). Saat berhenti di kota kosong muncul pop-up *Beli & bangun*: tanah wajib, lalu pilih langsung sampai Desa, Kota, atau Kabupaten sekaligus; pop-up menunjukkan biaya bangun, diskon avatar, dan sewa yang didapat. Kabupaten baru terbuka setelah melewati Mulai sekali.
- **Landmark** hanya dari Kabupaten: saat kamu berhenti lagi di kota itu, atau saat berhenti **tepat di Mulai** (boleh membangun di salah satu propertimu). Harga Landmark 2× harga satu tingkat. Membangun hanya bisa saat berhenti di propertimu sendiri, di Mulai, atau saat membeli.
- **Ambil alih**: setelah membayar sewa di kota lawan yang belum Landmark, kamu boleh membelinya paksa seharga 2× nilai tanah + bangunan. Avatar Manusia (**Raja Akuisisi**) cukup 1,5× dan satu-satunya yang bisa mengambil alih Landmark.
- **Penjara / Pulau Terpencil**: dapat dadu kembar = langsung bebas dan jalan, atau bayar Rp 500 rb untuk langsung bebas lalu lempar dadu.
- Punya semua kota sewarna: sewa semua kota itu ×2 (berlaku di kedua mode).
- Petak yang sewanya berlipat (satu warna, jumlah wisata, festival) diberi tanda ×2, ×4, ×6, … di papan. Petak festival juga diberi aurora berpendar, umbul-umbul, dan lampu.
- **Bangkrut**: bank hanya mau meminjami kalau masih ada aset yang belum digadai. Kalau semua aset sudah digadai dan uang tidak cukup membayar, satu-satunya pilihan adalah bangkrut (berlaku di kedua mode).
- Setelah mengambil alih Kabupaten lawan, kamu langsung ditawari menjadikannya Landmark.
- **Tidak ada cicilan sewa** di mode Normal: bayar langsung, pakai kartu Angel / Bebas Sewa, atau cari uang dengan gadai dan pinjam bank. Mode WNI tetap bisa mencicil.
- Tiap avatar punya **skill unik** (lihat `NORMAL_AVATARS` di `board.js`), dan kartu Kesempatan mode Normal berisi kartu serangan dan pertahanan seperti Sabotase, Akuisisi, Kontrak, Gempa, Wabah, Panggil, Tukar, dan Angel.

Isi papan diatur di `NORMAL_BOARD`, angka-angkanya di `NORMAL` (termasuk `tourismRent` dan `tourismWin`), keduanya di `board.js`.

### Liontin (mode Normal)

Sebelum permainan dimulai, tiap pemain bisa memasang sampai **4 liontin** di lobi (bot memilih acak). Liontin memberi stat tambahan atau efek khusus yang berbeda dari skill avatar, misalnya Tiket Pesawat (setelah bayar sewa 35% langsung Travelling), Arsitek Kilat (12% bangunan langsung jadi Landmark), atau **Dadu Ganjil-Genap**: sebelum melempar pilih Ganjil atau Genap, petak tujuan yang mungkin diberi tanda kuning, jatah 5× per permainan dan bisa dibeli lagi Rp 3 jt per 1×.

Daftar liontin ada di `pendants.json`. Untuk menambah liontin cukup tambah satu entri di file itu; server membacanya ulang otomatis dan langsung mengirimnya ke semua pemain (tidak perlu restart). Entri yang salah dilewati dan peringatannya muncul di terminal server.

```json
{ "id": "contoh", "name": "Contoh", "icon": "✨", "desc": "Teks yang dilihat pemain.",
  "stats": { "land": 0.1, "build": 0.05, "dice": 0.1 },
  "effects": [{ "on": "salary", "do": "money", "amount": 500000, "chance": 0.5 }, { "mod": "tax", "value": -0.5 }] }
```

- `stats`: tambahan diskon tanah (`land`), diskon bangun (`build`), kontrol dadu (`dice`).
- `mod` (pengubah angka): `doubles` (peluang dadu kembar), `parity` (jatah dadu ganjil-genap), `tax` (−0,5 = pajak setengah), `slotLuck`, `festivalStep`, `tourismRent`, `loanInterest` (−1 = tanpa bunga), `loanLimit` (rupiah).
- `on` (kejadian): `start`, `salary`, `afterRent`, `receiveRent`, `landStart`, `landOwn`, `landRival` (berhenti di properti lawan), `rivalLands` (lawan berhenti di propertimu), `build`, `jail`, `card`, `attacked`, `buildingLost`, `takenOver`.
- `do` (efek): `money` (`amount`), `moneyPerProperty` (`amount`, `max`), `pctOfAmount` (`pct` dari sewa/harga kejadian itu), `travel`, `voucher`, `card` (`card`: id kartu atau `"random"`), `buildToken` (bangunan berikutnya gratis), `landmark`, `levelUp`, `escape`, `block`, `blackout` (`turns`: petak lawan padam, bebas sewa), `disaster` (properti lawan turun satu tingkat, tanah kosong lepas ke negara), `pull` (`range`: tarik lawan di sekitar ke propertimu).
- `chance` (opsional): peluang efek itu terjadi, 0–1.

## Fitur

- **Papan 3D** (Three.js): putar dengan geser, perbesar dengan cubit/scroll, ketuk petak untuk melihat detailnya. Tombol 🎯 Ikuti membuat kamera mengikuti bidak yang sedang jalan.
- **Model bidak**: Manusia, Pejabat Gendut, Kepala Sawit, Monster, Tuyul, Pocong, Kucing, Komodo, Ayam Jago, Angkot, atau Pesawat, supaya pemain mudah dibedakan. Foto tampil di wajah (manusia, pejabat, kepala sawit, tuyul, pocong), medali (hewan dan monster), atau kaca depan (kendaraan).
- **Avatar 3D** setiap pemain dengan wajah dari foto yang diunggah, serta pilihan warna, baju (kaos, kemeja, batik, jas, hoodie, kebaya), rambut (pendek, panjang, kuncir, botak), topi (peci, topi, blangkon, helm proyek, caping, mahkota), aksesoris (kacamata hitam, kalung emas, dasi kupu-kupu, koper uang, kumis, masker, headphone, tas selempang), dan warna kulit. Avatar hanya bisa diubah di lobi. Setelah permainan dimulai, avatar dikunci supaya stat model tidak bisa ditukar di tengah jalan.
- **Bot** dijalankan oleh server: membeli tanah, upgrade tanah, membayar tagihan, menggadaikan aset, travelling, dan memakai kartu sakti.
- **Suara khusus saat gajian dan saat menerima sewa** dari pemain lain (hanya di layar penerima), disertai notifikasi dan kartu pemain yang berkedip hijau.
- **Musik latar gamelan dan efek suara**: langkah bidak, dadu, buka kartu, Kesempatan, Musibah, masuk penjara, terima/bayar uang, beli tanah, upgrade, travelling, kartu sakti, gugur, dan akhir permainan. Tombol 🎵 dan 🔊 mematikan musik atau efek di perangkat masing-masing. Suara mulai setelah layar disentuh sekali (aturan browser).
- **Bisa menyambung ulang:** kalau HP terkunci atau browser tertutup, buka lagi alamatnya dan kamu langsung kembali ke kursimu. Pemain manusia yang benar-benar hilang bisa dilewati gilirannya oleh host.
- **Permainan tersimpan otomatis** di `game-state.json` (foto avatar di folder `avatars/`), jadi server boleh dimatikan lalu dinyalakan lagi untuk melanjutkan. Untuk mulai dari nol, pilih **⏹ Akhiri → Game baru dari awal** di laptop server, atau hapus file itu.
- **Tombol ⏹ Akhiri hanya ada di laptop server** (dibuka lewat `localhost` atau alamat Wi-Fi laptop itu sendiri). Dari situ permainan bisa dihentikan kapan saja untuk melihat peringkat, atau diulang dari awal. HP pemain lain tidak melihat tombol ini, dan server menolak perintahnya kalau dikirim dari perangkat lain.

## Mengubah isi permainan

Semua data ada di **`board.js`**:

- **Nama kota, harga, sewa, harga rumah.** Angka ditulis dalam satuan Rp 10.000, jadi `60` artinya Rp 600.000.
- **Teks dan efek kartu** Kesempatan, Musibah, Musibah Spesial, dan kartu sakti (format efeknya dijelaskan di komentar file).
- **Harga tambang/sawit, tambahan gaji, peluang kejadian acak, diskon voucher** di objek `LAND`.
- **Uang awal, gaji, denda penjara**, dan pilihan baju/topi/aksesoris.

Setelah mengubah file, matikan server (Ctrl+C), hapus `game-state.json`, lalu jalankan `npm start` lagi.

**Mengganti musik atau efek suara:** timpa file mp3 di `public/sounds/` dengan milikmu sendiri, dengan nama file yang sama (misalnya `bgm.mp3` untuk musik latar). Kalau mengganti `bgm.mp3`, hapus juga `public/sounds/meta.json` supaya lagumu diputar sampai habis sebelum diulang. Suara bawaan dibuat oleh `npm run sounds`. Untuk membuat ulang sebagian saja tanpa menimpa yang lain, sebutkan namanya, misalnya `node tools/make-sounds.mjs gajian sewa ultra`.

## Struktur proyek

```
server.js            server + semua aturan permainan + bot (sumber kebenaran)
board.js             data papan, kartu, dan pilihan avatar
public/index.html    tampilan dan gaya
public/js/app.js     logika layar: lobi, editor avatar, giliran, kartu, suara
public/js/scene.js   papan 3D, bidak, dadu, tumpukan kartu
public/js/avatar.js  karakter avatar 3D dan pratinjau editor
public/js/sound.js   pemutar musik latar & efek suara
public/sounds/       file mp3
tools/make-sounds.mjs  pembuat suara bawaan
test/bots.js         uji otomatis: 2 pemain + 4 bot bermain sampai tinggal satu yang bertahan
```

Server memegang seluruh aturan, sementara browser hanya mengirim aksi seperti "lempar dadu" atau "beli". Karena itu pemain tidak bisa curang dengan mengubah kode di HP-nya.

**Menjalankan uji otomatis:** jalankan `BOT_SPEED=200 PORT=3100 node server.js` di satu terminal (di Windows: `set BOT_SPEED=200 && set PORT=3100 && node server.js`), lalu `npm test` di terminal lain.
