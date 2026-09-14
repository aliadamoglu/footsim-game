# footsim — Babylon.js 3D Futbol Simülatörü (2026-27)

2026-27 sezonu kadrolarıyla, tüm futbol kurallarını uygulayan, sinematik kamera yönetmenli 3D futbol simülasyonu.
Tamamen tarayıcıda çalışır; kurulum gerektirmez (Babylon.js yerel olarak `lib/` altında). İzleme, kontrol ve **kariyer (lig sezonu)** modları.

## Çalıştırma

```bash
cd futbol-sim
python3 tools/serve.py 8000      # önbelleksiz (no-store) statik sunucu — güncellemeler anında görünür
# tarayıcıda: http://localhost:8000
```

(Herhangi bir statik sunucu olur: `python3 -m http.server`, `npx serve`, VS Code Live Server vb. — ancak bunlar
önbellek başlığı göndermediği için kod güncellemesinden sonra **Ctrl+Shift+R** ile sert yenileme gerekebilir.
`file://` ile açmak DynamicTexture yüzünden bazı tarayıcılarda çalışmayabilir — yerel sunucu önerilir.)

## Özellikler

- **52 kulüp, 2026-27 kadroları:** Süper Lig'in 18 takımı + 2026-27 Şampiyonlar Ligi lig aşamasının 36 kulübü
  (kesişim dâhil 52 farklı kulüp; her birinde forma numaralı ilk 11 + 8 yedek, diziliş, iç/dış/kaleci forması,
  stadyum, kapasite, teknik direktör, kuruluş yılı, ŞL torbası). İlk 12 kulüp (`js/data/teams.js`) elle derlendi;
  kalan 40 kulüp `tools/data/build_teams.py` ile Vikipedi kadro tabloları + oyuncu sayfalarından (mevki, doğum yılı)
  üretildi (`js/data/teams_ext.js`; güçler kulüp seviyesi + yıldız listesi + forma numarası/kaptanlık/yaş sinyallerinden).
  Menüde lig sekmeleri (Tümü / Şampiyonlar Ligi / Süper Lig / Premier Lig / LaLiga / Serie A / Bundesliga /
  Ligue 1 / Diğer Avrupa), isim-şehir-ülke araması ve her kartta ⓘ **kulüp kartı** (stadyum, kapasite, TD,
  bütçe, hücum/orta saha/savunma çubukları, yıldız oyuncu, tam kadro; oradan ev sahibi/deplasman/kariyer seçimi).
- **İki mod:** İzleme (AI vs AI, otomatik yönetmen) ve **Kontrol** (klavye/gamepad ile bir takımı yönet; maç
  sırasında `T` ile devral/bırak).
- **Kurallar:** ofsayt, faul/avantaj, sarı-kırmızı (ikinci sarı, DOGSO), penaltı, serbest vuruş + 9.15 m baraj,
  taç/korner/kale vuruşu, kaleciye geri pas, 8 saniye kuralı, çift dokunuş, 5 değişiklik/3 pencere, uzatma
  süreleri, sakatlık, kırmızı sonrası acil kaleci, forma çakışmasında deplasman forması.
- **Sinematik kamera:** yay-sönümlü organik hareket, olay bazlı kesmeler (gol → sevinç yakın plan → iki açıdan
  yavaş çekim tekrar → geniş plan), penaltı/serbest vuruş yaklaşma dolly'si, kart yakın plan, açılış vinç çekimi,
  operatör el titremesi, şutta sarsıntı, hafif dutch açı. 7 kamera modu (`V`).
- **Üçüncü şahıs oyuncu kamerası (Kontrol modu):** kamera kontrol edilen oyuncunun omzunun arkasında, oyuncunun
  baktığı yöne bakar (ölü bant + hız sınırıyla yumuşatılmış yaw); yön tuşları kameraya göre çalışır ve kamera
  dönerken girdi yeniden kilitlenmez (dönüp durma yok). Sprintte geri açılır, topsuzken hafifçe topa doğru bakar,
  dikey ekranda daha yüksek/geniş kadraj. Yönetmen kesmeleri bu modda yalnızca gol/VAR/devre gibi olaylarda girer.
