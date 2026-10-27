'use strict';

const K = 10000;
const START_MONEY = 1000 * K;   // Rp 10.000.000
const SALARY = 300 * K;         // gaji Rp 1.000.000 setiap satu putaran (melewati Mulai)
const JAIL_FINE = 50 * K;       // denda keluar penjara
const DOA_REWARD = 50 * K;      // Doa Orang Tua dipakai langsung: rezeki Rp 500 rb
const BUZZER_FEE = 50 * K;      // Buzzer: lawan bayar Rp 500 rb

const LAND = {
  kprDiscount: 0.5,
  tambangCost: 100 * K,
  sawitCost: 50 * K,
  income: 75 * K,
  maxVouchers: 2,
  closeChance: 0.05,
  fireChance: 0.10,
  graceLaps: 2,
  fireCost: 50 * K,
  closeTurns: 5,
  reopenCost: 100 * K,
  specialAfterLaps: 2,
  dapurCost: 1000 * K,          // Rp 10 jt
  dapurIncome: 30 * K,          // Rp 300 rb di awal setiap giliran pemilik
  poisonChance: 0.08,           // peluang "siswa keracunan" di awal giliran (setelah masa aman)
  poisonFine: 300 * K           // denda Rp 3 jt; kalau tidak dibayar, dapur ditutup BPOM dan dibongkar
};

const city = (name, group, price, rent, house) => ({
  type: 'city', name, group, price: price * K, rent: rent.map(r => r * K), house: house * K
});
const utility = name => ({ type: 'utility', name, price: 150 * K });
const chance = () => ({ type: 'kesempatan', name: 'Kesempatan' });
const musibah = () => ({ type: 'musibah', name: 'Musibah' });

const BOARD = [
  { type: 'start', name: 'Mulai' },
  city('Kupang', 'coklat', 60, [2, 10, 30, 90, 160, 250], 50),
  musibah(),
  city('Ambon', 'coklat', 60, [4, 20, 60, 180, 320, 450], 50),
  { type: 'tax', name: 'Pajak Penghasilan', amount: 100 * K },
  musibah(),
  city('Mataram', 'biru-muda', 100, [6, 30, 90, 270, 400, 550], 50),
  chance(),
  city('Palu', 'biru-muda', 100, [6, 30, 90, 270, 400, 550], 50),
  city('Kendari', 'biru-muda', 120, [8, 40, 100, 300, 450, 600], 50),
  { type: 'jail', name: 'Penjara' },
  city('Pontianak', 'pink', 140, [10, 50, 150, 450, 625, 750], 100),
  utility('PLN'),
  city('Banjarmasin', 'pink', 140, [10, 50, 150, 450, 625, 750], 100),
  city('Samarinda', 'pink', 160, [12, 60, 180, 500, 700, 900], 100),
  chance(),
  city('Padang', 'oranye', 180, [14, 70, 200, 550, 750, 950], 100),
  musibah(),
  city('Pekanbaru', 'oranye', 180, [14, 70, 200, 550, 750, 950], 100),
  city('Palembang', 'oranye', 200, [16, 80, 220, 600, 800, 1000], 100),
  { type: 'travel', name: 'Travelling' },
  city('Manado', 'merah', 220, [18, 90, 250, 700, 875, 1050], 150),
  chance(),
  city('Makassar', 'merah', 220, [18, 90, 250, 700, 875, 1050], 150),
  city('Balikpapan', 'merah', 240, [20, 100, 300, 750, 925, 1100], 150),
  musibah(),
  city('Semarang', 'kuning', 260, [22, 110, 330, 800, 975, 1150], 150),
  city('Yogyakarta', 'kuning', 260, [22, 110, 330, 800, 975, 1150], 150),
  utility('PDAM'),
  city('Malang', 'kuning', 280, [24, 120, 360, 850, 1025, 1200], 150),
  { type: 'gotojail', name: 'Masuk Penjara' },
  city('Medan', 'hijau', 300, [26, 130, 390, 900, 1100, 1275], 200),
  city('Bandung', 'hijau', 300, [26, 130, 390, 900, 1100, 1275], 200),
  musibah(),
  city('Surabaya', 'hijau', 320, [28, 150, 450, 1000, 1200, 1400], 200),
  chance(),
  { type: 'tax', name: 'Pajak Barang Mewah', amount: 75 * K },
  city('Denpasar', 'biru-tua', 350, [35, 175, 500, 1100, 1300, 1500], 200),
  chance(),
  city('Jakarta', 'biru-tua', 400, [50, 200, 600, 1400, 1700, 2000], 200),
];

const GROUP_COLORS = {
  'coklat': '#8b5a3c', 'biru-muda': '#62b8e0', 'pink': '#d65a9e', 'oranye': '#ee8a2e',
  'merah': '#d63b32', 'kuning': '#e8b417', 'hijau': '#2e9e5b', 'biru-tua': '#2b4fa3'
};

const PLAYER_COLORS = {
  merah: '#e04848', biru: '#3a7bd5', hijau: '#22a06b', oranye: '#f08c00', ungu: '#8e5bd6',
  pink: '#e05a9c', toska: '#13a3a3', coklat: '#8b5a3c', hitam: '#3a3a44', emas: '#c9a227',
  lime: '#8bc34a', navy: '#1f3a93', marun: '#8b1e3f', salem: '#f28b6b', lavender: '#b39ddb',
  mint: '#5fd3ad', abu: '#9e9e9e', putih: '#f1f1ec', zaitun: '#7a8b2e', langit: '#5ec8f2'
};

const LOOKS = {
  model: [
    { id: 'manusia', name: '🧑 Manusia', human: true }, { id: 'pejabat', name: '👔 Pejabat Gendut', human: true },
    { id: 'kepalasawit', name: '🌴 Kepala Sawit', human: true }, { id: 'monster', name: '👾 Monster' }, { id: 'tuyul', name: '👶 Tuyul' }, { id: 'pocong', name: '👻 Pocong' },
    { id: 'kucing', name: '🐱 Kucing' }, { id: 'komodo', name: '🦎 Komodo' }, { id: 'ayam', name: '🐓 Ayam Jago' },
    { id: 'angkot', name: '🚐 Angkot' }, { id: 'pesawat', name: '✈️ Pesawat' },
    { id: 'robot', name: '🤖 Robot' }, { id: 'monyet', name: '🐒 Monyet' }, { id: 'superhero', name: '🦸 Superhero' },
    { id: 'ojol', name: '🛵 Ojol' }, { id: 'naga', name: '🐉 Naga' }, { id: 'putri', name: '👸 Putri Keraton' },
    { id: 'harimau', name: '🐯 Harimau' }, { id: 'dukun', name: '🧙 Dukun' }, { id: 'becak', name: '🛺 Becak' },
    { id: 'jawara', name: '🗡️ Jawara' }, { id: 'pedagang', name: '🛒 Pedagang Kaki Lima' }, { id: 'satpol', name: '🚔 Satpol PP' }, { id: 'alien', name: '🛸 Alien' }
  ],
  kulit: ['#f6d5b8', '#e9b98f', '#c98e62', '#a06a43', '#6e4529'],
  rambut: [
    { id: 'pendek', name: 'Pendek' }, { id: 'panjang', name: 'Panjang' }, { id: 'kuncir', name: 'Kuncir' }, { id: 'botak', name: 'Botak' }
  ],
  baju: [
    { id: 'kaos', name: 'Kaos' }, { id: 'kemeja', name: 'Kemeja' }, { id: 'batik', name: 'Batik' },
    { id: 'jas', name: 'Jas' }, { id: 'hoodie', name: 'Hoodie' }, { id: 'kebaya', name: 'Kebaya' }
  ],
  topi: [
    { id: 'none', name: 'Tanpa topi' }, { id: 'peci', name: 'Peci' }, { id: 'topi', name: 'Topi' },
    { id: 'blangkon', name: 'Blangkon' }, { id: 'helm', name: 'Helm proyek' }, { id: 'caping', name: 'Caping' },
    { id: 'mahkota', name: 'Mahkota' }
  ],
  aksesoris: [
    { id: 'none', name: 'Tidak ada' }, { id: 'kacamata', name: 'Kacamata hitam' }, { id: 'kalung', name: 'Kalung emas' },
    { id: 'dasi', name: 'Dasi kupu-kupu' }, { id: 'koper', name: 'Koper uang' }, { id: 'kumis', name: 'Kumis' },
    { id: 'masker', name: 'Masker' }, { id: 'headphone', name: 'Headphone' }, { id: 'selempang', name: 'Tas selempang' }
  ]
};

