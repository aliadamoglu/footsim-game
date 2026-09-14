# Kulüp meta verisi (elle derlenmiş): id, adlar, şehir, stadyum, forma renkleri, taban güç (base), mentalite.
# base: ilk 11 ortalamasına yakın hedef (Real/City ~86-87, torba-4 kulüpleri ~70-73, Süper Lig alt sıra ~66-68)
import json
P = lambda c1, c2=None, shorts=None, socks=None, num='#FFFFFF', pattern='plain': {'pattern': pattern, 'c1': c1, 'c2': c2 or c1, 'shorts': shorts or c1, 'socks': socks or (shorts or c1), 'num': num}
K = lambda home, away, gk: {'home': home, 'away': away, 'gk': gk}
M = {}
def add(page, id, name, short, city, country, league, stadium, kits, base, mentality=0.5, capacity=None, formation=None, manager=None, founded=None, stars=None):
    M[page] = dict(id=id, name=name, short=short, city=city, country=country, league=league, stadium=stadium, kits=kits, base=base, mentality=mentality, capacity=capacity, formation=formation, manager=manager, founded=founded, stars=stars or {})

# ---- Şampiyonlar Ligi (mevcut 12'nin dışındakiler) ----
add('Atlético Madrid', 'ATM', 'Atlético Madrid', 'ATM', 'Madrid', 'İspanya', 'LaLiga', 'Riyadh Air Metropolitano',
    K(P('#CB3524', '#FFFFFF', '#1B2F5B', '#CB3524', pattern='stripes'), P('#1B2F5B', '#1B2F5B', '#1B2F5B', '#1B2F5B', num='#CB3524'), P('#2BB673', num='#000000')), 82, 0.45, 70692, '4-4-2'.replace('4-4-2','4-2-3-1'), 'Diego Simeone', 1903,
    {'Julián Álvarez': 88, 'Jan Oblak': 87, 'Antoine Griezmann': 83, 'Alexander Sørloth': 80, 'Koke': 78, 'Marcos Llorente': 82, 'Giuliano Simeone': 80, 'Rodrigo De Paul': 81, 'Conor Gallagher': 80, 'Robin Le Normand': 81, 'José María Giménez': 81, 'Clément Lenglet': 78, 'Nahuel Molina': 79, 'Pablo Barrios': 81, 'Álex Baena': 83, 'Thiago Almada': 80, 'Matteo Ruggeri': 77, 'Dávid Hancko': 81, 'Marc Pubill': 76, 'Johnny Cardoso': 78, 'Nico González': 80, 'Juan Musso': 77})
add('Borussia Dortmund', 'BVB', 'Borussia Dortmund', 'BVB', 'Dortmund', 'Almanya', 'Bundesliga', 'Signal Iduna Park',
    K(P('#FDE100', '#000000', '#000000', '#FDE100', num='#000000'), P('#000000', '#000000', '#000000', '#000000', num='#FDE100'), P('#4A90D9', num='#FFFFFF')), 81, 0.6, 81365, '3-5-2', 'Niko Kovač', 1909,
    {'Gregor Kobel': 86, 'Serhou Guirassy': 85, 'Karim Adeyemi': 82, 'Julian Brandt': 81, 'Nico Schlotterbeck': 84, 'Waldemar Anton': 79, 'Ramy Bensebaini': 78, 'Julian Ryerson': 77, 'Pascal Groß': 79, 'Felix Nmecha': 80, 'Marcel Sabitzer': 78, 'Jobe Bellingham': 78, 'Maximilian Beier': 79, 'Fábio Silva': 77, 'Daniel Svensson': 76, 'Yan Couto': 77, 'Emre Can': 77, 'Niklas Süle': 78, 'Carney Chukwuemeka': 78})