- **Çarpışma ve yer temas:** oyuncular kapsül olarak ayrılır, yerdeki oyuncu (düşme/kayma/dalış) alçak bir gövde
  segmenti sayılır — kimse kimsenin içinden geçmez; yatan modelin hiçbir uzvu çimin altına inmez (zemin kelepçesi)
  ve kalkarken ışınlanma olmaz (gövde sim konumu üzerinde ortalanır). Top da yerdeki gövdeden seker.
- **Maç süresi:** varsayılan 2×3 dk (90 dk sıkıştırılmış); menüden veya maç sırasında alt bardan değiştirilebilir.
  Hız: ½×, 1×, 2×, 4×.
- **Hakem üçlüsü + 4. hakem:** orta hakem oyunu diyagonal takip eder, düdük/kart/avantaj işareti verir; yan
  hakemler ofsayt hattında (sondan ikinci savunmacı) koşar ve bayrak kaldırır; 4. hakem kenarda değişiklik
  tabelasını (çıkan kırmızı / giren yeşil numara) ve uzatma süresini kaldırır. Sarı/kırmızı kartta kamera önce
  hakemin kartı gösterişine, sonra oyuncuya kesme yapar.
- **VAR:** milimetrik ofsayt sınırındaki gollerde hakem kulaklığına dokunur, ekranda **VAR İNCELEMESİ** etiketi
  yanıp söner, tekrar pas anında donar ve ofsayt çizgileri (kırmızı hücumcu / mavi savunma hattı) sahaya çizilir;
  karar sonrası "gol geçerli" ya da "ofsayt — gol iptal" (serbest vuruşla devam). Spiker VAR sürecini anlatır.
- **Seremoni (görünür sahaya çıkış):** stadyumun -z tarafında, panoların arkasında bir oyuncu tüneli vardır
  ("OYUNCU TÜNELİ" tabelası). Hakem üçlüsü önde, ev sahibi ve deplasman iki kolon hâlinde tünelde sıraya girer;
  kamera dizisi: tünel içi omuz üstü el kamerası → tünel ağzından yan alçak açı (sıra kameranın önünden geçer) →
  vinç/establishing → yavaş lineup pan → tokalaşma yakın takibi. Dizilme çizgisinde deplasman oyuncuları ev sahibi
  sırasının önünden geçerek tokalaşır (sağ kol uzatma animasyonu), sonra herkes santra pozisyonuna dağılır. Spiker
  bu sırada maç öncesi anlatım yapar (kariyer modunda lig haftası/sıralama/derbi bağlamıyla). Enter ile atlanır.
- **Ara sahneler:** oyuncu değişikliğinde çıkan oyuncu kenara yürür (steadicam takip), giren oyuncu(lar) orta
  çizgide bekler ve sahaya koşar; kırmızı kartta hakem → yakın plan push-in → kenara yürüyüş → geniş plan; büyük
  kurtarışta kaleci yakın planı. Tüm tekrar ve ara sahneler **Enter / Backspace** ya da sağ üstteki **Atla** ile
  atlanır; atlama sırasında simülasyon sessizce ileri sarılır, oyun anında santra/serbest vuruştan devam eder.
- **Türkçe sesli spiker (v2):** 1.886 parçalık sprite tabanlı seslendirme, 28 ses bankası: 52 kulübün tüm
  oyuncularının soyadları (düz + 475 ünlemli "x:" varyantı; yeni kulüpler `tools/voice/manifest3.json` +
  `segment3.py` ile sessizlik tabanlı bölütlendi), 52 takım adı, skorlar, gol/kart/VAR/korner/ofsayt kalıpları, **ad + yüklem**
  cümleleri ("Osimhen vuruyor!", "Leão topu kaptı", "Aktürkoğlu verkaç yapıyor!"), tepki ünlemleri, maç durumu
  yorumları (dakika/skor/baskı/tempo), maç öncesi/sonrası anlatım ve kariyer bağlamı (lig haftası, sıralama,
  derbi, lider, seri/kriz). Öncelikli kuyruk (0-3), bayatlama süresi, aynı adın 6 sn içinde tekrarını düşürme,
  son 40 sn'de söylenenden kaçınma, sessizlikte bağlama göre renk yorumu, önemli olaylarda kesme ve ambiyans
  kısma. Alt bardaki mikrofon düğmesiyle açılıp kapanır.