// Stat tiap model avatar: diskon beli tanah, diskon bangun/upgrade, kontrol dadu (peluang hasil
// sesuai bidikan saat tombol dadu ditahan), dan modal awal. Kontrol dadu tinggi = modal lebih kecil.
const AVATAR_STATS = {
  manusia:     { land: 0.05, build: 0.05, dice: 0.15, start: 1000 * K },
  pejabat:     { land: 0.20, build: 0.15, dice: 0.05, start: 1000 * K },
  kepalasawit: { land: 0,    build: 0.20, dice: 0.10, start: 1000 * K },
  komodo:      { land: 0.15, build: 0,    dice: 0.10, start: 1000 * K },
  ayam:        { land: 0,    build: 0.10, dice: 0.20, start: 1000 * K },
  kucing:      { land: 0.10, build: 0,    dice: 0.25, start: 1000 * K },
  pesawat:     { land: 0.05, build: 0.05, dice: 0.30, start: 1000 * K },
  angkot:      { land: 0,    build: 0,    dice: 0.45, start: 500 * K },
  pocong:      { land: 0,    build: 0,    dice: 0.50, start: 500 * K },
  tuyul:       { land: 0,    build: 0,    dice: 0.50, start: 500 * K },
  monster:     { land: 0,    build: 0,    dice: 0.55, start: 500 * K },
  robot:       { land: 0.05, build: 0.10, dice: 0.20, start: 900 * K },
  monyet:      { land: 0,    build: 0.05, dice: 0.35, start: 700 * K },
  superhero:   { land: 0.05, build: 0.05, dice: 0.20, start: 900 * K },
  ojol:        { land: 0,    build: 0,    dice: 0.40, start: 700 * K },
  naga:        { land: 0.10, build: 0.05, dice: 0.10, start: 1000 * K },
  putri:       { land: 0.15, build: 0.05, dice: 0.10, start: 1000 * K },
  harimau:     { land: 0.05, build: 0,    dice: 0.30, start: 800 * K },
  dukun:       { land: 0.05, build: 0.05, dice: 0.20, start: 800 * K },
  becak:       { land: 0,    build: 0.05, dice: 0.35, start: 700 * K },
  jawara:      { land: 0.10, build: 0.05, dice: 0.15, start: 900 * K },
  pedagang:    { land: 0.05, build: 0.10, dice: 0.15, start: 900 * K },
  satpol:      { land: 0.05, build: 0.05, dice: 0.20, start: 900 * K },
  alien:       { land: 0.05, build: 0.05, dice: 0.20, start: 900 * K }
};

// Pinjaman bank & cicilan sewa.
const BANK = {
  maxLoan: 2000 * K,            // pokok pinjaman maksimal Rp 20 jt
  loanInterest: 0.10,           // bunga 10% sekali di awal (pinjam 10 jt = utang 11 jt)
  loanRepay: 100 * K,           // dipotong otomatis Rp 1 jt setiap gajian
  installmentFee: { 2: 0.05, 4: 0.10, 6: 0.15 } // tambahan biaya cicil sewa untuk pemilik tanah
};

const POWERS = {
  bebassewa: { name: 'Bebas Tol', icon: '🎫', desc: 'Pakai saat ada tagihan sewa di tanah lawan: bebas sewa sekali.' },
  bebaspajak: { name: 'Bebas Pajak', icon: '🧾', desc: 'Disimpan, otomatis membebaskanmu dari petak Pajak sekali.' },
  gempa: { name: 'Gempa Bumi', icon: '🌋', desc: 'Bangunan di satu kota lawan turun 1 tingkat. Landmark kebal.' },
  badai: { name: 'Badai', icon: '🌪️', desc: 'Pilih satu bangunan lawan (termasuk Landmark) untuk diturunkan 1 tingkat.' },
  wabah: { name: 'Wabah', icon: '🦠', desc: 'Sewa semua properti satu lawan turun 50% selama 3 giliran pemiliknya.' },
  panggil: { name: 'Panggil Lawan', icon: '📣', desc: 'Paksa satu lawan pindah ke propertimu dengan sewa termahal; dia langsung membayar sewanya.' },
  tukar: { name: 'Tukar Kota', icon: '🔄', desc: 'Tukar satu kotamu dengan satu kota lawan. Keduanya harus belum Landmark.' },
  // Kartu sakti mode Normal
  sabotase: { name: 'Sabotase', icon: '💣', desc: 'Serang satu properti lawan: sewanya turun 50% selama 3 giliran pemiliknya.' },
  angel: { name: 'Angel', icon: '😇', desc: 'Disimpan: otomatis menangkis serangan kartu lawan. Bisa juga dipakai saat ada tagihan sewa untuk bebas sewa 100%.' },
  akuisisi: { name: 'Akuisisi', icon: '📜', desc: 'Ambil alih gratis satu properti lawan yang belum jadi Landmark, beserta bangunannya.' },
  kontrak: { name: 'Kontrak Sementara', icon: '🔑', desc: 'Satu properti lawan (Landmark juga bisa) jadi milikmu selama 3 giliranmu, lalu kembali ke pemiliknya.' },
  doa: { name: 'Doa Orang Tua', icon: '🙏', desc: 'Pakai sekarang: rezeki Rp 500.000. Kalau disimpan: otomatis menangkis Mafia Tanah dan Buzzer dari lawan, atau bisa dipakai menolak satu Musibah pribadi.' },
  buzzer: { name: 'Buzzer', icon: '📢', desc: 'Giring opini netizen ke satu lawan. Dia harus membayar "biaya klarifikasi" Rp 500.000 kepadamu.' },
  mafia: { name: 'Mafia Tanah', icon: '🕴️', desc: 'Rebut satu tanah milik lawan (yang belum ada bangunannya) dan jadikan milikmu.' },
  orangdalam: { name: 'Orang Dalam', icon: '🤝', desc: 'Punya kenalan orang dalam. Pakai saat di penjara untuk keluar gratis.' },
  dinasti: { name: 'Jalur Dinasti', icon: '👑', desc: 'Satu propertimu kebal terhadap penyitaan, demolition, dan landgrab hingga akhir permainan.' }
};

// Kartu Kesempatan Ultra Rare (0.5% Chance, Max 1x)
// Peluang kartu Ultra Rare menggantikan kartu Kesempatan yang diambil (sekali per permainan).
const ULTRA_RARE_CHANCE = 20;
// Lama masa jabatan kartu Ultra Rare "Pejabat Tanpa Ijazah" (dihitung dari giliran pemiliknya).
const PEJABAT_TURNS = 5;
// Batas waktu satu permainan (menit). Habis waktu: permainan selesai, yang terkaya (atau tim terkaya) menang.
const GAME_MINUTES = 60;
// Pajak dinamis: tarif dasar petak pajak + Rp 200 rb untuk tiap properti yang dimiliki (yang digadai tidak dihitung).
const TAX_PER_PROPERTY = 20 * K;
// Waktu tunggu tiap giliran (detik). Pemain yang diam lebih lama otomatis dijalankan (lempar dadu, pilihan aman, selesai giliran).
const TURN_IDLE_SECONDS = 30;
const TRAVEL_IDLE_SECONDS = 30; // memilih tujuan Travelling butuh waktu lebih lama
const KESEMPATAN_ULTRA_RARE_PEJABAT = {
  title: 'Pejabat Tanpa Ijazah',
  icon: '🎖️',
  special: true,
  ultraRare: true,
  text: 'Ijazahmu entah di mana, tapi kamu tetap dilantik! Selama ' + PEJABAT_TURNS + ' giliranmu: sekali tiap giliran boleh mengambil alih tanah/bangunan milik pemain lain, sekali tiap giliran boleh mengklaim tanah kosong lalu meng-upgrade-nya gratis ke bangunan apa pun, dan kebakaran atau segel akamsi bisa diatasi gratis.',
  effects: [{ type: 'pejabat', turns: PEJABAT_TURNS }]
};
const KESEMPATAN_ULTRA_RARE = {
  title: 'Orang Luar Negeri Beli Pulau',
  icon: '👑',
  special: true,
  ultraRare: true,
  text: 'Kamu berhasil menjual hak guna pulau kosong ke investor asing secara sepihak. Kamu mendadak jadi Sultan!',
  effects: [
    { type: 'receive', amount: 3000 },                   // Terima Rp 30.000.000
    { type: 'stealBest', who: 'richestOther' },           // Rebut tanah termahal (tanpa bangunan) dari pemain terkaya lain
    { type: 'freeUpgrade' },
    { type: 'freeUpgrade' }
  ]
};