add('AS Roma', 'ROM', 'Roma', 'ROM', 'Roma', 'İtalya', 'Serie A', 'Stadio Olimpico',
    K(P('#8E1F2F', '#F0BC42', '#8E1F2F', '#8E1F2F', num='#F0BC42'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#8E1F2F'), P('#111111', num='#F0BC42')), 79, 0.55, 70634, '3-5-2', 'Gian Piero Gasperini', 1927,
    {'Mile Svilar': 84, 'Paulo Dybala': 84, 'Lorenzo Pellegrini': 79, 'Bryan Cristante': 78, 'Manu Koné': 81, 'Gianluca Mancini': 80, 'Evan Ndicka': 81, 'Mario Hermoso': 76, 'Wesley': 78, 'Zeki Çelik': 77, 'Angeliño': 79, 'Artem Dovbyk': 80, 'Evan Ferguson': 77, 'Matías Soulé': 81, 'Leon Bailey': 78, 'Neil El Aynaoui': 77, 'Stephan El Shaarawy': 75, 'Devyne Rensch': 76})
add('Sporting CP', 'SCP', 'Sporting CP', 'SCP', 'Lizbon', 'Portekiz', 'Liga Portugal', 'Estádio José Alvalade',
    K(P('#008B5A', '#FFFFFF', '#000000', '#008B5A', pattern='hoops'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#008B5A'), P('#F5A800', num='#000000')), 78, 0.6, 52707, '3-5-2', 'Rui Borges', 1906,
    {'Rui Silva': 79, 'Viktor Gyökeres': 86, 'Luis Suárez': 80, 'Pedro Gonçalves': 82, 'Francisco Trincão': 82, 'Morten Hjulmand': 82, 'Hidemasa Morita': 79, 'Ousmane Diomande': 80, 'Gonçalo Inácio': 81, 'Zeno Debast': 78, 'Maximiliano Araújo': 77, 'Geny Catamo': 77, 'Geovany Quenda': 78, 'Nuno Santos': 76, 'Eduardo Quaresma': 76, 'Conrad Harder': 76, 'João Simões': 74, 'Iván Fresneda': 75})
add('Aston Villa F.C.', 'AVL', 'Aston Villa', 'AVL', 'Birmingham', 'İngiltere', 'Premier League', 'Villa Park',
    K(P('#7A1A3A', '#94BEE5', '#FFFFFF', '#7A1A3A', num='#94BEE5'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#7A1A3A'), P('#F2C500', num='#000000')), 81, 0.55, 42918, '4-2-3-1', 'Unai Emery', 1874,
    {'Emiliano Martínez': 87, 'Ollie Watkins': 83, 'Morgan Rogers': 83, 'Youri Tielemans': 82, 'John McGinn': 80, 'Boubacar Kamara': 81, 'Amadou Onana': 80, 'Ezri Konsa': 81, 'Pau Torres': 81, 'Tyrone Mings': 78, 'Matty Cash': 78, 'Lucas Digne': 78, 'Ian Maatsen': 78, 'Donyell Malen': 79, 'Evann Guessand': 77, 'Jadon Sancho': 78, 'Emiliano Buendía': 77, 'Ross Barkley': 75, 'Lamare Bogarde': 72, 'Harvey Elliott': 78})
add('FC Porto', 'POR', 'FC Porto', 'POR', 'Porto', 'Portekiz', 'Liga Portugal', 'Estádio do Dragão',
    K(P('#003E7E', '#FFFFFF', '#003E7E', '#003E7E', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#003E7E'), P('#F39200', num='#000000')), 78, 0.6, 50033, '4-3-3', 'Francesco Farioli', 1893,
    {'Diogo Costa': 85, 'Samu Aghehowa': 82, 'Rodrigo Mora': 80, 'Alan Varela': 81, 'Gabri Veiga': 78, 'Pepê': 79, 'William Gomes': 76, 'Francisco Moura': 77, 'Jan Bednarek': 78, 'Nehuén Pérez': 77, 'Martim Fernandes': 76, 'Victor Froholdt': 77, 'Luuk de Jong': 76, 'Borja Sainz': 77, 'Zaidu Sanusi': 74, 'Alberto Costa': 75, 'Dominik Prpić': 73, 'Deniz Gül': 74})
add('Manchester United F.C.', 'MUN', 'Manchester United', 'MUN', 'Manchester', 'İngiltere', 'Premier League', 'Old Trafford',
    K(P('#DA291C', '#DA291C', '#FFFFFF', '#000000'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#DA291C'), P('#2F7B3A', num='#FFFFFF')), 81, 0.55, 74158, '3-5-2', 'Michael Carrick', 1878,
    {'Bruno Fernandes': 86, 'Bryan Mbeumo': 83, 'Matheus Cunha': 83, 'Benjamin Šeško': 80, 'Casemiro': 79, 'Kobbie Mainoo': 78, 'Manuel Ugarte': 78, 'Lisandro Martínez': 82, 'Matthijs de Ligt': 82, 'Leny Yoro': 80, 'Harry Maguire': 78, 'Luke Shaw': 77, 'Noussair Mazraoui': 79, 'Diogo Dalot': 78, 'Amad Diallo': 81, 'Patrick Dorgu': 75, 'Mason Mount': 77, 'Senne Lammens': 78, 'Altay Bayındır': 76, 'Ayden Heaven': 72, 'Joshua Zirkzee': 76})
add('Club Brugge KV', 'CLB', 'Club Brugge', 'CLB', 'Brugge', 'Belçika', 'Pro League', 'Jan Breydel Stadion',
    K(P('#0056A5', '#000000', '#000000', '#0056A5', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#0056A5'), P('#E4A500', num='#000000')), 75, 0.55, 29062, '4-2-3-1', 'Ivan Leko', 1891,
    {'Simon Mignolet': 78, 'Nordin Jackers': 75, 'Hans Vanaken': 81, 'Christos Tzolis': 80, 'Raphael Onyedika': 78, 'Ardon Jashari': 79, 'Brandon Mechele': 76, 'Joel Ordóñez': 78, 'Bjorn Meijer': 75, 'Kyriani Sabbe': 74, 'Ferran Jutglà': 77, 'Romeo Vermant': 74, 'Carlos Forbs': 76, 'Aleksandar Stanković': 76, 'Nicolò Tresoldi': 74, 'Jorne Spileers': 73, 'Hugo Siquet': 74, 'Zaid Romero': 73})
add('Real Betis', 'BET', 'Real Betis', 'BET', 'Sevilla', 'İspanya', 'LaLiga', 'La Cartuja',
    K(P('#00954C', '#FFFFFF', '#FFFFFF', '#00954C', pattern='stripes', num='#000000'), P('#000000', '#000000', '#000000', '#000000', num='#00954C'), P('#F26522', num='#000000')), 77, 0.55, 70000, '4-2-3-1', 'Manuel Pellegrini', 1907,
    {'Isco': 83, 'Antony': 82, 'Giovani Lo Celso': 80, 'Abde Ezzalzouli': 79, 'Pablo Fornals': 78, 'Sergi Altimira': 76, 'Marc Bartra': 76, 'Natan': 77, 'Héctor Bellerín': 76, 'Junior Firpo': 76, 'Ricardo Rodríguez': 74, 'Cédric Bakambu': 76, 'Cucho Hernández': 78, 'Chimy Ávila': 74, 'Pau López': 77, 'Álvaro Valles': 78, 'Sofyan Amrabat': 77, 'Nelson Deossa': 74, 'Rodrigo Riquelme': 76, 'Ángel Ortiz': 73, 'Valentín Gómez': 74, 'Diego Llorente': 75})
add('PSV Eindhoven', 'PSV', 'PSV Eindhoven', 'PSV', 'Eindhoven', 'Hollanda', 'Eredivisie', 'Philips Stadion',
    K(P('#ED1C24', '#FFFFFF', '#000000', '#ED1C24', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#ED1C24'), P('#7AC143', num='#000000')), 77, 0.65, 35000, '4-3-3', 'Peter Bosz', 1913,
    {'Joël Drommel': 74, 'Matěj Kovář': 76, 'Ismael Saibari': 82, 'Joey Veerman': 81, 'Guus Til': 78, 'Jerdy Schouten': 80, 'Ivan Perišić': 78, 'Ruben van Bommel': 78, 'Ricardo Pepi': 78, 'Mauro Júnior': 76, 'Ryan Flamingo': 77, 'Armando Obispo': 74, 'Sergiño Dest': 79, 'Alassane Pléa': 78, 'Esmir Bajraktarević': 74, 'Yarek Gasiorowski': 75, 'Anass Salah-Eddine': 75, 'Paul Wanner': 76, 'Myron Boadu': 75, 'Dennis Man': 77})
add('Feyenoord', 'FEY', 'Feyenoord', 'FEY', 'Rotterdam', 'Hollanda', 'Eredivisie', 'De Kuip',
    K(P('#E31C23', '#FFFFFF', '#000000', '#000000', pattern='halves'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#E31C23'), P('#1A6FBA', num='#FFFFFF')), 76, 0.6, 47500, '4-3-3', 'Giovanni van Bronckhorst', 1908,
    {'Timon Wellenreuther': 76, 'Quinten Timber': 80, 'Sem Steijn': 78, 'Anis Hadj Moussa': 78, 'Ayase Ueda': 77, 'Igor Paixão': 80, 'Givairo Read': 75, 'Jordan Lotomba': 75, 'Gernot Trauner': 76, 'Anel Ahmedhodžić': 77, 'Gijs Smal': 74, 'Luciano Valente': 75, 'Casper Tengstedt': 75, 'Jakub Moder': 75, 'Oussama Targhalline': 75, 'Leo Sauer': 73, 'Cyle Larin': 74, 'Tsuyoshi Watanabe': 76, 'Hwang In-beom': 77, 'Justin Bijlow': 75, 'Ibrahim Osman': 73})
add('Lille OSC', 'LIL', 'Lille', 'LIL', 'Lille', 'Fransa', 'Ligue 1', 'Stade Pierre-Mauroy',
    K(P('#E01E13', '#E01E13', '#FFFFFF', '#E01E13'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#E01E13'), P('#111111', num='#E01E13')), 77, 0.55, 50186, '4-2-3-1', 'Davide Ancelotti', 1944,
    {'Lucas Chevalier': 83, 'Berke Özer': 78, 'Olivier Giroud': 75, 'Hákon Arnar Haraldsson': 80, 'Benjamin André': 79, 'Ngal\'ayel Mukau': 78, 'Ayyoub Bouaddi': 78, 'Alexsandro': 80, 'Bafodé Diakité': 79, 'Thomas Meunier': 76, 'Aïssa Mandi': 75, 'Osame Sahraoui': 78, 'Matias Fernandez-Pardo': 76, 'Hamza Igamane': 77, 'Félix Correia': 76, 'Nabil Bentaleb': 75, 'Romain Perraud': 75, 'Chuba Akpom': 74, 'Marius Broholm': 72, 'Nathan Ngoy': 76, 'André Gomes': 75})
add('FK Bodø/Glimt', 'BOD', 'Bodø/Glimt', 'BOD', 'Bodø', 'Norveç', 'Eliteserien', 'Aspmyra Stadion',
    K(P('#FFE100', '#000000', '#000000', '#FFE100', num='#000000'), P('#000000', '#000000', '#000000', '#000000', num='#FFE100'), P('#1A6FBA', num='#FFFFFF')), 73, 0.7, 8270, '4-3-3', 'Kjetil Knutsen', 1916,
    {'Nikita Haikin': 76, 'Patrick Berg': 79, 'Ulrik Saltnes': 77, 'Håkon Evjen': 78, 'Jens Petter Hauge': 78, 'Kasper Høgh': 77, 'Ole Blomberg': 74, 'Sondre Brunstad Fet': 75, 'Fredrik Bjørkan': 75, 'Odin Bjørtuft': 75, 'Jostein Gundersen': 74, 'Haitam Aleesami': 73, 'Fredrik Sjøvold': 73, 'Andreas Helmersen': 74, 'Isak Dybvik Määttä': 74, 'Mikkel Konradsen Hoem': 72, 'Sondre Auklend': 74, 'Mathias Jørgensen': 72, 'Nino Žugelj': 73, 'Villads Nielsen': 72})
add('SSC Napoli', 'NAP', 'Napoli', 'NAP', 'Napoli', 'İtalya', 'Serie A', 'Stadio Diego Armando Maradona',
    K(P('#12A0D7', '#12A0D7', '#FFFFFF', '#12A0D7'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#12A0D7'), P('#F7B500', num='#000000')), 82, 0.55, 54732, '4-3-3', 'Massimiliano Allegri', 1926,
    {'Alex Meret': 82, 'Vanja Milinković-Savić': 80, 'Scott McTominay': 86, 'Kevin De Bruyne': 85, 'Stanislav Lobotka': 84, 'André-Frank Zambo Anguissa': 83, 'Rasmus Højlund': 81, 'Lorenzo Lucca': 78, 'Matteo Politano': 80, 'David Neres': 79, 'Noa Lang': 79, 'Alessandro Buongiorno': 83, 'Amir Rrahmani': 80, 'Sam Beukema': 78, 'Giovanni Di Lorenzo': 81, 'Leonardo Spinazzola': 77, 'Miguel Gutiérrez': 78, 'Billy Gilmour': 77, 'Eljif Elmas': 77, 'Juan Jesus': 74, 'Mathías Olivera': 78})
add('RB Leipzig', 'RBL', 'RB Leipzig', 'RBL', 'Leipzig', 'Almanya', 'Bundesliga', 'Red Bull Arena',
    K(P('#FFFFFF', '#DD0741', '#FFFFFF', '#FFFFFF', num='#DD0741'), P('#DD0741', '#DD0741', '#DD0741', '#DD0741'), P('#F2C500', num='#000000')), 78, 0.6, 47069, '4-2-3-1', 'Martín Demichelis', 2009,
    {'Péter Gulácsi': 80, 'Maarten Vandevoordt': 76, 'Xavi Simons': 83, 'Loïs Openda': 81, 'Benjamin Šeško': 81, 'Antonio Nusa': 79, 'Xaver Schlager': 79, 'Christoph Baumgartner': 78, 'Nicolas Seiwald': 77, 'Castello Lukeba': 82, 'Willi Orbán': 79, 'David Raum': 80, 'Ridle Baku': 76, 'Lutsharel Geertruida': 77, 'Arthur Vermeeren': 76, 'Yan Diomande': 77, 'Johan Bakayoko': 78, 'Romulo': 78, 'Assan Ouédraogo': 75, 'Conrad Harder': 76, 'El Chadaille Bitshiabu': 75, 'Amadou Haidara': 76, 'Kevin Kampl': 74})
add('Villarreal CF', 'VIL', 'Villarreal', 'VIL', 'Villarreal', 'İspanya', 'LaLiga', 'Estadio de la Cerámica',
    K(P('#FFE667', '#FFE667', '#005187', '#FFE667', num='#005187'), P('#005187', '#005187', '#005187', '#005187', num='#FFE667'), P('#111111', num='#FFE667')), 79, 0.6, 23008, '4-4-2'.replace('4-4-2','4-3-3'), 'Iñigo Pérez', 1923,
    {'Luiz Júnior': 79, 'Arnau Tenas': 76, 'Gerard Moreno': 80, 'Ayoze Pérez': 80, 'Tajon Buchanan': 77, 'Nicolas Pépé': 78, 'Pape Gueye': 79, 'Dani Parejo': 78, 'Santi Comesaña': 77, 'Thomas Partey': 78, 'Juan Foyth': 78, 'Logan Costa': 77, 'Rafa Marín': 76, 'Renato Veiga': 78, 'Sergi Cardona': 77, 'Alfonso Pedraza': 75, 'Santiago Mouriño': 75, 'Georges Mikautadze': 80, 'Tani Oluwaseyi': 76, 'Alberto Moleiro': 78, 'Ilias Akhomach': 75, 'Manor Solomon': 77})
add('FC Shakhtar Donetsk', 'SHK', 'Shakhtar Donetsk', 'SHK', 'Donetsk', 'Ukrayna', 'Premyer Liha', 'Arena Lviv',
    K(P('#F26522', '#000000', '#000000', '#F26522', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#F26522'), P('#3F7FBF', num='#FFFFFF')), 74, 0.6, 34915, '4-3-3', 'Arda Turan', 1936,
    {'Dmytro Riznyk': 76, 'Kauã Elias': 76, 'Eguinaldo': 75, 'Pedrinho': 78, 'Alisson Santana': 74, 'Marlon Gomes': 76, 'Oleh Ocheretko': 74, 'Artem Bondarenko': 76, 'Yehor Nazaryna': 74, 'Mykola Matviyenko': 76, 'Valeriy Bondar': 75, 'Yukhym Konoplya': 75, 'Irakli Azarovi': 74, 'Isaque': 74, 'Newerton': 74, 'Luca Meirelles': 74, 'Vinícius Tobias': 73, 'Marlon Santos': 73, 'Lucas Ferreira': 74, 'Heorhiy Sudakov': 78})
add('SK Slavia Prague', 'SLA', 'Slavia Praha', 'SLA', 'Prag', 'Çekya', 'Chance Liga', 'Fortuna Arena',
    K(P('#E2231A', '#FFFFFF', '#FFFFFF', '#E2231A', pattern='halves'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#E2231A'), P('#F2C500', num='#000000')), 73, 0.6, 19370, '3-5-2', 'Jindřich Trpišovský', 1892,
    {'Jindřich Staněk': 75, 'Jakub Markovič': 73, 'Tomáš Chorý': 76, 'Mojmír Chytil': 74, 'Ivan Schranz': 75, 'Lukáš Provod': 76, 'Christos Zafeiris': 76, 'Oscar Dorley': 75, 'David Zima': 75, 'Tomáš Holeš': 76, 'Igoh Ogbu': 76, 'Tomáš Vlček': 74, 'David Douděra': 74, 'Ondřej Zmrzlý': 74, 'Michal Sadílek': 74, 'Erik Prekop': 73, 'Vasil Kušej': 73, 'Youssoupha Sanyang': 73, 'Muhamed Tijani': 72, 'Jan Bořil': 72, 'El Hadji Malick Diouf': 74, 'Ousou': 73})
add('ŠK Slovan Bratislava', 'SLB', 'Slovan Bratislava', 'SLB', 'Bratislava', 'Slovakya', 'Niké Liga', 'Tehelné pole',
    K(P('#5AA0DA', '#FFFFFF', '#FFFFFF', '#5AA0DA'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#5AA0DA'), P('#F2C500', num='#000000')), 69, 0.5, 22500, '4-2-3-1', 'Yaya Touré', 1919,
    {'Dominik Takáč': 72, 'Martin Trnovský': 70, 'Vladimír Weiss': 74, 'Tigran Barseghyan': 74, 'Marko Tolić': 72, 'David Strelec': 74, 'Nino Marcelli': 72, 'Kenan Bajrić': 72, 'Guram Kashia': 72, 'Kevin Wimmer': 71, 'Lucas Lovat': 71, 'Kyriakos Savvidis': 71, 'Danylo Ignatenko': 72, 'Rahim Ibrahim': 72, 'Andraž Šporar': 73, 'Idjessi Metsoko': 72, 'Sandro Cruz': 71, 'Mykola Kukharevych': 71, 'Robert Mak': 70, 'Alasana Yirajang': 71})
add('VfB Stuttgart', 'VFB', 'VfB Stuttgart', 'VFB', 'Stuttgart', 'Almanya', 'Bundesliga', 'MHPArena',
    K(P('#FFFFFF', '#E32219', '#FFFFFF', '#FFFFFF', num='#E32219'), P('#E32219', '#E32219', '#E32219', '#E32219'), P('#2F7B3A', num='#FFFFFF')), 78, 0.6, 60058, '4-2-3-1', 'Sebastian Hoeneß', 1893,
    {'Alexander Nübel': 81, 'Fabian Bredlow': 74, 'Deniz Undav': 81, 'Ermedin Demirović': 79, 'Nick Woltemade': 80, 'Chris Führich': 77, 'Jamie Leweling': 78, 'Angelo Stiller': 82, 'Atakan Karazor': 78, 'Enzo Millot': 80, 'Yannik Keitel': 75, 'Jeff Chabot': 78, 'Maximilian Mittelstädt': 80, 'Josha Vagnoman': 76, 'Ameen Al-Dakhil': 76, 'Finn Jeltsch': 76, 'Luca Jaquez': 74, 'Lorenz Assignon': 76, 'Bilal El Khannouss': 78, 'Tiago Tomás': 77, 'Badredine Bouanani': 74, 'Chema Andrés': 74, 'Julian Chabot': 75})
add('AEK Athens F.C.', 'AEK', 'AEK Atina', 'AEK', 'Atina', 'Yunanistan', 'Süper Lig Yunanistan', 'OPAP Arena',
    K(P('#FFD400', '#000000', '#000000', '#FFD400', num='#000000'), P('#000000', '#000000', '#000000', '#000000', num='#FFD400'), P('#1A6FBA', num='#FFFFFF')), 72, 0.5, 32500, '4-2-3-1', 'Marko Nikolić', 1924,
    {'Thomas Strakosha': 76, 'Konstantinos Galanopoulos': 72, 'Orbelín Pineda': 76, 'Petros Mantalos': 74, 'Erik Lamela': 73, 'Luka Jović': 76, 'Anthony Martial': 76, 'Frantzdy Pierrot': 74, 'Razvan Marin': 76, 'Roberto Pereyra': 74, 'Aboubakary Koita': 74, 'Niclas Eliasson': 76, 'Domagoj Vida': 73, 'Harold Moukoudi': 74, 'Filipe Relvas': 73, 'Lazaros Rota': 73, 'Ehsan Hajsafi': 72, 'Jens Jønsson': 73, 'Damian Szymański': 74, 'Mijat Gaćinović': 74, 'Ioannis Kosti': 72})
add('LASK', 'LSK', 'LASK', 'LSK', 'Linz', 'Avusturya', 'Bundesliga (Avusturya)', 'Raiffeisen Arena',
    K(P('#000000', '#FFFFFF', '#000000', '#000000', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#000000'), P('#F2C500', num='#000000')), 70, 0.55, 19080, '3-5-2', 'Dietmar Kühbauer', 1908,
    {'Tobias Lawal': 74, 'Sascha Horvath': 75, 'Robert Žulj': 74, 'Ivan Ljubić': 73, 'Valon Berisha': 73, 'Melayro Bogarde': 73, 'Christoph Lang': 72, 'Philipp Ziereis': 73, 'Andrés Andrade': 73, 'George Bello': 73, 'Maximilian Entrup': 74, 'Samuel Adeniran': 73, 'Moses Usor': 73, 'Ibrahim Mustapha': 72, 'Jérôme Boateng': 72, 'Tobias Anselm': 71, 'Lenny Pintor': 72, 'Nicolas Ferreira': 71, 'Marin Ljubičić': 73})
add('Como 1907', 'COM', 'Como', 'COM', 'Como', 'İtalya', 'Serie A', 'Stadio Giuseppe Sinigaglia',
    K(P('#1B4FA0', '#FFFFFF', '#1B4FA0', '#1B4FA0'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#1B4FA0'), P('#F2C500', num='#000000')), 77, 0.65, 13602, '4-2-3-1', 'Cesc Fàbregas', 1907,
    {'Jean Butez': 76, 'Pepe Reina': 72, 'Nico Paz': 84, 'Assane Diao': 80, 'Jesús Rodríguez': 79, 'Álvaro Morata': 79, 'Tasos Douvikas': 77, 'Máximo Perrone': 78, 'Lucas Da Cunha': 77, 'Sergi Roberto': 75, 'Nicolas Kühn': 78, 'Martin Baturina': 79, 'Marc-Oliver Kempf': 76, 'Jacobo Ramón': 76, 'Alberto Moreno': 74, 'Alex Valle': 76, 'Ignace Van der Brempt': 75, 'Diego Carlos': 77, 'Edoardo Goldaniga': 74, 'Alessandro Gabrielloni': 72, 'Alieu Fadera': 74, 'Mergim Vojvoda': 75, 'Jayden Addai': 74, 'Ivan Smolčić': 74})
add('RC Lens', 'LEN', 'Lens', 'LEN', 'Lens', 'Fransa', 'Ligue 1', 'Stade Bollaert-Delelis',
    K(P('#EC1C24', '#FFD200', '#FFD200', '#EC1C24', pattern='halves', num='#000000'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#EC1C24'), P('#111111', num='#FFD200')), 75, 0.6, 38223, '3-5-2', 'Dino Toppmöller', 1906,
    {'Robin Risser': 75, 'Mathew Ryan': 75, 'Florian Thauvin': 80, 'Odsonne Édouard': 77, 'Wesley Saïd': 76, 'Rayan Fofana': 74, 'Adrien Thomasson': 77, 'Andy Diouf': 76, 'Mamadou Sangaré': 76, 'Deiver Machado': 76, 'Ruben Aguilar': 75, 'Jonathan Gradit': 76, 'Facundo Medina': 79, 'Malang Sarr': 75, 'Matthieu Udol': 75, 'Jhoanner Chávez': 74, 'Samson Baidoo': 74, 'Morgan Guilavogui': 75, 'Abdallah Sima': 74, 'Angelo Fulgini': 75, 'Fodé Sylla': 73, 'Anass Zaroury': 76, 'Rémy Labeau Lascary': 73})
add('Viking FK', 'VIK', 'Viking', 'VIK', 'Stavanger', 'Norveç', 'Eliteserien', 'SR-Bank Arena',
    K(P('#1B3F8F', '#FFFFFF', '#FFFFFF', '#1B3F8F'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#1B3F8F'), P('#F2C500', num='#000000')), 68, 0.6, 15900, '4-3-3', 'Bjarte Lunde Aarsheim', 1899,
    {'Patrik Gunnarsson': 72, 'Zlatko Tripić': 73, 'Sondre Bjørshol': 71, 'Kristoffer Løkberg': 71, 'Harald Nilsen Tangen': 72, 'Lars-Jørgen Salvesen': 72, 'Sander Svendsen': 72, 'Djibril Diop': 71, 'Gianni Stensness': 71, 'Christian Dahle Borchgrevink': 71, 'Herman Haugen': 72, 'Yann-Erik de Lanlay': 70, 'Simen Kvia-Egeskog': 71, 'Mai Traoré': 71, 'Jost Urbančič': 70, 'Jorge Zapata': 70})
add('Sabah FK (Azerbaijan)', 'SAB', 'Sabah', 'SAB', 'Bakü', 'Azerbaycan', 'Premyer Liqa', 'Bank Respublika Arena',
    K(P('#111111', '#FFFFFF', '#111111', '#111111', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#111111'), P('#F2C500', num='#000000')), 64, 0.5, 8969, '4-2-3-1', 'Valdas Dambrauskas', 2017,
    {'Aleksey Isayev': 69, 'Kaheem Parris': 69, 'Ivan Lepinjica': 68, 'Christian Nwachukwu': 68, 'Joy-Lance Mickels': 69, 'Veljko Simić': 68, 'Umarali Rakhmonaliev': 68, 'Stas Pokatilov': 67, 'Rahman Dashdamirov': 67, 'Tymoteusz Puchacz': 68, 'Orphé Mbina': 68, 'Zinédine Ould Khaled': 68, 'Younes Lachaab': 67, 'Du Queiroz': 68, 'Steve Solvet': 67, 'Erivaldo Almeida': 66})

# ---- Süper Lig (mevcut 4 büyük dışındaki 14) ----
add('Alanyaspor', 'ALA', 'Alanyaspor', 'ALA', 'Alanya', 'Türkiye', 'Süper Lig', 'Alanya Oba Stadyumu',
    K(P('#F37021', '#00A651', '#F37021', '#F37021', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#F37021'), P('#111111', num='#F37021')), 68, 0.5, 9789, '4-2-3-1', 'João Pereira', 1948)
add('Amed S.F.K.', 'AMD', 'Amedspor', 'AMD', 'Diyarbakır', 'Türkiye', 'Süper Lig', 'Diyarbakır Stadyumu',
    K(P('#E30613', '#00843D', '#E30613', '#E30613', pattern='halves'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#E30613'), P('#F2C500', num='#000000')), 66, 0.5, 30480, '4-2-3-1', 'Besnik Hasi', 1972)
add('İstanbul Başakşehir F.K.', 'IBFK', 'Başakşehir', 'BAŞ', 'İstanbul', 'Türkiye', 'Süper Lig', 'Başakşehir Fatih Terim Stadyumu',
    K(P('#F47B20', '#1E2A5A', '#1E2A5A', '#F47B20'), P('#1E2A5A', '#1E2A5A', '#1E2A5A', '#1E2A5A', num='#F47B20'), P('#2BB673', num='#000000')), 71, 0.5, 17319, '4-2-3-1', 'Nuri Şahin', 1990)
add('Çorum F.K.', 'COR', 'Çorum FK', 'ÇOR', 'Çorum', 'Türkiye', 'Süper Lig', 'Çorum Şehir Stadyumu',
    K(P('#E30613', '#1F2A5C', '#1F2A5C', '#E30613', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#E30613'), P('#F2C500', num='#000000')), 66, 0.5, 13119, '4-2-3-1', 'Uğur Uçar', 1997)
add('Erzurumspor F.K.', 'ERZ', 'Erzurumspor', 'ERZ', 'Erzurum', 'Türkiye', 'Süper Lig', 'Kazım Karabekir Stadyumu',
    K(P('#1B4FA0', '#FFFFFF', '#1B4FA0', '#1B4FA0', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#1B4FA0'), P('#F2C500', num='#000000')), 65, 0.45, 21374, '4-2-3-1', 'Serkan Özbalta', 2005)
add('Eyüpspor', 'EYP', 'Eyüpspor', 'EYP', 'İstanbul', 'Türkiye', 'Süper Lig', 'Recep Tayyip Erdoğan Stadyumu',
    K(P('#6A2C91', '#FFD200', '#6A2C91', '#6A2C91', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#6A2C91'), P('#2BB673', num='#000000')), 69, 0.5, 14234, '4-2-3-1', 'Özhan Pulat', 1919)
add('Gaziantep F.K.', 'GFK', 'Gaziantep FK', 'GAZ', 'Gaziantep', 'Türkiye', 'Süper Lig', 'Gaziantep Stadyumu',
    K(P('#E30613', '#000000', '#000000', '#E30613', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#E30613'), P('#F2C500', num='#000000')), 68, 0.5, 30320, '4-2-3-1', 'Orhan Ak', 1988)
add('Gençlerbirliği S.K.', 'GB', 'Gençlerbirliği', 'GEN', 'Ankara', 'Türkiye', 'Süper Lig', 'Eryaman Stadyumu',
    K(P('#E30613', '#000000', '#000000', '#E30613', pattern='halves'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#E30613'), P('#2BB673', num='#000000')), 67, 0.5, 20560, '4-2-3-1', 'Metin Diyadin', 1923)
add('Göztepe S.K.', 'GOZ', 'Göztepe', 'GÖZ', 'İzmir', 'Türkiye', 'Süper Lig', 'Gürsel Aksel Stadyumu',
    K(P('#F5B800', '#E30613', '#E30613', '#F5B800', pattern='stripes', num='#000000'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#E30613'), P('#111111', num='#F5B800')), 71, 0.55, 20035, '3-5-2', 'Stanimir Stoilov', 1925)
add('Kasımpaşa S.K.', 'KAS', 'Kasımpaşa', 'KAS', 'İstanbul', 'Türkiye', 'Süper Lig', 'Recep Tayyip Erdoğan Stadyumu',
    K(P('#1B3F8F', '#FFFFFF', '#1B3F8F', '#1B3F8F', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#1B3F8F'), P('#F2C500', num='#000000')), 69, 0.5, 14234, '4-2-3-1', 'Emre Belözoğlu', 1921)
add('Kocaelispor', 'KOC', 'Kocaelispor', 'KOC', 'İzmit', 'Türkiye', 'Süper Lig', 'Kocaeli Stadyumu',
    K(P('#00843D', '#000000', '#000000', '#00843D', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#00843D'), P('#F2C500', num='#000000')), 68, 0.5, 34829, '4-2-3-1', 'Selçuk İnan', 1966)
add('Konyaspor', 'KON', 'Konyaspor', 'KON', 'Konya', 'Türkiye', 'Süper Lig', 'Konya Büyükşehir Stadyumu',
    K(P('#00843D', '#FFFFFF', '#FFFFFF', '#00843D', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#00843D'), P('#111111', num='#00843D')), 69, 0.5, 41600, '4-2-3-1', 'İlhan Palut', 1922)
add('Çaykur Rizespor', 'RIZ', 'Çaykur Rizespor', 'RİZ', 'Rize', 'Türkiye', 'Süper Lig', 'Rize Şehir Stadyumu',
    K(P('#00843D', '#1B3F8F', '#00843D', '#00843D', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#00843D'), P('#F2C500', num='#000000')), 68, 0.5, 14879, '4-2-3-1', 'Recep Uçar', 1953)
add('Samsunspor', 'SAM', 'Samsunspor', 'SAM', 'Samsun', 'Türkiye', 'Süper Lig', 'Samsun 19 Mayıs Stadyumu',
    K(P('#E30613', '#FFFFFF', '#FFFFFF', '#E30613', pattern='stripes'), P('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', num='#E30613'), P('#111111', num='#E30613')), 72, 0.55, 33919, '4-2-3-1', 'Thorsten Fink', 1965)

# mevcut 12 (yalnızca ek meta; kadro/forma teams.js'te kalır)
EX = {
 'Galatasaray S.K. (football)': ('GS', 'Okan Buruk', 53387, 1905), 'Fenerbahçe S.K. (football)': ('FB', 'Dirk Kuyt', 47911, 1907),
 'Beşiktaş J.K.': ('BJK', 'Vincenzo Italiano', 42684, 1903), 'Trabzonspor': ('TS', 'Hüseyin Çimşir', 40980, 1967),
 'Real Madrid CF': ('RMA', 'José Mourinho', 83186, 1902), 'FC Barcelona': ('BAR', 'Hansi Flick', 105000, 1899),
 'Manchester City F.C.': ('MCI', 'Enzo Maresca', 61038, 1880), 'Liverpool F.C.': ('LIV', 'Andoni Iraola', 61276, 1892),
 'Arsenal F.C.': ('ARS', 'Mikel Arteta', 60704, 1886), 'FC Bayern Munich': ('BAY', 'Vincent Kompany', 75024, 1900),
 'Paris Saint-Germain FC': ('PSG', 'Luis Enrique', 47929, 1970), 'Inter Milan': ('INT', 'Cristian Chivu', 75817, 1908),
}
for page, (id, mgr, cap, founded) in EX.items():
    M[page] = dict(id=id, existing=True, manager=mgr, capacity=cap, founded=founded)
json.dump(M, open('clubs/meta.json', 'w'), ensure_ascii=False, indent=1)
print('meta', len(M))