- **Organik hareket:** dönüş hızı hıza bağlı (yüksek hızda geniş yay, sert dönüşte fren), patlayıcı kalkış eğrisi,
  hızla değişen adım frekansı/uzunluğu, ivmeye bağlı öne eğilme, dönüşte yana yatma, nefes/ağırlık aktarma idle
  hareketleri, kişiye özgü kol asimetrisi ve sevinç stilleri; yüz detayları (göz, kaş, burun, ağız, kulak).
- **Transfer modu ve bütçeler:** menüdeki *Transfer merkezi* ekranında 52 kulübün kadrosunu yönet (ilk 11 ↔ yedek),
  pazardan oyuncu al (bonservis + maaş pazarlığı, karşı teklifler, prestij etkisi), oyuncu sat (yapay zekâ kulüp
  teklifleri) ya da serbest bırak. Her kulübün transfer bütçesi, maaş tavanı ve prestiji vardır; kadro 16-23,
  en fazla 3 kaleci. Maç sonunda hasılat + sonuç primi − haftalık maaş bütçeye işlenir. Durum `localStorage`'da
  saklanır (`↺ Sıfırla` ile sezon başına dönülür). Maçlar her zaman güncel kadrolarla oynanır.
- **Kariyer modu:** menüdeki *Kariyer* sekmesinden bir kulüp seçip menajer olunur. Türk kulübüyle 18 takımlı
  **Süper Lig** (çift devreli, 34 hafta); Avrupa kulübüyle kulübün güç bandındaki 18 ŞL kulübünden oluşan
  **Şampiyonlar Ligi** ligi (34 hafta). Haftanın maçı 3B oynanır (Yönet / İzle) ya da anında simüle edilir;
  diğer sekiz maç güç tabanlı Poisson sonuç motoruyla oynanır. Puan durumu (averaj, form), fikstür, gol krallığı,
  maçın adamı, haberler, menajer notu; transfer penceresi sezonun ilk 4 haftası ve devre arasından sonraki 4 hafta
  açık (kapalıyken alım-satım engellenir, kadro düzenlemesi serbest). Sezon sonu şampiyon/gol kralı/ödül parası; yeni sezonda oyuncular bir
  yaş alır (gençler gelişir, 30+ güç kaybeder) ve fikstür yeniden çekilir. Kariyer `localStorage`'da
  (`footsim.career.v1`) saklanır; maç sonu ekranından "Kariyere dön" ile tabloya dönülür.
- **Yapay zekâ (v2):** verkaç (duvar pası: topu geri verip rakibin arkasına koşu, alıcı verkaçı tamamlamayı
  tercih eder), ara pası zamanlaması (koşuya çıkmış ve hattın dibindeki alıcıya büyük bonus, durgun alıcıya ceza,
  kendi yarı sahadan nadir), daha sık ve isabetli ortalar (ceza sahasında forvet/10 numaraya, koşuya orta), uzun
  süre topu tutan oyuncunun pas eğilimi (amaçsız dripling azalır), kanat oyuncularının ceza sahası hizasında içe
  kat etmesi, topu geri sürüklememe, hava toplarının taç çizgisine sekmemesi; savunmada **pres tetikleyicileri**
  (kaleci ayakta, kötü kontrol, geri pas, kaleye dönük taşıyıcı → 2.5 sn yüksek pres; ikinci presçi pas gölgesi
  yapar), blok modları (yüksek/orta/alçak — son dakikalarda öndeyken alçak blok) ve kompaktlık; kaleci dağıtımı
  çeşitlendi (koşan forvete hızlı kontra, oyun kuran takımlarda kısa el pası, en boş ileri oyuncuya uzun top).
- **Sunum:** FIFA/PES tarzı menü (kulüp kartları, mod/süre seçimi, Transfer merkezi, Kontroller paneli),
  yarı saydam HUD (skor tablosu, gol/kart/VAR bannerları, spiker akışı), 106 çizgi ikon (Lucide, satır içi SVG,
  emoji yok), istatistik paneli (xG, pas isabeti, kondisyon), konfeti, tribün/ambiyans sesleri (Web Audio, sentetik).