const KESEMPATAN = [
  { power: 'doa' },
  { power: 'buzzer' },
  { power: 'mafia' },
  { power: 'orangdalam' },
  { power: 'dinasti' },
  { title: 'Putar Balik Fakta', icon: '🔄', text: 'Kamu menyewa pakar komunikasi. Fakta diputarbalikkan: pemain terkaya (selain kamu) harus menukar seluruh uang tunainya dengan pemain termiskin.', effects: [{ type: 'swapRichPoor' }] },
  { title: 'Pujianmu Bagus, Boomer Suka', icon: '👴', special: true, text: 'Kamu memuji program Pak Pejabat di kolom komentar. Beliau senang sekali! Kamu dapat 1 upgrade tanah gratis (rumah, tambang, atau kebun sawit), bisa dipakai kapan saja saat giliranmu.', effects: [{ type: 'freeUpgrade' }] },
  { title: 'Gajian Lebih Awal', icon: '💼', text: 'Maju ke Mulai dan langsung gajian.', effects: [{ type: 'goto', tile: 0 }] },
  { title: 'Bansos Cair', icon: '📦', text: 'Bansos akhirnya cair, sudah dipotong "uang administrasi". Terima Rp 300.000.', effects: [{ type: 'receive', amount: 30 }] },
  { title: 'Lembur Tiap Hari', icon: '🌙', text: 'Pulang jam 11 malam selama sebulan. Terima uang lembur Rp 500.000.', effects: [{ type: 'receive', amount: 50 }] },
  { title: 'Cashback E-Wallet', icon: '📲', text: 'Dapat cashback belanja. Terima Rp 100.000 (berlaku untuk pembelian berikutnya, katanya).', effects: [{ type: 'receive', amount: 10 }] },
  { title: 'Jual Barang Preloved', icon: '👕', text: 'Baju lebaran tahun lalu laku di marketplace. Terima Rp 2.500.000.', effects: [{ type: 'receive', amount: 250 }] },
  { title: 'Arisan Keluarga', icon: '👪', text: 'Giliranmu dapat arisan. Terima Rp 50.000 dari setiap pemain.', effects: [{ type: 'collectEach', amount: 5 }] },
  { title: 'Tiket Promo', icon: '🎫', text: 'Dapat tiket promo! Maju ke Travelling, lalu bebas pilih tujuan. Kalau melewati Mulai, terima gaji.', effects: [{ type: 'goto', tile: 20 }] },
  { title: 'Undian Minimarket', icon: '🎟️', text: 'Struk belanjamu menang undian berhadiah. Terima voucher Rp 200.000.', effects: [{ type: 'receive', amount: 20 }] },
  { title: 'Tes CPNS', icon: '📝', text: 'Ikut tes CPNS bareng 2 juta pelamar lain, dan ternyata lolos! Terima rapelan gaji Rp 800.000.', effects: [{ type: 'receive', amount: 80 }] },
  { title: 'Anak Titipan', icon: '👶', text: 'Paman mu Wiwi dan Wokwo jadi petinggi BUMN. Tanpa interview, kamu langsung ditunjuk jadi Komisaris Utama. Terima Rp 10.000.000.', effects: [{ type: 'receive', amount: 1000 }] },
  { title: 'Revisi UU Suka-suka', icon: '📜', text: 'Draft undang-undang ketok palu jam 2 pagi saat publik tertidur. Kamu berhak menyita properti bernilai paling tinggi milik pemain terkaya.', effects: [{ type: 'stealBest', who: 'richestOther' }] },
  { title: 'Investasi Bodong Berkedok UMKM', icon: '📈', text: 'Kamu buat proposal modal kerja palsu berkedok binaan dinas. Kumpulkan Rp 100.000 dari setiap pemain.', effects: [{ type: 'collectEach', amount: 10 }] },
  { title: 'Klarifikasi & Minta Maaf', icon: '🙏', text: 'Kamu tertangkap basah melanggar aturan, tapi pakai baju batik, muka sedih, dan buat video klarifikasi. Dapat kartu Orang Dalam untuk keluar penjara gratis.', effects: [{ type: 'giveCard', card: 'orangdalam' }] },
  { title: 'Proyek Jalur Khusus', icon: '🛣️', text: 'Dapat izin bangun tol layang langsung di atas propertimu. Terima upgrade 1 rumah gratis.', effects: [{ type: 'freeUpgrade' }] },
  { title: 'Amnesti Pajak', icon: '🙈', text: 'Petugas pajak pura-pura tidak lihat rekening gendutmu asal setor "uang rokok". Tukar posisi dengan pemain termiskin tapi tetap simpan 50% uangmu.', effects: [{ type: 'receive', amount: 30 }] },
  { title: 'Menang Gugatan Sengketa', icon: '⚖️', text: 'Hakim majelis ternyata sepupumu. Gugatan lahan menang telak! Ambil Rp 200.000 dari pemain terkaya.', effects: [{ type: 'takeFrom', amount: 20, who: 'richestOther' }] },
  { title: 'Jadi Influencer Saham', icon: '📊', text: 'Bikin konten "pom-pom" saham gorengan di TikTok. Pengikutmu rugi, kamu pamer Rubicon. Terima Rp 600.000.', effects: [{ type: 'receive', amount: 60 }] },
  { title: 'Dapat Konsesi Tambang', icon: '⛏️', text: 'Ormas-mu dapat jatah pengelolaan tambang batu bara. Terima Rp 150.000 dari setiap pemain.', effects: [{ type: 'collectEach', amount: 15 }] }
];

