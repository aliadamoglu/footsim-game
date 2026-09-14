# Yeni spiker bankaları: anahtar → metin (TTS'e verilen metinle birebir aynı; sessizlik bölütlemesi bu sırayı kullanır)
import json
B = {}
B['pred1'] = [
 ('v_shoot','vuruyor!'),('v_shoot2','şutunu çekiyor!'),('v_longshot','uzaktan deniyor!'),('v_header','kafayı vuruyor!'),
 ('v_save','kurtardı!'),('v_catch','topu güvenle kontrol etti.'),('v_savecorner','köşeden çıkardı!'),
 ('v_dribble','topu sürüyor.'),('v_onball','topla buluşuyor.'),('v_advance','ilerliyor.'),('v_enterhalf','rakip yarı sahaya giriyor.'),
 ('v_box','ceza sahasına giriyor!'),('v_beat','rakibini çalımla geçti!'),('v_steal','topu kaptı.'),('v_intercept','araya girdi.'),
 ('v_through','ara pası!'),('v_cross','ortaya çekiyor!'),('v_longball','uzun topu gönderiyor.'),('v_backpass','geri pas yapıyor.'),
 ('v_foul','faul yaptı.'),('v_foul2','rakibini düşürdü.'),('v_yellow','sarı kart gördü.'),('v_red','kırmızı kartla oyun dışı!'),
 ('v_offside','ofsaytta.'),('v_subout','oyundan çıkıyor.'),('v_subin','oyuna giriyor.'),('v_injury','yerde kaldı.'),
 ('v_goal','golü attı!'),('v_goal2','ağları havalandırdı!'),('v_goal3','fileleri buldu!'),('v_owngoal','kendi kalesine attı.'),
 ('v_penspot','penaltı noktasında.'),('v_assist','asisti yaptı.'),('v_nearmiss','az farkla auta gönderdi.'),('v_oneonone','kaleciyle karşı karşıya!'),
 ('v_shotweak','kaleyi yokluyor.'),('v_clear','topu uzaklaştırdı.'),('v_block','blokladı!'),('v_cornertaker','korneri kullanacak.'),
 ('v_fktaker','serbest vuruşun başında.'),('v_throwin','taç atışını kullanıyor.'),('v_goalkick','kale vuruşunu yapıyor.'),
 ('v_rise','çok iyi yükseldi!'),('v_slide','kayarak müdahale etti.'),('v_cut','topu kesti.'),('v_sprint','hızlanıyor!'),
 ('v_lookpass','pas seçeneği arıyor.'),('v_right','sağ kanattan ilerliyor.'),('v_left','sol kanattan ilerliyor.'),('v_kickoff','santrayı yapıyor.'),
 ('v_penscored','penaltıyı gole çevirdi!'),('v_penmiss','penaltıyı kaçırdı!'),('v_skyed','topu tribünlere gönderdi.'),('v_post','vuruşu direkten döndü!'),
 ('v_gkwins','kaleciyi geçemedi.'),
]
B['pred2'] = [
 ('v_shake','rakibinden sıyrıldı.'),('v_control','topu kontrol etti.'),('v_turn','dönüp bakıyor.'),('v_misspass','pasını bulamadı.'),
 ('v_badpass','hatalı pas yaptı.'),('v_lost','topu kaybetti.'),('v_run','uzun bir koşuyla geliyor.'),('v_beat2','iki kişiyi geçti!'),
 ('v_fouledbox','ceza sahasında düşürüldü!'),('v_wonpen','penaltıyı kazandı!'),('v_pentaker','penaltıyı kullanacak.'),('v_overwall','duvarın üzerinden deniyor!'),
 ('v_helpless','kaleciyi çaresiz bıraktı!'),('v_chip','aşırtma vuruyor!'),('v_place','plaseyle deniyor!'),('v_hard','sert bir şutla!'),
 ('v_tipcorner','topu kornere çeldi!'),('v_hands','topu ellerine aldı.'),('v_punt','degajla başlatıyor.'),('v_waiting','pasını bekliyor.'),
 ('v_space','boş alana koşuyor.'),('v_overlap','kanattan bindiriyor.'),('v_won','topu kazandı.'),('v_lastman','son adam!'),
 ('v_danger','tehlikeyi uzaklaştırdı.'),('v_headclear','topu başıyla uzaklaştırdı.'),('v_gkout','kaleci çıkışı yaptı!'),
 ('v_frommid','orta sahadan geliyor.'),('v_byline','son çizgiye iniyor.'),('v_gaveaway','topu rakibin ayağına verdi.'),('v_goodball','çok iyi bir top aldı.'),
 ('v_bigerror','büyük hata!'),('v_protest','hakeme itiraz ediyor.'),('v_hurt','sakatlık yaşıyor gibi.'),('v_back','oyuna geri döndü.'),
 ('v_justintime','son anda yetişti!'),('v_slideclear','kayarak uzaklaştırdı!'),('v_spaceahead','önünde alan var!'),('v_heldlong','topu uzun tuttu.'),
 ('v_quick','pasla oyunu hızlandırıyor.'),('v_pace','süratiyle geçiyor!'),('v_infront','kale önünde!'),('v_emptynet','boş kaleye!'),
 ('v_headdown','kafayla indirdi.'),('v_nicepass','nefis bir pas!'),
]
B['lead1'] = [
 ('l_andgoal','Ve gol!'),('l_greatgoal','Muhteşem bir gol!'),('l_whatgoal','Ne gol ama!'),('l_finish','Harika bir bitiriş!'),('l_beatgk','Kaleciyi avladı!'),
 ('l_shot','Şut!'),('l_hardshot','Sert vurdu!'),('l_justwide','Az farkla dışarı!'),('l_over','Üstten auta!'),('l_gkflew','Kaleci uçtu!'),('l_whatsave','Ne kurtarış!'),
 ('l_danger','Tehlike var!'),('l_counter','Kontra atak fırsatı!'),('l_fast','Hızlı hücum!'),('l_tempo','Tempo yükseliyor.'),('l_crowd','Tribünler ayakta.'),
 ('l_pressure','Baskı artıyor.'),('l_midfield','Top orta sahada dolaşıyor.'),('l_defence','Savunma iyi kapatıyor.'),('l_passing','Pas trafiği güzel işliyor.'),
 ('l_crowdedbox','Ceza sahası kalabalık.'),('l_rough','Oyun sertleşiyor.'),('l_refgood','Hakem oyunu iyi yönetiyor.'),('l_lastmin1','İlk yarının son dakikaları.'),
 ('l_lastmin2','Maçın son dakikalarındayız.'),('l_stilldraw','Skor hâlâ berabere.'),('l_homelead','Ev sahibi önde.'),('l_awaylead','Konuk ekip önde.'),
 ('l_seekeq','Beraberlik golü arıyorlar.'),('l_seekmore','Farkı açmak istiyorlar.'),('l_restart','Oyun yeniden başladı.'),('l_out','Top oyun dışı.'),
 ('l_whistle','Hakem düdüğü çaldı.'),('l_adv','Avantaj oynatıyor.'),('l_poss','Topa sahip olan takım...'),('l_attack','Hücumda...'),('l_press','Baskı kuran taraf...'),
 ('l_score','Skor...'),('l_scorer','Golün sahibi...'),('l_assist','Asist...'),('l_yellowname','Sarı kart gören isim...'),('l_out2','Oyundan çıkan...'),('l_in2','Oyuna giren...'),
 ('l_saver','Kurtaran isim...'),('l_offsider','Ofsayta düşen...'),('l_shooter','Vuran...'),('l_and','Ve...'),('l_here','İşte...'),('l_careful','Dikkat!'),('l_bigchance','Büyük fırsat!'),
 ('l_missed','Kaçtı!'),('l_post','Direkten döndü!'),
]
B['pre1'] = [
 ('pre_tunnel','Takımlar tünelden çıkıyor!'),('pre_refs','Hakem üçlüsü önde.'),('pre_captains','Kaptanlar hemen arkalarında.'),('pre_full','Tribünler dolu ve heyecan dorukta.'),
 ('pre_moment','İşte büyük an.'),('pre_salute','Takımlar seyircileri selamlıyor.'),('pre_shake','Tokalaşma tamamlandı.'),('pre_positions','Takımlar yerlerini alıyor.'),
 ('pre_home','Ev sahibi...'),('pre_away','Konuk ekip...'),('pre_today','Bugünkü karşılaşmada...'),('pre_refready','Hakemimiz düdüğünü çalmak üzere.'),
 ('pre_ready','Her şey hazır.'),('pre_xi','İlk on birler belli.'),('pre_kicker','Başlama vuruşunu yapacak takım...'),('pre_season','Sezonun önemli bir maçındayız.'),
 ('pre_leader','Lider sahada.'),('pre_title','Şampiyonluk yarışı için kritik bir maç.'),('pre_points','Üç puan çok önemli.'),('pre_awaytest','Deplasman ekibi burada zor bir sınav verecek.'),
 ('pre_stars','Bu akşam yıldızlar geçidi izleyeceğiz.'),('pre_ceremony','Seremoni başlıyor.'),('ft_winner','Kazanan taraf...'),('ft_shared','Puanlar paylaşıldı.'),
 ('ft_motm','Maçın adamı...'),('ft_champion','Ve şampiyon...'),('ft_seasonend','Sezon tamamlandı.'),('pre_welcome','Futbolseverler hoş geldiniz.'),
]
B['score2'] = [
 ('s33','Üç üç.'),('s41','Dört bir.'),('s42','Dört iki.'),('s43','Dört üç.'),('s44','Dört dört.'),('s50','Beş sıfır.'),('s51','Beş bir.'),('s52','Beş iki.'),
 ('s53','Beş üç.'),('s60','Altı sıfır.'),('s61','Altı bir.'),('s62','Altı iki.'),('s70','Yedi sıfır.'),
 ('t_lead','öne geçiyor!'),('t_equal','eşitliği sağlıyor!'),('t_extend','farkı açıyor!'),('t_reduce','farkı kapatıyor!'),('t_wins','maçı kazanıyor!'),
 ('t_home','ev sahibi olarak sahada.'),('t_away','deplasmanda.'),('t_attacking','hücumu kuruyor.'),('t_pressing','baskıyı artırdı.'),('t_corner','korner kullanacak.'),
 ('t_freekick','serbest vuruş kullanacak.'),('t_penalty','penaltı kazandı!'),('t_sub','oyuncu değişikliğine gidiyor.'),('t_possession','topa daha çok sahip.'),
 ('t_ten','on kişi kaldı.'),('t_kickoff','başlama vuruşunu yapıyor.'),('t_second','ikinci yarıya hızlı başladı.'),
]
names = json.load(open('../../audio/voice/names_manifest.json'))['parts']
for i, part in enumerate(names): B['xnames%d' % (i + 1)] = [('x:' + n, n + '!') for n in part]
json.dump(B, open('manifest2.json', 'w'), ensure_ascii=False, indent=0)
for b, items in B.items():
    txt = ' '.join(t for k, t in items)
    print('===', b, len(items), 'items', len(txt), 'chars')
    print(txt)