- **Gerçekçilik:** ilk kontrol gecikmesi ve kontrol başarısı (beceri/hız/top yüksekliğine bağlı), vuruş bekleme
  süresi, top sürerken topun ayaktan açılması, oyuncu çakışma çözümü. Gerçekçilik turları (r1–r23): pas anında
  koridor kontrolü ve topu koruma (shield), rakibin erişim kuralı (bitişik rakip 0.1 sn içinde topu alamaz),
  presçinin gecikmeli algısı (çalımda bir an yanlış tarafa gider), jokey yapan savunmacı topa dönük ve ≤4.8 m/s,
  1'e 1 çalım (rakibin açık tarafına keskin kesme + patlama), kaleci çelmelerinden/bloklardan korner, orta yüksekliği,
  şut dağılımı, kart/DOGSO kalibrasyonu. 24 maçlık ölçüm (`tools/realism.js`): pas isabeti ~%83 (başlangıçta %28),
  maç başına ~1.6 gol, ~9 şut, ~14 müdahale, ~4.5 faul, 0 takılma.
- **Oyuncu kamerası — üçüncü şahıs (kontrol modu):** kamera kontrol edilen oyuncunun hemen arkasında (≈5.6 m geride,
  2.3 m yükseklikte, omuz üstünden); oyuncu kadrajın alt-orta bölgesinde durur ve önündeki saha görünür. Bakış yönü
  oyuncunun koşu yönünü yumuşakça izler (dururken sabit kalır), topsuzken top kadrajda kalsın diye topa doğru kayar;
  sprintte geri çekilip açı açılır, ceza sahasında hafif yükselir. Duran toplarda kontrol atıcıya geçer ve kadraj kaleye
  döner. Yön tuşları kameraya göre çözülür, tuş basılıyken yön kilitlenir (kamera dönerken oyuncu savrulmaz); top ekran
  dışındaysa kenarda ok belirir.
- **HUD (2. tasarım):** kontrol bilgi paneli (takım rengi, forma no + isim, güç çubuğu, duran top ipucu, Q kısayolu)
  skor tabelasının altında **sol üstte**; spiker akışı onun altına kayar. Alt çubuk gruplu cam paneller hâlinde
  (kamera · hız · süre · oyun [duraklat, kontrol, istatistik, etiketler] · ses · sistem [kayıt, yardım, tam ekran, menü]);
  **Menü** düğmesi maç sürerken duraklatma menüsünü açar (yanlışlıkla çıkış yok). Telefon/tablette hiçbir panel
  dokunmatik düğmelerle veya birbiriyle çakışmaz.
- **Menü (duyarlı):** yatay taşma yok; 760 px altında kulüpler yan yana, VS/stadyum altta, tam genişlik başlat düğmesi;
  480 px altında üst gezinme 4'lü ızgara, takım kartları 2 sütun; ayarlar paneli tek sütuna iner.
- **Fizik (gözden geçirme):** düşme/kayma/dalış pozları gövde pivotu ayakta olduğundan zemine gömülüyordu → pozlar
  kalça ≈0.2 m yükseklikte yeniden kuruldu ve `updateGroundClamp()` en alçak uzvu her karede zemin üstünde tutar
  (tünelleme ve "pop" yok). Oyuncu çakışması: 0.36 m yarıçap, tam ayrışma + birbirine doğru hız bileşeninin
  sıfırlanması; yerdeki oyuncu sabit engel (üzerinden geçilmez, gövde boyunca top sekmesi); duran top dizilişinde
  de çalışır. Top: direk/üst direk için sürekli (parça–daire) çarpışma (30 m/s şut direği atlamaz), ağa yalnızca kale
  ağzından giriş (direğin yanından auta giden top ağın içine ışınlanmaz; dış yüzeye çarpar), hava direnci ve ağ
  sönümlemesi dt'den bağımsız kapalı çözümle; uçuş tahmini ve yer pası hız çözücüsü aynı modelle.
- **Mobil / dokunmatik:** telefon ve tablette kontrol modunda sanal joystick (sol alt, dokunduğun yerde belirir)
  ve aksiyon düğmeleri (PAS, ŞUT, ORTA, ARA pası — basılı tut: güç; SPRINT aç/kapat, OYUNCU, KALECİ) otomatik
  açılır; HUD küçük ekranda sıkıştırılır, tam ekran düğmesi (F) yatay kilit dener, dikeyde çevirme ipucu.