const MUSIBAH = [
  { title: 'Harga Cabai Meroket', icon: '🌶️', scope: 'all', text: 'Cabai rawit tembus Rp 150 ribu sekilo. Semua dapur menjerit: semua pemain bayar Rp 300.000.', effects: [{ type: 'pay', amount: 30 }] },
  { title: 'Banjir Kiriman', icon: '🌊', scope: 'all', text: 'Kiriman air dari hulu datang tanpa permisi. Semua pemain bayar Rp 50.000 per properti dan Rp 150.000 per rumah (Rp 500.000 per hotel).', effects: [{ type: 'perProp', amount: 5 }, { type: 'repairs', house: 15, hotel: 50 }] },
  { title: 'Gelombang PHK', icon: '🏭', scope: 'all', text: 'Pabrik tutup, katanya efisiensi, padahal direksinya baru beli mobil. Semua pemain kehilangan Rp 500.000.', effects: [{ type: 'pay', amount: 50 }] },
  { title: 'PPN 12%', icon: '🧾', scope: 'all', text: 'Katanya cuma untuk barang mewah, ternyata kopi sachet juga kena. Semua pemain bayar 12% uang tunai.', effects: [{ type: 'pct', pct: 12 }] },
  { title: 'Gempa Bumi', icon: '🌋', scope: 'all', text: 'Tanah bergoyang tengah malam, semua lari keluar pakai sarung. Tiap pemain kehilangan 1 bangunan.', effects: [{ type: 'demolish' }] },
  { title: 'Mudik Macet Total', icon: '🚗', scope: 'all', text: 'Tol jadi parkiran sepanjang 40 km, THR habis buat bensin dan oleh-oleh. Semua pemain bayar Rp 400.000.', effects: [{ type: 'pay', amount: 40 }] },
  { title: 'Kabut Asap Karhutla', icon: '🔥', scope: 'all', text: 'Langit menguning, sekolah diliburkan. Semua pemain beli masker Rp 100.000, dan pemilik tanah di Sumatera & Kalimantan bayar Rp 500.000 per tanah.', effects: [{ type: 'pay', amount: 10 }, { type: 'perPropIn', amount: 50, groups: ['pink', 'oranye'], tiles: [24] }] },
  { title: 'Rupiah Anjlok', icon: '💸', scope: 'all', text: 'Dolar tembus rekor, harga mi instan ikut naik. Semua pemain kehilangan 5% uang tunai, dan pemain terkaya kehilangan tambahan 15%.', effects: [{ type: 'pct', pct: 5 }, { type: 'pct', pct: 15, who: 'richest' }] },
  { title: 'Stunting Bantuan Pangan', icon: '🥛', scope: 'all', text: 'Anggaran makan gratis dipangkas separator vendor. Semua pemain bayar Rp 200.000 untuk pengobatan pencernaan.', effects: [{ type: 'pay', amount: 20 }] },
  { title: 'Data Publik Bocor', icon: '🔓', scope: 'all', text: 'Hacker "Bjorka-KW" menjual data KTP & NPWP se-Indonesia di forum gelap. Semua pemain kehilangan 10% uang tunai karena saldo rekening terpotong misterius.', effects: [{ type: 'pct', pct: 10 }] },
  { title: 'Stadion Roboh Kena Angin', icon: '🏟️', scope: 'all', text: 'Atap stadion berbiaya triliunan lepas ditiup angin sepoi-sepoi. Semua kontraktor (pemain) wajib urunan repairs Rp 100.000 per bangunan.', effects: [{ type: 'repairs', house: 10, hotel: 25 }] },
  { title: 'Pinjol Sebar Data', icon: '📞', scope: 'self', text: 'Telat bayar sehari, debt collector menagih di grup keluarga. Bayar Rp 100.000 ke setiap pemain sebagai uang malu.', effects: [{ type: 'payEach', amount: 10 }] },
  { title: 'Tanah Disita Negara', icon: '🏛️', scope: 'self', text: 'Sertifikatmu ternyata bermasalah. Satu tanahmu (tanpa bangunan) disita negara. Tidak punya tanah? Denda Rp 500.000.', effects: [{ type: 'seize', fine: 50 }] },
  { title: 'Kena Mafia Tanah', icon: '🕴️', scope: 'self', text: 'Sertifikat palsu beredar! Satu tanahmu (tanpa bangunan) diserobot dan jatuh ke pemain lain. Tidak punya tanah? Bayar pengacara Rp 500.000.', effects: [{ type: 'landgrab', fine: 50 }] },
  { title: 'Kena Pungli', icon: '🤚', scope: 'self', text: 'Urus surat pindah di kantor kelurahan. "Biar cepat, Pak." Bayar Rp 400.000.', effects: [{ type: 'pay', amount: 40 }] },
  { title: 'Razia di Jalan', icon: '👮', scope: 'self', text: 'Ada razia mendadak di tikungan tanpa lampu. "Damai di tempat": bayar Rp 250.000.', effects: [{ type: 'pay', amount: 25 }] },
  { title: 'Salah Ngetwit', icon: '📱', scope: 'self', text: 'Komentarmu soal pejabat viral, lalu kamu dilaporkan pakai UU ITE. Masuk penjara!', effects: [{ type: 'jail' }] },
  { title: 'Robot Trading', icon: '📉', scope: 'self', text: 'Katanya profit 30% per bulan, dijamin halal, ada ustaznya. Aplikasinya hilang: kehilangan 25% uang tunai.', effects: [{ type: 'pct', pct: 25 }] },
  { title: 'Proyek Strategis Nasional', icon: '🚜', scope: 'self', text: 'Kampungmu masuk peta proyek strategis. Satu bangunanmu dibongkar, dapat "ganti untung" Rp 50.000.', effects: [{ type: 'demolish' }, { type: 'receive', amount: 5 }] },
  { title: 'Sakit, BPJS Nunggak', icon: '🏥', scope: 'self', text: 'Tipes kambuh, ternyata iuran BPJS nunggak. Bayar Rp 500.000 dan tidak bisa jalan 1 giliran karena opname.', effects: [{ type: 'pay', amount: 50 }, { type: 'skip', n: 1 }] },
  { title: 'File Paket.apk', icon: '📦', scope: 'self', text: 'Kurir mengirim "foto paket", kamu membukanya. Satu kartu saktimu dicuri. Tidak punya kartu? Rekeningmu bobol Rp 300.000.', effects: [{ type: 'loseCard', fine: 30 }] },
  { title: 'Terseret Kasus', icon: '⚖️', scope: 'self', text: 'Kamu cuma bantu fotokopi berkas, tapi namamu ada di daftar tersangka. Masuk penjara!', effects: [{ type: 'jail' }] },
  { title: 'Kena Offside Etika', icon: '⚖️', scope: 'self', text: 'Batas usiamu belum cukup untuk memegang properti, tapi diloloskan majelis. Karena kontroversi, kamu tidak boleh jalan selama 2 giliran.', effects: [{ type: 'skip', n: 2 }] },
  { title: 'Jet Pribadi Gratifikasi', icon: '🛩️', scope: 'self', text: 'Tertangkap kamera naik jet pribadi kawan pengusaha ke Amerika. Ngakunya "numpang teman". Bayar denda Rp 750.000 untuk bungkam media.', effects: [{ type: 'pay', amount: 75 }] },
  { title: 'Pemadaman Listrik Massal', icon: '💡', scope: 'self', text: 'PLN lupa isi token di gardu utama. Usahamu mati total selama seminggu. Kehilangan 20% uang tunai.', effects: [{ type: 'pct', pct: 20 }] },
  { title: 'Gelar Honoris Causa Palsu', icon: '🎓', scope: 'self', text: 'Beli gelar Doktor dari ruko kosong di luar negeri. Terbongkar netizen X (Twitter)! Bayar Rp 100.000 ke setiap pemain sebagai ganti rugi rasa malu.', effects: [{ type: 'payEach', amount: 10 }] },
  { title: 'Sewa Buzzer Rp 0', icon: '🤖', scope: 'self', text: 'Buzzer yang kamu sewa malah balik menyerangmu karena kuintansi bayarannya membalat. Serahkan 1 kartu sakti milikmu atau bayar denda Rp 300.000.', effects: [{ type: 'loseCard', fine: 30 }] },
  { title: 'Kamu Tercatat Desil 10', icon: '⚖️', scope: 'self', text: 'Pemerintah menempatkanmu ke desl 10 padahal kamu pengangguran yang tidak punya aset, bayar 500.000 ke negara supaya datamu diperbaiki', effects: [{ type: 'pay', amount: 50 }] }
];