- **Video kaydı (YouTube):** alt çubuktaki **Kaydet** (R) düğmesi ekran + ses (kalabalık, düdük, spiker) kaydını
  başlatır; üstte kırmızı KAYIT sayacı görünür. **Durdur** ile kaydetme ekranı açılır: önizleme, dosya adı,
  **İndir** (MP4 — tarayıcı destekliyorsa; yoksa WebM, YouTube ikisini de kabul eder), mobilde **Paylaş…**, **Sil**.
  Videoya yayın grafikleri (skor tabelası, saat, gol/kart/VAR bandı, TEKRAR etiketi, filigran) kompozit olarak
  çizilir; HTML HUD ve düğmeler videoya girmez. Menüye dönülürse kayıt kendiliğinden durur.
- **Telefon düzeni (dikey/yatay):** transfer merkezi, kariyer ve oyun içi HUD 390 px genişlikte yatay taşımaz; geniş tablolar yalnızca kendi kutusunda kayar, pazar tablosunda ikincil sütunlar gizlenip "Teklif" düğmesi görünür kalır; dikey telefonda dokunma düğmeleri alt barın üstünde konumlanır (`--barH` çalışma zamanında ölçülür).
- **Oyuncu kamerası kale kaçınması:** kontrol edilen oyuncu kale çizgisi gerisindeyken kamera yan ağın dışına kayar ve hafif yükselir (ağ örgüsünün içinden bakılmaz).
- **Hava koşulları (8 ön ayar + rastgele):** Açık, Gece, Bulutlu, Yağmur, Sağanak, Kar, Sis, Sıcak — menüden seçilir (tercih tarayıcıda saklanır). Fiziğe gerçek etkiler: ıslak çimde top hızlı kayar ve sekmez, oyuncuların dönüşü/ivmesi düşer, kayarak müdahaleler kontrolsüzleşir, kaleci topu daha az tutar; karda top yavaşlar (turuncu kış topu, kar örtüsü); siste görüş düşer ve uzun paslar/şutlar isabetsizleşir; sıcakta kondisyon hızlı tükenir; rüzgâr (ani esintili) uçan topları saptırır. Görsel: kameraya bağlı yağmur/kar parçacıkları, ıslak zemin parlaklığı, sis yoğunluğu, ışık/pozlama, sağanakta şimşek + gök gürültüsü; yağmur/rüzgâr sesi. Skorbordda hava rozeti, açılış bandında ve spikerde hava bilgisi. Yapay zekâ top yolunu zemine göre öngörür (`predictPath`, `groundPassSpeed` hava çarpanlarını kullanır).
- **Sanal joystick (telefon/tablet):** sol altta sabit, her zaman görünür joystick — yön okları itilen yönü gösterir, bölgeye dokununca joystick parmağın altına kayar, bırakınca ortaya döner; topuza çift dokunuş sprint kilidi.
- **Video kaydı — durdurma akışı:** kayıt duraklatma menüsünden ya da R ile durdurulunca kaydetme ekranı her durumda açılır (onstop gelmezse 1.5 sn'lik güvenlik zamanlayıcısı eldeki parçalarla açar), duraklatma menüsü ekran kapanınca geri gelir; diyalog `<body>` altına taşınır ve alçak/yatay telefon ekranlarına sığar (kaydırılabilir).

- **Taktik paneli (G / alt çubuk "Taktik" / duraklatma menüsü):** maç içinde 8 diziliş (4-2-3-1, 4-3-3, 4-4-2, 4-1-4-1,
  3-5-2, 3-4-3, 5-3-2, 5-4-1), 5 oyun planı (Otobüs, Savunma, Dengeli, Hücum, Topyekûn), 5 kaydırıcı (savunma hattı,
  pres, tempo, genişlik, mentalite) ve talimatlar (bekler biner, kanatlar içe kat eder, uzun top, hızlı kontra, kaleci
  kornere çıkar). Diziliş değişince oyuncular mevkiye uygunluğa göre yeniden eşlenir (mevki dışı oynayan cezalı);
  oyun sürerken yeni şekle koşarak geçilir, duraklamada anında dizilir. Kontrol ettiğin takım düzenlenebilir; izleme
  modunda **"Ben yönetiyorum"** ile istediğin takımın teknik direktörü olabilirsin (yapay zekâ o takım için karar vermez).
  Sağdaki mini sahada diziliş, savunma hattı ve pres bölgesi çizilir; **Teknik Direktör Günlüğü** yapılan değişiklikleri listeler.
- **Otomatik teknik direktör (yapay zekâ):** her iki takım skor/dakika/oyuncu sayısına göre taktik değiştirir —
  öndeyken 70'+ savunma, 84'+ otobüs (1 farkta 5'li savunmaya geçer), gerideyken 72'+ hücum, 86'+ topyekûn (3-4-3 /
  3-5-2), eksik kalınca kompakt, fazla oyuncuyla baskı; 88'+ 1 fark gerideyken kaleci kornere çıkar (koşarak gelir,
  köşe sonrası geri döner). Kararlar duraklamalarda (≥3 maç dakikası arayla) alınır ve alt bantta duyurulur.