const MUSIBAH_SPECIAL = [
  { title: 'Krismon Jilid 2', icon: '💥', scope: 'all', special: true, text: 'Rupiah terjun bebas seperti 1998. Antre sembako di mana-mana.', tiers: [
    { text: 'Semua pemain kehilangan 25% uang tunai.', effects: [{ type: 'pct', pct: 25 }] },
    { text: 'Semua pemain kehilangan 40% uang tunai.', effects: [{ type: 'pct', pct: 40 }] },
    { text: 'Semua pemain kehilangan 50% uang tunai dan 1 bangunan.', effects: [{ type: 'pct', pct: 50 }, { type: 'demolish' }] }] },
  { title: 'Pagebluk & PPKM', icon: '🦠', scope: 'all', special: true, text: 'Wabah baru menyebar. Jalanan disekat, warung disuruh tutup jam 8.', tiers: [
    { text: 'Semua pemain bayar Rp 1.000.000 untuk tes dan obat.', effects: [{ type: 'pay', amount: 100 }] },
    { text: 'Semua bayar Rp 1.000.000 dan tidak bisa jalan 1 giliran.', effects: [{ type: 'pay', amount: 100 }, { type: 'skip', n: 1 }] },
    { text: 'PPKM darurat: semua bayar Rp 1.500.000 dan tidak bisa jalan 2 giliran.', effects: [{ type: 'pay', amount: 150 }, { type: 'skip', n: 2 }] }] },
  { title: 'Moratorium Tambang & Sawit', icon: '🚫', scope: 'all', special: true, text: 'Pemerintah tiba-tiba mengevaluasi semua izin usaha. Katanya demi lingkungan.', tiers: [
    { text: 'Royalti mendadak: bayar Rp 1.000.000 per tambang/kebun sawit.', effects: [{ type: 'perLand', amount: 100 }] },
    { text: 'Semua tambang ditutup 3 giliran dan semua kebun sawit terbakar.', effects: [{ type: 'closeMines', turns: 3 }, { type: 'burnAll' }] },
    { text: 'Satu tambang/kebun sawit tiap pemain dicabut izinnya dan disita negara.', effects: [{ type: 'seizeLand' }] }] },
  { title: 'Gagal Bayar Utang Negara', icon: '🏦', scope: 'all', special: true, text: 'Utang jatuh tempo, kas negara kosong. Rakyat diminta "gotong royong".', tiers: [
    { text: 'Semua pemain bayar Rp 300.000 per properti.', effects: [{ type: 'perProp', amount: 30 }] },
    { text: 'Bank menyita semua properti yang sedang digadaikan.', effects: [{ type: 'seizeMortgaged' }] },
    { text: 'Pemain terkaya "dipinjam" seluruh uang tunainya oleh negara.', effects: [{ type: 'pct', pct: 100, who: 'richest' }] }] },
  { title: 'Gempa Megathrust', icon: '🌋', scope: 'all', special: true, text: 'Skenario terburuk yang selalu diperingatkan BMKG akhirnya terjadi.', tiers: [
    { text: 'Tiap pemain kehilangan 1 bangunan dan bayar Rp 500.000.', effects: [{ type: 'demolish' }, { type: 'pay', amount: 50 }] },
    { text: 'Tiap pemain kehilangan 2 bangunan.', effects: [{ type: 'demolish', n: 2 }] },
    { text: 'Tiap pemain kehilangan 3 bangunan dan bayar Rp 1.000.000.', effects: [{ type: 'demolish', n: 3 }, { type: 'pay', amount: 100 }] }] },
  { title: 'Ibu Kota Pindah', icon: '🏗️', scope: 'all', special: true, text: 'Pemerintah mendadak pindah ibu kota ke tengah hutan. Harga tanah lama anjlok dan biaya pindah mencekik.', tiers: [
    { text: 'Semua pemain bayar pajak pemindahan Rp 500.000.', effects: [{ type: 'pay', amount: 50 }] },
    { text: 'Semua pemain kehilangan 1 bangunan dan bayar Rp 800.000.', effects: [{ type: 'demolish' }, { type: 'pay', amount: 80 }] },
    { text: 'Pembangunan mangkrak! Pemain terkaya disita 50% uang tunainya untuk suntikan APBN emergency.', effects: [{ type: 'pct', pct: 50, who: 'richest' }] }] }
];

// ================= MODE NORMAL =================
// Monopoli "biasa": tanpa Musibah, ekonomi lebih longgar, ada Festival, Mesin Game, Landmark, dan skill unik tiap avatar.
const NORMAL = {
  startMoney: 1500 * K,         // semua avatar mulai dengan modal yang sama: Rp 15 jt
  salary: 500 * K,              // gaji Rp 5 jt tiap melewati Mulai (cukup untuk saling serobot properti)
  takeoverMult: 2,              // ambil alih properti lawan (belum Landmark) = 2x nilai tanah + bangunan
  negoMult: 1.7,                // skill Raja Akuisisi: ambil alih cukup 1,7x
  negoLandmarkMult: 2.5,        // ... tapi mengambil alih Landmark 2,5x
  slumpMult: 0.5,               // kartu Sabotase: sewa jadi 50% ...
  slumpTurns: 3,                // ... selama 3 giliran pemiliknya
  leaseTurns: 3,                // kartu Kontrak Sementara: properti lawan jadi milikmu 3 giliranmu
  festivalMax: 80,              // pengali sewa festival: x2, x4, x8, ... maksimal x80
  lapsForBigBuild: 1,           // Kabupaten (tingkat 3) baru boleh setelah melewati Mulai 1 kali
  levels: ['Tanah', 'Desa', 'Kota', 'Kabupaten', null, 'Landmark'], // tingkat bangunan; 4 tidak dipakai
  landmarkHouses: 2,            // harga Landmark = 2x harga 1 bangunan (total tetap setara 5 rumah)
  slotBet: 30 * K,              // taruhan terkecil Mesin Game Rp 300 rb
  slotBets: [30 * K, 100 * K, 300 * K], // pilihan taruhan: Rp 300 rb, 1 jt, 3 jt; hadiah = taruhan x pengali
  // Peluang (dihitung dari 600 rb putaran simulasi): menang 65%, 3 sama 10,6%, jackpot 2,2%, rata-rata kembali ~1,15x taruhan.
  slotSymbols: ['🍉', '🌶️', '🥥', '🦅', '7️⃣'],
  slotWild: '⭐',               // simbol bintang: dihitung sebagai simbol apa saja
  slotWildChance: 0.1,          // peluang tiap gulungan menjadi bintang
  slotPair: 1.2,                // 2 simbol sama: hadiah 1,2x taruhan
  slotTriple: 3,                // 3 simbol sama: 3x taruhan
  slotJackpot: 8,               // 3 angka 7 (atau 3 bintang): 8x taruhan
  slotRefund: 0.2,              // zonk: 20% taruhan dikembalikan
  maxPendants: 4,               // liontin yang bisa dipasang tiap avatar (daftar di pendants.json)
  parityPrice: 300 * K          // beli 1x jatah dadu Ganjil-Genap
};

// Papan Normal ala Get Rich: 32 petak (8 per sisi), sudut Mulai, Pulau Terpencil, Festival, Travelling.
// 4 tempat wisata (satu per sisi) tidak bisa dibangun & tidak bisa diambil alih; kuasai keempatnya = langsung menang.
const tourism = (name, price, icon) => ({ type: 'tourism', name, group: 'wisata', price: price * K, icon });
const cityOf = name => BOARD.find(t => t.name === name);
const NORMAL_BOARD = [
  { type: 'start', name: 'Mulai' },
  cityOf('Kupang'), cityOf('Ambon'), chance(),
  cityOf('Mataram'), tourism('Labuan Bajo', 150, '🦎'), cityOf('Palu'), cityOf('Kendari'),
  { type: 'jail', name: 'Pulau Terpencil', icon: '🌴' },
  cityOf('Pontianak'), cityOf('Banjarmasin'), { type: 'slot', name: 'Mesin Game' },
  cityOf('Samarinda'), tourism('Danau Toba', 180, '🏞️'), cityOf('Padang'), cityOf('Palembang'),
  { type: 'festival', name: 'Festival' },
  cityOf('Manado'), chance(), cityOf('Makassar'),
  cityOf('Balikpapan'), tourism('Borobudur', 220, '🛕'), cityOf('Semarang'), cityOf('Yogyakarta'),
  { type: 'travel', name: 'Travelling' },
  cityOf('Medan'), tourism('Raja Ampat', 250, '🏝️'), cityOf('Bandung'),
  chance(), { type: 'tax', name: 'Pajak', amount: 100 * K }, cityOf('Denpasar'), cityOf('Jakarta')
];
// Sewa wisata = harga x tourismRent x pengali tingkat x jumlah wisata milik pemiliknya (punya 2 = x2, punya 3 = x3).
// Tingkat naik gratis tiap kali pemiliknya berhenti di sana; kunjungan ke-3 = Landmark. Kenaikannya sengaja kecil.
NORMAL.tourismRent = 0.25;
NORMAL.tourismLevelMult = [1, 1.2, 1.4, 1.7];
NORMAL.tourismLevels = ['Destinasi', 'Ramai', 'Populer', 'Landmark'];
NORMAL.tourismWin = 4;                  // kuasai 4 tempat wisata = langsung menang
GROUP_COLORS.wisata = '#0fb5ae';