- **Animasyon paketi:** vole, kafa vuruşu (yerden/sıçrayarak), göğüs/uyluk kontrolü, taç atışı, kaleci degaj/elle
  atış, yerdeki oyuncunun kalkışı; 7 gol sevinci koreografisi (yerinde zıplama, yumruk koşusu, uçak, diz kayması,
  gökyüzünü işaret, "duymuyorum", sarılma yığını — golcüye göre sabit karakter, gerideyken kısa sevinç); hakem kartı
  kaldırışı. Tekrar kareleri vuruş stilini ve göğüs kontrolünü de saklar.
- **TV grafikleri:** açılış kadro kartı (11 + diziliş + TD, iki takım sırayla), periyodik istatistik alt bandı (topla
  oynama / xG / şut, 12'den sonra her 15 maç dakikası), taktik değişikliği bandı, devre arası istatistik, gol
  klipleri (**maç sonu özet**: son düdükten 2 s sonra tüm goller dönüşümlü kale arkası / alçak yan açıyla yavaş
  çekimde, sağ üstte "MAÇ ÖZETİ" etiketi; sonuç ekranından **Özet** ile tekrar izlenebilir, Enter ile atlanır).

## Kontroller (Kontrol modu)

| Tuş | İşlev |
|---|---|
| Ok tuşları / WASD | Hareket |
| Shift | Sprint |
| Boşluk / K | Pas (basılı tut: güç) · savunmada baskı/müdahale |
| X / L | Şut (basılı tut: güç; ▲ üst köşe, ◀▶ yön) · savunmada kayarak müdahale |
| C / J | Uzun top / orta |
| D | Ara pası |
| Q | Oyuncu değiştir |
| E | Kaleci çıkışı |
| Enter / Backspace | Tekrarı / ara sahneyi atla (açılış seremonisinde spiker anlatımı da kesilir) |
| R | Video kaydını başlat / durdur (durdurunca kaydetme ekranı) |
| F | Tam ekran |
| T | Kontrolü devral / bırak |
| V | Kamera modu |
| Tab | İstatistikler |
| P / Esc | Duraklat → duraklatma menüsü (Devam et, kontrolü devral/bırak, istatistik, kontroller, video kaydı, maç süresi, kamera, ana menü) |
| G | Taktik paneli |
| H | Yardım |
| 1 / 2 / 3 / 0 | Hız 1× / 2× / 4× / ½× |

Gamepad: A pas, X şut, B uzun top, Y ara pası, LB oyuncu değiştir, RB sprint.

## Proje yapısı

```
index.html            arayüz (menü + HUD)
css/style.css
lib/babylon.js        Babylon.js 9.x (yerel)
lib/icons.js          106 satır içi Lucide SVG ikonu (FS.icon / FS.applyIcons)
audio/voice/          spiker ses bankaları (.mp3) + sprites.json (anahtar → banka, başlangıç, süre)
js/core/              math (yay/gürültü/RNG), pitch (saha geometrisi), entities (oyuncu/takım)
js/data/teams.js      2026-27 kadroları ve formalar
js/data/transfer.js   transfer modeli: bütçe/maaş tavanı/prestij, piyasa değeri, teklif-pazarlık, satış, kadro kaydı
js/data/career.js     kariyer: fikstür (Berger), puan durumu, sonuç motoru, gol krallığı, sezon sonu/yeni sezon
js/ui/transfer_ui.js  transfer merkezi ekranı
js/ui/career_ui.js    kariyer ekranı (haftanın maçı kartı, tablo, fikstür, istatistik, haberler)
js/ui/touch.js        dokunmatik kontroller (sanal joystick + aksiyon düğmeleri)
js/ui/tactics_ui.js   maç içi taktik paneli (diziliş, plan, kaydırıcılar, talimatlar, TD günlüğü)
js/sim/tactics.js     taktik modeli: dizilişler, ön ayarlar, talimatlar, otomatik teknik direktör, kaleci kornerde
js/ui/recorder.js     video kaydı (canvas + WebAudio → MediaRecorder; yayın grafikli kompozit; indir/paylaş ekranı)
js/sim/               ball (fizik), actions (pas/şut/kontrol), ai (takım/birey kararları),
                      human (klavye/gamepad), officials (hakem üçlüsü + 4. hakem), match (kural motoru,
                      VAR, seremoni + olaylar)
js/render/            stadium (saha/tribün/panolar/oyuncu tüneli), players (prosedürel oyuncu/hakem modeli + forma dokusu,
                      kart/bayrak/tabela aksesuarları), camera (yönetmen: VAR/seremoni/tabela/hakem sahneleri),
                      voice (sprite tabanlı Türkçe spiker), audio (sentetik ambiyans + ses kısma)
js/app.js             uygulama yapıştırıcısı (sahne, HUD, olaylar)
tools/                test araçları (Node başsız maç simülasyonu, toplu denge testi, Playwright ekran görüntüleri)
```

### Test araçları

```bash
node tools/headless.js GS RMA 7 180 -v   # tek maç, olay dökümü
node tools/batch.js 30 180               # 30 maç ortalama istatistik (denge kontrolü)
python3 tools/shot.py watch 10           # Playwright ekran görüntüsü (chromium gerekir)
python3 tools/cutscene2.py               # değişiklik / kırmızı kart ara sahne dizisi + atlama testi
python3 tools/ceremony.py                # tünel → dizilme → tokalaşma seremoni dizisi (faz/kamera logu + ekran görüntüleri)
python3 tools/career_test.py             # kariyer akışı (yeni kariyer → sim → 3B maç → sonuç → kalıcılık)
node tools/realism.js 12                 # gerçekçilik ölçümü (pas isabeti, diziler, top tutma, gol/şut/faul)

# tools/dev/ — geliştirme sondaları (sunucu :8000 açıkken)
node tools/dev/overlap_probe.js 5 7      # oyuncu iç içe geçme / ışınlanma / hız tavanı
python3 tools/dev/tactics_shot.py /tmp/shots/tac   # taktik paneli, alt bant, kadro kartı, gol sevinci, maç sonu özeti
node tools/dev/phys_probe.js 1 2 3       # NaN, yer altı top, direk içinden geçiş, saha dışı kaçış
node tools/dev/ai_probe.js 1 2 3         # kovalama, kaleci konumu, uzun şut oranı, saha dışı oyuncu
node tools/dev/decision_probe.js 1 2     # ofsayta pas, kör pas, kaleci dağıtım kaybı, ara pası/orta başarımı
node tools/dev/gk_trace.js 5             # kaleci tutma tutarlılığı
python3 tools/dev/cam_probe.py 40 out.png        # oyuncu kamerası kadraj istatistiği (ekran dışı/uzak/arka)
python3 tools/dev/ctrl_probe.py                  # yön tuşu ↔ kamera yönü tutarlılığı
python3 tools/dev/pose_shot.py fall /tmp/pose    # düşme/kayma/dalış pozu ve kalkış kareleri
W=390 H=844 MOBILE=1 python3 tools/dev/hud_shot.py control out.png   # HUD çakışma taraması
python3 tools/dev/menu_shot.py /tmp/menu         # menü yatay taşma taraması (6 ekran boyutu)
python3 tools/dev/fullmatch.py control           # tarayıcıda tam maç: hata/istisna, batma, çakışma
```