// Kesempatan ala Monopoli klasik.
const NORMAL_KESEMPATAN = [
  // --- Gerak ---
  { title: 'Keliling Dunia', icon: '✈️', text: 'Langsung ke Travelling dan bebas pilih tujuan.', effects: [{ type: 'goto', tile: 24 }] },
  // Pindah bebas ke petak mana saja di baris (sisi papan) tempatmu berada
  { title: 'Ojek Online', icon: '🛵', text: 'Pesan ojek online! Bebas pergi ke petak mana saja di baris ini.', effects: [{ type: 'travelRow' }] },
  { title: 'Naik KRL', icon: '🚆', text: 'Naik kereta komuter. Bebas pergi ke petak mana saja di baris ini.', effects: [{ type: 'travelRow' }] },
  { title: 'Sewa Sepeda', icon: '🚲', text: 'Sewa sepeda keliling kota. Bebas pergi ke petak mana saja di baris ini.', effects: [{ type: 'travelRow' }] },
  { title: 'Jalan Pintas', icon: '🛣️', text: 'Ketemu jalan pintas. Bebas pergi ke petak mana saja di baris ini.', effects: [{ type: 'travelRow' }] },
  { title: 'Kirim ke Start', icon: '🏁', text: 'Langsung ke Mulai dan ambil gaji putaran.', effects: [{ type: 'goto', tile: 0 }] },
  { title: 'Bonus Game', icon: '🎰', text: 'Pergi ke Mesin Game terdekat di depanmu dan coba peruntunganmu.', effects: [{ type: 'nextSlot' }] },
  // --- Keuangan & properti ---
  { power: 'bebassewa' }, { power: 'bebassewa' },
  { title: 'Diskon Pembangunan', icon: '🏷️', text: 'Dapat 1 voucher diskon 50% untuk membangun atau mengambil alih kota lawan.', effects: [{ type: 'voucher' }] },
  { title: 'Diskon Ambil Alih', icon: '🏷️', text: 'Dapat 1 voucher diskon 50% untuk membangun atau mengambil alih kota lawan.', effects: [{ type: 'voucher' }] },
  { power: 'bebaspajak' },
  { title: 'Hadiah Emas', icon: '🪙', text: 'Dapat suntikan modal emas. Terima Rp 10.000.000.', effects: [{ type: 'receive', amount: 1000 }] },
  { title: 'Dividen Bank', icon: '🏦', text: 'Bank membagikan dividen. Terima Rp 15.000.000.', effects: [{ type: 'receive', amount: 1500 }] },
  { title: 'Ulang Tahun', icon: '🎂', text: 'Hari ini ulang tahunmu! Terima Rp 500.000 dari setiap pemain.', effects: [{ type: 'collectEach', amount: 50 }] },
  // --- Serangan & pertahanan ---
  { power: 'gempa' }, { power: 'wabah' }, { power: 'panggil' }, { power: 'tukar' },
  { power: 'sabotase' }, { power: 'akuisisi' }, { power: 'kontrak' },
  { power: 'angel' }, { power: 'angel' },
  // --- Bonus (semua kartu Kesempatan menguntungkan pemain yang mengambilnya) ---
  { power: 'badai' },
  { title: 'Tiket Festival', icon: '🎪', text: 'Dapat undangan festival! Langsung ke petak Festival dan adakan festival di propertimu. Kalau melewati Mulai, terima gaji.', effects: [{ type: 'goto', tile: 16 }] },
  { title: 'Bantuan Modal', icon: '💵', text: 'Dapat bantuan modal usaha. Terima Rp 1.500.000.', effects: [{ type: 'receive', amount: 150 }] },
  { title: 'Menang Arisan', icon: '🎉', text: 'Kamu menang arisan! Terima Rp 300.000 dari setiap pemain.', effects: [{ type: 'collectEach', amount: 30 }] },
];

// Mode Normal: stat + skill unik tiap avatar. Skill makin kuat, stat makin kecil, supaya seimbang.
// Stat dasar sama untuk semua avatar (diskon tanah 5%, diskon bangun 5%, kontrol dadu 15%) supaya yang menentukan
// adalah cara bermain. Skill diseimbangkan dari hasil uji ratusan giliran bot: yang terlalu kuat dikurangi, yang lemah dikuatkan.
const NORMAL_AVATARS = {
  manusia:     { land: 0.05, build: 0.05, dice: 0.15, skill: 'nego', icon: '🤝', name: 'Raja Akuisisi', desc: 'Satu-satunya yang bisa mengambil alih Landmark lawan (2,5× nilainya). Ambil alih kota lain cukup 1,7× (pemain lain 2×).', recommend: ['cap_notaris', 'renovasi_gratis', 'bidikan_jitu', 'tiket_pesawat'], recWhy: 'Ambil alih kota lawan lalu Renovasi Gratis bisa langsung menjadikannya Landmark. Bidikan Jitu dan Tiket Pesawat membantu mendarat di kota incaran.' },
  pejabat:     { land: 0.05, build: 0.05, dice: 0.15, skill: 'proyek', chance: 0.9, landChance: 1, rentMult: 1.2, icon: '🏗️', name: 'Proyek Titipan', desc: 'Semua sewa propertimu +20%. 90% peluang bangunan yang kamu bangun gratis, dan beli tanah tanpa bangunan selalu setengah harga.', recommend: ['stempel_dinas', 'arsitek_kilat', 'pemungut_sewa', 'menarik_rezeki'], recWhy: 'Bangun gratis + Arsitek Kilat = cepat punya Landmark. Sewa +20% makin besar dengan Pemungut Sewa dan Menarik Rezeki.' },
  kepalasawit: { land: 0.05, build: 0.05, dice: 0.15, skill: 'panen', amount: 500 * K, icon: '🌾', name: 'Panen Raya', desc: 'Setiap melewati Mulai: gaji +Rp 5 jt dan satu kotamu naik 1 tingkat gratis (sampai Kabupaten).', recommend: ['pupuk_super', 'dadu_kembar', 'magnet_rezeki', 'arsitek_kilat'], recWhy: 'Makin sering lewat Mulai, makin sering gajian dan naik tingkat gratis. Dadu Kembar mempercepat putaran.' },
  komodo:      { land: 0.05, build: 0.05, dice: 0.15, skill: 'seret', chance: 0.15, icon: '🪢', name: 'Seret Lawan', desc: '15% peluang menyeret lawan yang kamu lewati ke propertimu dengan sewa termahal, dan dia langsung membayar sewanya (paling banyak 1 lawan per giliran).', recommend: ['liur_komodo', 'arsitek_kilat', 'panitia_festival', 'pemungut_sewa'], recWhy: 'Lawan diseret ke propertimu yang sewanya paling mahal, jadi besarkan satu properti andalan (Landmark, Festival).' },
  ayam:        { land: 0.05, build: 0.05, dice: 0.15, skill: 'kokok', chance: 0.45, icon: '🐓', name: 'Kokok Pagi', desc: '45% peluang boleh melempar dadu sekali lagi setelah berjalan (sekali per giliran).', recommend: ['jengger_emas', 'makelar_tanah', 'magnet_rezeki', 'dadu_kembar'], recWhy: 'Lempar dadu lagi = lebih sering mendarat dan membeli tanah. Makelar Tanah membuatnya murah.' },
  kucing:      { land: 0.05, build: 0.05, dice: 0.15, skill: 'mulus', chance: 0.75, icon: '🐾', name: 'Mendarat Mulus', desc: '75% peluang sewa yang kamu bayar hanya setengah.', recommend: ['kalung_lonceng', 'kartu_cashback', 'jimat_penangkal', 'tiket_pesawat'], recWhy: 'Gaya bertahan: sewa yang kamu bayar kecil, cashback mengembalikan sebagian, dan serangan sering tertangkis.' },
  pesawat:     { land: 0.05, build: 0.05, dice: 0.15, skill: 'jalan', chance: 0.35, icon: '✈️', name: 'Terbang Bebas', desc: '35% peluang dapat Travelling setelah berhenti di petak yang tidak menagihmu, termasuk setelah membeli atau membangun. Setelah terbang, istirahat 1 giliran.', recommend: ['lounge_bandara', 'makelar_tanah', 'pemandu_wisata', 'tiket_pesawat'], recWhy: 'Terbang bebas memilih tujuan: kejar tanah kosong (murah dengan Makelar Tanah) dan tempat wisata.' },
  angkot:      { land: 0.05, build: 0.05, dice: 0.15, skill: 'setoran', amount: 120 * K, icon: '🚐', name: 'Tarik Setoran', desc: 'Terima Rp 1,2 jt dari setiap lawan yang kamu lewati.', recommend: ['klakson_telolet', 'dadu_kembar', 'magnet_rezeki', 'kredit_lunak'], recWhy: 'Setoran dari setiap lawan yang dilewati: makin banyak bergerak makin banyak setoran.' },
  pocong:      { land: 0.05, build: 0.05, dice: 0.15, skill: 'gentayangan', chance: 0.75, mult: 2, icon: '👻', name: 'Gentayangan', desc: '75% peluang lawan yang berhenti di tanahmu membayar sewa 2×.', recommend: ['kain_kafan', 'arsitek_kilat', 'pemungut_sewa', 'menarik_rezeki'], recWhy: 'Sewa 2× paling terasa di Landmark dan petak Festival. Pemungut Sewa menambah tiap sewa yang masuk.' },
  tuyul:       { land: 0.05, build: 0.05, dice: 0.15, skill: 'colong', chance: 0.8, pct: 0.12, cap: 150 * K, icon: '👶', name: 'Colong Duit', desc: '80% peluang mencuri 12% uang lawan yang kamu lewati atau yang ada di petak tempatmu berhenti (maks Rp 1,5 jt).', recommend: ['kendi_tuyul', 'dadu_kembar', 'bidikan_jitu', 'jimat_penangkal'], recWhy: 'Colong uang lawan yang dilewati atau satu petak denganmu: atur langkah dengan Bidikan Jitu dan Dadu Kembar.' },
  monster:     { land: 0.05, build: 0.05, dice: 0.15, skill: 'teror', chance: 0.75, icon: '👾', name: 'Teror', desc: '75% peluang tidak membayar sewa di tanah lawan.', recommend: ['taring_monster', 'pembawa_bencana', 'petugas_pln', 'kartu_cashback'], recWhy: 'Sering singgah di tanah lawan tanpa bayar: sekalian rusak propertinya dengan Pembawa Bencana atau padamkan listriknya.' },
  robot:       { land: 0.05, build: 0.05, dice: 0.15, skill: 'penagih', chance: 0.45, pct: 0.1, cap: 300 * K, icon: '🤖', name: 'Penagih Utang', desc: '45% peluang lawan yang berhenti di tanahmu juga ditagih 10% dari total kekayaannya (maks Rp 3 jt), bikin lawan cepat terlilit utang.', recommend: ['debt_collector', 'pemungut_sewa', 'arsitek_kilat', 'menarik_rezeki'], recWhy: 'Mode membangkrutkan: makin sering lawan mendarat di tanahmu, makin cepat dia terlilit utang. Debt Collector menambah tagihan tunai.' },
  monyet:      { land: 0.05, build: 0.05, dice: 0.15, skill: 'usil', chance: 0.6, icon: '🐒', name: 'Usil', desc: '60% peluang mencuri 1 kartu sakti acak dari lawan yang kamu lewati atau yang ada di petak tempatmu berhenti.', recommend: ['pisang_ajaib', 'kolektor_kartu', 'dadu_kembar', 'bidikan_jitu'], recWhy: 'Kumpulkan kartu sakti sebanyak-banyaknya lalu serang lawan. Pisang Ajaib dan Kolektor Kartu menambah kartu.' },
  superhero:   { land: 0.05, build: 0.05, dice: 0.15, skill: 'tameng', chance: 0.5, amount: 100 * K, icon: '🦸', name: 'Tameng Baja', desc: '50% peluang menangkis kartu serangan lawan (Sabotase, Akuisisi, Gempa, Badai, Pemadaman, Bencana, dll.), dan penyerangnya membayar Rp 1 jt kepadamu.', recommend: ['jubah_pahlawan', 'jimat_penangkal', 'pemungut_sewa', 'arsitek_kilat'], recWhy: 'Hampir kebal serangan: setiap serangan yang tertangkis justru memberimu uang. Bangun Landmark dengan tenang.' },
  ojol:        { land: 0.05, build: 0.05, dice: 0.15, skill: 'antar', icon: '🛵', name: 'Antar Jemput', desc: 'Setelah dadu dilempar, kamu boleh memilih maju 1 petak lebih sedikit, sesuai dadu, atau 1 petak lebih jauh.', recommend: ['helm_hijau', 'makelar_tanah', 'tiket_pesawat', 'arsitek_kilat'], recWhy: 'Pilih sendiri petak pendaratan (−1/0/+1): hindari tanah lawan yang mahal dan incar tanah kosong.' },
  naga:        { land: 0.05, build: 0.05, dice: 0.15, skill: 'harta', pct: 0.1, cap: 400 * K, icon: '🐉', name: 'Harta Naga', desc: 'Setiap melewati Mulai, dapat bunga 10% dari uang tunaimu (maks Rp 4 jt). Makin kaya, makin cepat bertambah.', recommend: ['mutiara_naga', 'magnet_rezeki', 'dadu_kembar', 'kartu_cashback'], recWhy: 'Simpan uang tunai sebanyak mungkin supaya bunga Harta Naga dan Mutiara Naga makin besar tiap putaran.' },
  putri:       { land: 0.05, build: 0.05, dice: 0.15, skill: 'titah', chance: 0.9, icon: '👸', name: 'Titah Raja', desc: '90% peluang menolak setiap ambil alih atas kotamu, juga kartu Akuisisi, Kontrak Sementara, dan Tukar Properti.', recommend: ['upeti_keraton', 'arsitek_kilat', 'pemungut_sewa', 'panitia_festival'], recWhy: 'Kotamu hampir selalu aman dari perebutan, jadi relatif aman membangun Landmark dan memeras sewa dalam waktu lama.' },
  harimau:     { land: 0.05, build: 0.05, dice: 0.15, skill: 'terkam', chance: 0.5, amount: 50 * K, icon: '🐯', name: 'Terkam', desc: '50% peluang lawan yang kamu lewati terdorong mundur 3 petak dan menjatuhkan Rp 500 rb untukmu.', recommend: ['taring_harimau', 'dadu_kembar', 'bidikan_jitu', 'jimat_penangkal'], recWhy: 'Makin sering melewati lawan makin sering menerkam: bergerak jauh dengan Dadu Kembar dan atur langkah dengan Bidikan Jitu.' },
  dukun:       { land: 0.05, build: 0.05, dice: 0.15, skill: 'santet', amount: 150 * K, icon: '🧙', name: 'Santet', desc: 'Setiap melewati Mulai, lawan terkaya kena santet dan membayar Rp 1,5 jt kepadamu (bisa ditangkis Angel, Jimat, atau Tameng).', recommend: ['boneka_santet', 'magnet_rezeki', 'dadu_kembar', 'kartu_cashback'], recWhy: 'Santet aktif tiap lewat Mulai, jadi percepat putaran dengan Dadu Kembar dan tambah pemasukan saat gajian.' },
  becak:       { land: 0.05, build: 0.05, dice: 0.15, skill: 'pelan', amount: 50 * K, icon: '🛺', name: 'Pelan tapi Pasti', desc: 'Jumlah dadumu tidak pernah kurang dari 5. Setiap kali dadu kecil diganti, kamu dapat ongkos Rp 500 rb.', recommend: ['bel_becak', 'makelar_tanah', 'bidikan_jitu', 'arsitek_kilat'], recWhy: 'Langkahmu selalu cukup jauh untuk mencapai tanah kosong: beli murah dengan Makelar Tanah lalu bangun.' },
  jawara:      { land: 0.05, build: 0.05, dice: 0.15, skill: 'preman', chance: 0.5, icon: '🗡️', name: 'Preman Pasar', desc: '50% peluang lawan yang berhenti tepat di sebelah propertimu ikut membayar setengah sewa properti itu kepadamu.', recommend: ['golok_jawara', 'arsitek_kilat', 'pemungut_sewa', 'makelar_tanah'], recWhy: 'Kuasai kota yang berdampingan supaya hampir setiap petak di sekitarnya jadi daerah kekuasaanmu.' },
  pedagang:    { land: 0.05, build: 0.05, dice: 0.15, skill: 'lapak', amount: 50 * K, icon: '🛒', name: 'Lapak', desc: 'Lawan yang berhenti di petak Kesempatan, Mesin Game, atau Festival jajan di lapakmu: membayar Rp 500 rb kepadamu.', recommend: ['gerobak_dagang', 'bonus_properti', 'magnet_rezeki', 'kredit_lunak'], recWhy: 'Pemasukan dari lapak datang sendiri sepanjang permainan; tambah lagi dengan bonus gajian.' },
  satpol:      { land: 0.05, build: 0.05, dice: 0.15, skill: 'segel', chance: 0.4, icon: '🚔', name: 'Segel Bangunan', desc: 'Setiap melewati Mulai, 40% peluang menyegel bangunan tertinggi milik lawan (termasuk Landmark) sampai jadi tanah kosong. Bisa ditangkis Angel, Jimat, atau Tameng.', recommend: ['surat_teguran', 'dadu_kembar', 'jimat_penangkal', 'pemungut_sewa'], recWhy: 'Segel aktif tiap lewat Mulai: percepat putaran, dan pakai kartu Sabotase dari Surat Teguran untuk terus menekan lawan.' },
  alien:       { land: 0.05, build: 0.05, dice: 0.15, skill: 'lubang', chance: 0.85, turns: 2, icon: '🛸', name: 'Lubang Hitam', desc: '85% peluang saat berhenti di propertimu sendiri: pasang lubang hitam di petak mana saja. Setiap lawan yang berhenti di sana tersedot ke kota tempat lubang itu dibuka, terkurung 2 giliran di sana, dan membayar sewanya (bisa ditangkis Angel, Jimat, atau Tameng). Lubang hitam tetap aktif sampai Alien memindahkannya (boleh dilewati supaya lubang lama tetap dipakai). Alien sendiri bebas bayar sewa/pajak saat berhenti di lubang hitamnya.', recommend: ['kristal_alien', 'arsitek_kilat', 'bidikan_jitu', 'pemungut_sewa'], recWhy: 'Makin sering berhenti di tanah sendiri makin sering membuat lubang hitam. Pasang di depan tanahmu yang mahal supaya lawan terkurung tepat sebelum membayar sewa berikutnya.' }
};

const BOT_NAMES = ['Bot Joko', 'Bot Siti', 'Bot Ucok', 'Bot Made', 'Bot Rina', 'Bot Asep', 'Bot Dewi', 'Bot Bambang',
  'Bot Wawan', 'Bot Sri', 'Bot Yanto', 'Bot Komang', 'Bot Butet', 'Bot Udin', 'Bot Nining', 'Bot Togar',
  'Bot Ayu', 'Bot Slamet', 'Bot Lilis', 'Bot Ogi'];

// ==========================================
// DECK MANAGEMENT & EXECUTOR LOGIC
// ==========================================

// State internal untuk memastikan kartu Ultra Rare hanya dapat ditarik 1x per permainan
let ultraRareDrawn = false;

/**
 * Mengambil kartu Kesempatan dari tumpukan dengan probabilitas 0.5% untuk kartu Ultra Rare.
 * @param {Array} deck - Tumpukan kartu KESEMPATAN.
 * @returns {Object} Kartu yang terpilih.
 */
function drawKesempatanCard(deck = KESEMPATAN) {
  // Cek probabilitas 0.5% (0.005) jika kartu Ultra Rare belum pernah keluar
  if (!ultraRareDrawn && Math.random() < 0.005) {
    ultraRareDrawn = true;
    return KESEMPATAN_ULTRA_RARE;
  }

  // Pengambilan acak kartu biasa
  const randomIndex = Math.floor(Math.random() * deck.length);
  return deck[randomIndex];
}

/**
 * Mereset state kartu Ultra Rare saat permainan baru dimulai.
 */
function resetUltraRareState() {
  ultraRareDrawn = false;
}

/**
 * Fungsi pembantu untuk mengeksekusi array efek dari kartu yang diambil.
 * @param {Object} player - Player yang mengambil kartu.
 * @param {Array} effects - Array dari objek efek.
 * @param {Object} gameState - State permainan global (berisi daftar players, board, helper fungsi).
 */
function executeCardEffects(player, effects, gameState) {
  if (!effects || !Array.isArray(effects)) return;

  effects.forEach(eff => {
    // Tentukan sasaran (default: player yang mengambil kartu)
    let target = player;
    if (eff.who === 'richest') {
      target = gameState.getRichestPlayer();
    } else if (eff.who === 'poorest') {
      target = gameState.getPoorestPlayer();
    }

    switch (eff.type) {
      case 'receive':
        target.money += eff.amount * K;
        break;

      case 'pay':
        target.money -= eff.amount * K;
        break;

      case 'pct':
        const amountLost = Math.floor(target.money * (eff.pct / 100));
        target.money -= amountLost;
        break;

      case 'collectEach':
        gameState.getActivePlayers().forEach(p => {
          if (p.id !== target.id) {
            const payAmt = Math.min(p.money, eff.amount * K);
            p.money -= payAmt;
            target.money += payAmt;
          }
        });
        break;

      case 'payEach':
        gameState.getActivePlayers().forEach(p => {
          if (p.id !== target.id) {
            const payAmt = eff.amount * K;
            target.money -= payAmt;
            p.money += payAmt;
          }
        });
        break;

      case 'freeUpgrade':
        target.freeUpgrades = (target.freeUpgrades || 0) + 1;
        break;

      case 'seizeBest':
        // Menyita properti dengan sewa/harga tertinggi milik target (richest/lawan)
        if (gameState.seizeBestProperty) {
          gameState.seizeBestProperty(target, player);
        }
        break;

      case 'swapRichPoor':
        if (gameState.swapRichPoorMoney) {
          gameState.swapRichPoorMoney();
        }
        break;

      case 'goto':
        if (gameState.movePlayerToTile) {
          gameState.movePlayerToTile(player, eff.tile);
        }
        break;

      case 'loseCards':
        player.powerCards = [];
        break;

      default:
        break;
    }
  });
}

module.exports = {
  K, START_MONEY, SALARY, JAIL_FINE, DOA_REWARD, BUZZER_FEE, LAND, MUSIBAH_SPECIAL, BOARD, 
  GROUP_COLORS, PLAYER_COLORS, LOOKS, POWERS, KESEMPATAN, KESEMPATAN_ULTRA_RARE, KESEMPATAN_ULTRA_RARE_PEJABAT, PEJABAT_TURNS, ULTRA_RARE_CHANCE, MUSIBAH, 
  BOT_NAMES, AVATAR_STATS, BANK, GAME_MINUTES, TAX_PER_PROPERTY, TURN_IDLE_SECONDS, TRAVEL_IDLE_SECONDS, NORMAL, NORMAL_BOARD, NORMAL_KESEMPATAN, NORMAL_AVATARS, drawKesempatanCard, resetUltraRareState, executeCardEffects
};