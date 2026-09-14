/* =====================================================================
   2026-27 SEZONU GÜNCEL KADROLARI
   Kaynaklar: UEFA resmi kadro listeleri, kulüp açıklamaları (Eyl 2026),
   Premier League 25 kişilik listeler, Transfermarkt/Tribuna/FotMob.
   Format: [forma no, isim, mevki, güç(1-99)]
   xi dizisi, formasyon slot sırasıyla eşleşir (bkz. entities.js FORMATIONS)
   ===================================================================== */
(function (root) {
  const FS = (root.FS = root.FS || {});

  FS.TEAMS = [
    /* ---------------- SÜPER LİG ---------------- */
    {
      id: 'GS', name: 'Galatasaray', short: 'GAL', city: 'İstanbul', league: 'Süper Lig', stadium: 'RAMS Park',
      formation: '4-2-3-1', mentality: 0.6,
      kits: {
        home: { pattern: 'halves', c1: '#F4B21A', c2: '#A32638', shorts: '#A32638', socks: '#F4B21A', num: '#FFFFFF' },
        away: { pattern: 'plain', c1: '#111111', c2: '#111111', shorts: '#111111', socks: '#111111', num: '#F4B21A' },
        gk:   { pattern: 'plain', c1: '#2E8B57', c2: '#2E8B57', shorts: '#2E8B57', socks: '#2E8B57', num: '#FFFFFF' },
      },
      xi: [
        [1, 'Uğurcan Çakır', 'GK', 82],
        [90, 'Wilfried Singo', 'RB', 80], [6, 'Davinson Sánchez', 'CB', 82], [42, 'Abdülkerim Bardakcı', 'CB', 79], [4, 'Ismail Jakobs', 'LB', 78],
        [34, 'Lucas Torreira', 'DM', 82], [8, 'Gabriel Sara', 'DM', 81],
        [10, 'Leroy Sané', 'RW', 84], [20, 'İlkay Gündoğan', 'AM', 82], [77, 'Rafael Leão', 'LW', 85],
        [45, 'Victor Osimhen', 'ST', 88],
      ],
      bench: [
        [19, 'Günay Güvenç', 'GK', 74], [23, 'Kaan Ayhan', 'CB', 76], [17, 'Eren Elmalı', 'LB', 76], [99, 'Mario Lemina', 'DM', 79],
        [83, 'Aleksey Batrakov', 'AM', 80], [53, 'Barış Alper Yılmaz', 'RW', 80], [11, 'Yunus Akgün', 'RW', 78], [7, 'Roland Sallai', 'RW', 78],
      ],
    },
    {
      id: 'FB', name: 'Fenerbahçe', short: 'FEN', city: 'İstanbul', league: 'Süper Lig', stadium: 'Chobani Stadyumu',
      formation: '4-2-3-1', mentality: 0.6,
      kits: {
        home: { pattern: 'stripes', c1: '#FFED00', c2: '#0A2A5C', shorts: '#0A2A5C', socks: '#0A2A5C', num: '#FFFFFF' },
        away: { pattern: 'plain', c1: '#FFFFFF', c2: '#FFFFFF', shorts: '#FFFFFF', socks: '#FFFFFF', num: '#0A2A5C' },
        gk:   { pattern: 'plain', c1: '#6E6E6E', c2: '#6E6E6E', shorts: '#333333', socks: '#333333', num: '#FFFFFF' },
      },
      xi: [
        [31, 'Ederson', 'GK', 86],
        [27, 'Nélson Semedo', 'RB', 80], [37, 'Milan Škriniar', 'CB', 83], [5, 'Nathan Aké', 'CB', 81], [33, 'Archie Brown', 'LB', 77],
        [3, 'İsmail Yüksek', 'DM', 78], [7, 'N\'Golo Kanté', 'DM', 82],
        [11, 'Mason Greenwood', 'RW', 85], [21, 'Marco Asensio', 'AM', 83], [9, 'Kerem Aktürkoğlu', 'LW', 82],
        [10, 'Romelu Lukaku', 'ST', 84],
      ],
      bench: [
        [13, 'Tarık Çetin', 'GK', 75], [18, 'Mert Müldür', 'RB', 77], [4, 'Çağlar Söyüncü', 'CB', 77], [6, 'Mattéo Guendouzi', 'CM', 80],
        [17, 'İrfan Can Kahveci', 'AM', 79], [70, 'Oğuz Aydın', 'RW', 77], [94, 'Vedat Muriqi', 'ST', 78], [23, 'Dorgeles Nene', 'LW', 77],
      ],
    },
    {
      id: 'BJK', name: 'Beşiktaş', short: 'BJK', city: 'İstanbul', league: 'Süper Lig', stadium: 'Tüpraş Stadyumu',
      formation: '4-2-3-1', mentality: 0.55,
      kits: {
        home: { pattern: 'stripes', c1: '#000000', c2: '#FFFFFF', shorts: '#000000', socks: '#000000', num: '#FFFFFF' },
        away: { pattern: 'plain', c1: '#FFFFFF', c2: '#FFFFFF', shorts: '#FFFFFF', socks: '#FFFFFF', num: '#000000' },
        gk:   { pattern: 'plain', c1: '#FF7A00', c2: '#FF7A00', shorts: '#FF7A00', socks: '#FF7A00', num: '#000000' },
      },
      xi: [
        [1, 'Alexander Nübel', 'GK', 81],
        [62, 'Amir Murillo', 'RB', 77], [12, 'Emmanuel Agbadou', 'CB', 79], [35, 'Tiago Djaló', 'CB', 78], [33, 'Rıdvan Yılmaz', 'LB', 76],
        [4, 'Wilfred Ndidi', 'DM', 80], [6, 'Salih Özcan', 'DM', 78],
        [18, 'Václav Černý', 'RW', 78], [10, 'Orkun Kökçü', 'AM', 83], [19, 'Leandro Trossard', 'LW', 82],
        [9, 'Dušan Vlahović', 'ST', 85],
      ],
      bench: [
        [80, 'Doğan Alemdar', 'GK', 74], [53, 'Emirhan Topçu', 'CB', 75], [22, 'Taylan Bulut', 'RB', 74], [21, 'Fabio Miretti', 'CM', 77],
        [7, 'Milot Rashica', 'RW', 76], [17, 'Ernest Poku', 'RW', 75], [27, 'Semih Kılıçsoy', 'ST', 77], [99, 'Oh Hyeon-gyu', 'ST', 76],
      ],
    },
    {
      id: 'TS', name: 'Trabzonspor', short: 'TRA', city: 'Trabzon', league: 'Süper Lig', stadium: 'Papara Park',
      formation: '4-2-3-1', mentality: 0.55,
      kits: {
        home: { pattern: 'stripes', c1: '#5C1A33', c2: '#2F5DA8', shorts: '#FFFFFF', socks: '#5C1A33', num: '#FFFFFF' },
        away: { pattern: 'plain', c1: '#FFFFFF', c2: '#FFFFFF', shorts: '#5C1A33', socks: '#FFFFFF', num: '#5C1A33' },
        gk:   { pattern: 'plain', c1: '#E5D80B', c2: '#E5D80B', shorts: '#E5D80B', socks: '#E5D80B', num: '#000000' },
      },
      xi: [
        [24, 'André Onana', 'GK', 82],
        [20, 'Wagner Pina', 'RB', 76], [15, 'Stefan Savić', 'CB', 78], [44, 'Arseniy Batagov', 'CB', 77], [55, 'Sidny Cabral', 'LB', 76],
        [6, 'Fabinho', 'DM', 79], [8, 'Benjamin Bouchouari', 'DM', 76],
        [10, 'Mohamed Salah', 'RW', 86], [17, 'Ruslan Malinovskyi', 'AM', 78], [7, 'Ernest Muçi', 'LW', 77],
        [30, 'Paul Onuachu', 'ST', 79],
      ],
      bench: [
        [1, 'Ahmet Doğan Yıldırım', 'GK', 70], [4, 'Samet Akaydın', 'CB', 74], [27, 'Chibuike Nwaiwu', 'CB', 74], [5, 'Okay Yokuşlu', 'DM', 74],
        [11, 'Ozan Tufan', 'CM', 74], [58, 'Aral Şimşir', 'LW', 73], [14, 'Umut Nayir', 'ST', 72], [9, 'Franculino Djú', 'ST', 76],
      ],
    },

    /* ---------------- AVRUPA DEVLERİ ---------------- */
    {
      id: 'RMA', name: 'Real Madrid', short: 'RMA', city: 'Madrid', league: 'LaLiga', stadium: 'Santiago Bernabéu',
      formation: '4-3-3', mentality: 0.65,
      kits: {
        home: { pattern: 'plain', c1: '#FFFFFF', c2: '#FFFFFF', shorts: '#FFFFFF', socks: '#FFFFFF', num: '#1B1B1B' },
        away: { pattern: 'plain', c1: '#1C2B4A', c2: '#1C2B4A', shorts: '#1C2B4A', socks: '#1C2B4A', num: '#F2C14E' },
        gk:   { pattern: 'plain', c1: '#1E9E5A', c2: '#1E9E5A', shorts: '#1E9E5A', socks: '#1E9E5A', num: '#FFFFFF' },
      },
      xi: [
        [1, 'Thibaut Courtois', 'GK', 89],
        [12, 'Trent Alexander-Arnold', 'RB', 86], [3, 'Éder Militão', 'CB', 85], [4, 'Dean Huijsen', 'CB', 86], [18, 'Álvaro Carreras', 'LB', 83],
        [8, 'Federico Valverde', 'CM', 89], [14, 'Aurélien Tchouaméni', 'DM', 85], [5, 'Jude Bellingham', 'CM', 90],
        [15, 'Arda Güler', 'RW', 86], [10, 'Kylian Mbappé', 'ST', 92], [7, 'Vinícius Júnior', 'LW', 89],
      ],
      bench: [
        [13, 'Andriy Lunin', 'GK', 82], [22, 'Antonio Rüdiger', 'CB', 84], [16, 'Ibrahima Konaté', 'CB', 84], [24, 'Denzel Dumfries', 'RB', 84],
        [6, 'Eduardo Camavinga', 'CM', 84], [20, 'Bernardo Silva', 'AM', 85], [11, 'Rodrygo', 'RW', 85], [9, 'Endrick', 'ST', 79],
      ],
    },
    {
      id: 'BAR', name: 'FC Barcelona', short: 'BAR', city: 'Barcelona', league: 'LaLiga', stadium: 'Spotify Camp Nou',
      formation: '4-2-3-1', mentality: 0.7,
      kits: {
        home: { pattern: 'stripes', c1: '#A50044', c2: '#004D98', shorts: '#004D98', socks: '#004D98', num: '#F5D547' },
        away: { pattern: 'plain', c1: '#F2E8C9', c2: '#F2E8C9', shorts: '#F2E8C9', socks: '#F2E8C9', num: '#A50044' },
        gk:   { pattern: 'plain', c1: '#FF8C1A', c2: '#FF8C1A', shorts: '#FF8C1A', socks: '#FF8C1A', num: '#000000' },
      },
      xi: [
        [1, 'Joan García', 'GK', 86],
        [23, 'Jules Koundé', 'RB', 86], [5, 'Pau Cubarsí', 'CB', 87], [15, 'Andreas Christensen', 'CB', 82], [3, 'Alejandro Balde', 'LB', 84],
        [16, 'Rodri', 'DM', 89], [8, 'Pedri', 'DM', 91],
        [10, 'Lamine Yamal', 'RW', 93], [20, 'Dani Olmo', 'AM', 85], [11, 'Raphinha', 'LW', 89],
        [9, 'Gabriel Jesus', 'ST', 82],
      ],
      bench: [
        [13, 'Wojciech Szczęsny', 'GK', 82], [2, 'João Cancelo', 'RB', 82], [24, 'Eric García', 'CB', 81], [21, 'Frenkie de Jong', 'CM', 85],
        [6, 'Gavi', 'CM', 83], [7, 'Fermín López', 'AM', 84], [14, 'Karim Adeyemi', 'LW', 82], [17, 'Anthony Gordon', 'LW', 82],
      ],
    },
    {
      id: 'MCI', name: 'Manchester City', short: 'MCI', city: 'Manchester', league: 'Premier League', stadium: 'Etihad Stadium',
      formation: '4-2-3-1', mentality: 0.7,
      kits: {
        home: { pattern: 'plain', c1: '#6CABDD', c2: '#6CABDD', shorts: '#FFFFFF', socks: '#6CABDD', num: '#FFFFFF' },
        away: { pattern: 'plain', c1: '#1B1B2F', c2: '#1B1B2F', shorts: '#1B1B2F', socks: '#1B1B2F', num: '#6CABDD' },
        gk:   { pattern: 'plain', c1: '#E8E337', c2: '#E8E337', shorts: '#E8E337', socks: '#E8E337', num: '#000000' },
      },
      xi: [
        [1, 'Gianluigi Donnarumma', 'GK', 89],
        [45, 'Abdukodir Khusanov', 'RB', 81], [3, 'Rúben Dias', 'CB', 86], [6, 'Marc Guéhi', 'CB', 85], [24, 'Joško Gvardiol', 'LB', 86],
        [5, 'Elliot Anderson', 'DM', 83], [20, 'Enzo Fernández', 'DM', 86],
        [42, 'Antoine Semenyo', 'RW', 84], [47, 'Phil Foden', 'AM', 86], [10, 'Rayan Cherki', 'LW', 85],
        [9, 'Erling Haaland', 'ST', 92],
      ],
      bench: [
        [28, 'Gerónimo Rulli', 'GK', 80], [21, 'Rayan Aït-Nouri', 'LB', 81], [82, 'Rico Lewis', 'RB', 80], [33, 'Nico O\'Reilly', 'LB', 80],
        [8, 'Mateo Kovačić', 'CM', 82], [14, 'Nico González', 'DM', 82], [11, 'Jérémy Doku', 'LW', 84], [7, 'Iliman Ndiaye', 'LW', 80],
      ],
    },
    {
      id: 'LIV', name: 'Liverpool', short: 'LIV', city: 'Liverpool', league: 'Premier League', stadium: 'Anfield',
      formation: '4-2-3-1', mentality: 0.65,
      kits: {
        home: { pattern: 'plain', c1: '#C8102E', c2: '#C8102E', shorts: '#C8102E', socks: '#C8102E', num: '#FFFFFF' },
        away: { pattern: 'plain', c1: '#F0F0E8', c2: '#F0F0E8', shorts: '#F0F0E8', socks: '#F0F0E8', num: '#C8102E' },
        gk:   { pattern: 'plain', c1: '#1FA37A', c2: '#1FA37A', shorts: '#1FA37A', socks: '#1FA37A', num: '#FFFFFF' },
      },
      xi: [
        [1, 'Alisson Becker', 'GK', 88],
        [12, 'Conor Bradley', 'RB', 81], [4, 'Virgil van Dijk', 'CB', 87], [33, 'Ronald Araújo', 'CB', 83], [6, 'Milos Kerkez', 'LB', 82],
        [38, 'Ryan Gravenberch', 'DM', 86], [10, 'Alexis Mac Allister', 'DM', 87],
        [8, 'Dominik Szoboszlai', 'RW', 85], [7, 'Florian Wirtz', 'AM', 90], [18, 'Cody Gakpo', 'LW', 85],
        [9, 'Alexander Isak', 'ST', 89],
      ],
      bench: [
        [25, 'Giorgi Mamardashvili', 'GK', 82], [30, 'Jeremie Frimpong', 'RB', 82], [15, 'Giovanni Leoni', 'CB', 78], [3, 'Wataru Endo', 'DM', 78],
        [14, 'Federico Chiesa', 'RW', 80], [29, 'Bradley Barcola', 'LW', 85], [22, 'Hugo Ekitike', 'ST', 84], [5, 'Jérémy Jacquet', 'CB', 76],
      ],
    },
    {
      id: 'ARS', name: 'Arsenal', short: 'ARS', city: 'Londra', league: 'Premier League', stadium: 'Emirates Stadium',
      formation: '4-3-3', mentality: 0.65,
      kits: {
        home: { pattern: 'plain', c1: '#EF0107', c2: '#EF0107', shorts: '#FFFFFF', socks: '#FFFFFF', num: '#FFFFFF' },
        away: { pattern: 'plain', c1: '#F7E7A0', c2: '#F7E7A0', shorts: '#2B2B2B', socks: '#F7E7A0', num: '#2B2B2B' },
        gk:   { pattern: 'plain', c1: '#FFD500', c2: '#FFD500', shorts: '#FFD500', socks: '#FFD500', num: '#000000' },
      },
      xi: [
        [1, 'David Raya', 'GK', 88],
        [12, 'Jurriën Timber', 'RB', 85], [2, 'William Saliba', 'CB', 89], [6, 'Gabriel Magalhães', 'CB', 88], [33, 'Riccardo Calafiori', 'LB', 83],
        [8, 'Martin Ødegaard', 'CM', 87], [36, 'Martín Zubimendi', 'DM', 86], [41, 'Declan Rice', 'CM', 89],
        [7, 'Bukayo Saka', 'RW', 90], [14, 'Viktor Gyökeres', 'ST', 87], [10, 'Eberechi Eze', 'LW', 85],
      ],
      bench: [
        [13, 'Kepa Arrizabalaga', 'GK', 80], [4, 'Ben White', 'RB', 82], [5, 'Piero Hincapié', 'CB', 82], [15, 'Ezri Konsa', 'CB', 81],
        [39, 'Bruno Guimarães', 'CM', 85], [23, 'Mikel Merino', 'CM', 82], [29, 'Kai Havertz', 'ST', 82], [20, 'Noni Madueke', 'RW', 82],
      ],
    },
    {
      id: 'BAY', name: 'Bayern München', short: 'BAY', city: 'Münih', league: 'Bundesliga', stadium: 'Allianz Arena',
      formation: '4-2-3-1', mentality: 0.7,
      kits: {
        home: { pattern: 'plain', c1: '#DC052D', c2: '#DC052D', shorts: '#DC052D', socks: '#DC052D', num: '#FFFFFF' },
        away: { pattern: 'plain', c1: '#F1F1F1', c2: '#F1F1F1', shorts: '#F1F1F1', socks: '#F1F1F1', num: '#DC052D' },
        gk:   { pattern: 'plain', c1: '#3A3A3A', c2: '#3A3A3A', shorts: '#3A3A3A', socks: '#3A3A3A', num: '#FFFFFF' },
      },
      xi: [
        [1, 'Manuel Neuer', 'GK', 85],
        [27, 'Konrad Laimer', 'RB', 80], [2, 'Dayot Upamecano', 'CB', 85], [4, 'Jonathan Tah', 'CB', 85], [19, 'Alphonso Davies', 'LB', 83],
        [6, 'Joshua Kimmich', 'DM', 87], [45, 'Aleksandar Pavlović', 'DM', 83],
        [17, 'Michael Olise', 'RW', 89], [10, 'Jamal Musiala', 'AM', 90], [14, 'Luis Díaz', 'LW', 86],
        [9, 'Harry Kane', 'ST', 91],
      ],
      bench: [
        [40, 'Jonas Urbig', 'GK', 78], [3, 'Kim Min-jae', 'CB', 83], [44, 'Josip Stanišić', 'RB', 81], [23, 'Sacha Boey', 'RB', 79],
        [20, 'Tom Bischof', 'CM', 78], [8, 'Ismael Saibari', 'AM', 80], [7, 'Serge Gnabry', 'RW', 81], [42, 'Lennart Karl', 'AM', 78],
      ],
    },
    {
      id: 'PSG', name: 'Paris Saint-Germain', short: 'PSG', city: 'Paris', league: 'Ligue 1', stadium: 'Parc des Princes',
      formation: '4-3-3', mentality: 0.7,
      kits: {
        home: { pattern: 'sash', c1: '#0B2A5B', c2: '#E30613', shorts: '#0B2A5B', socks: '#0B2A5B', num: '#FFFFFF' },
        away: { pattern: 'plain', c1: '#F5F5F5', c2: '#F5F5F5', shorts: '#F5F5F5', socks: '#F5F5F5', num: '#0B2A5B' },
        gk:   { pattern: 'plain', c1: '#111111', c2: '#111111', shorts: '#111111', socks: '#111111', num: '#FF3C8E' },
      },
      xi: [
        [39, 'Matvey Safonov', 'GK', 81],
        [2, 'Achraf Hakimi', 'RB', 90], [5, 'Marquinhos', 'CB', 87], [51, 'Willian Pacho', 'CB', 85], [25, 'Nuno Mendes', 'LB', 88],
        [87, 'João Neves', 'CM', 88], [17, 'Vitinha', 'DM', 91], [8, 'Fabián Ruiz', 'CM', 86],
        [14, 'Désiré Doué', 'RW', 89], [10, 'Ousmane Dembélé', 'ST', 91], [7, 'Khvicha Kvaratskhelia', 'LW', 89],
      ],
      bench: [
        [30, 'Lucas Chevalier', 'GK', 85], [6, 'Illia Zabarnyi', 'CB', 83], [21, 'Lucas Hernández', 'LB', 80], [33, 'Warren Zaïre-Emery', 'CM', 83],
        [24, 'Senny Mayulu', 'AM', 78], [11, 'Maghnes Akliouche', 'RW', 83], [19, 'Ferran Torres', 'ST', 82], [29, 'Mika Godts', 'LW', 76],
      ],
    },
    {
      id: 'INT', name: 'Inter', short: 'INT', city: 'Milano', league: 'Serie A', stadium: 'San Siro',
      formation: '3-5-2', mentality: 0.55,
      kits: {
        home: { pattern: 'stripes', c1: '#010E80', c2: '#000000', shorts: '#000000', socks: '#000000', num: '#FFFFFF' },
        away: { pattern: 'plain', c1: '#FFFFFF', c2: '#FFFFFF', shorts: '#FFFFFF', socks: '#FFFFFF', num: '#010E80' },
        gk:   { pattern: 'plain', c1: '#9BE15D', c2: '#9BE15D', shorts: '#9BE15D', socks: '#9BE15D', num: '#000000' },
      },
      xi: [
        [1, 'Josep Martínez', 'GK', 82],
        [25, 'Manuel Akanji', 'CB', 85], [6, 'John Stones', 'CB', 82], [95, 'Alessandro Bastoni', 'CB', 88],
        [99, 'Djed Spence', 'RWB', 79], [23, 'Nicolò Barella', 'CM', 88], [20, 'Hakan Çalhanoğlu', 'DM', 87], [8, 'Petar Sučić', 'CM', 81], [32, 'Federico Dimarco', 'LWB', 86],
        [10, 'Lautaro Martínez', 'ST', 89], [9, 'Marcus Thuram', 'ST', 87],
      ],
      bench: [
        [49, 'Ivan Provedel', 'GK', 78], [28, 'Benjamin Pavard', 'CB', 82], [31, 'Yann Bisseck', 'CB', 81], [30, 'Carlos Augusto', 'LWB', 81],
        [7, 'Piotr Zieliński', 'CM', 80], [21, 'Curtis Jones', 'CM', 79], [14, 'Ange-Yoan Bonny', 'ST', 78], [94, 'Pio Esposito', 'ST', 79],
      ],
    },
  ];

  FS.getTeam = (id) => FS.TEAMS.find((t) => t.id === id);
})(typeof window !== 'undefined' ? window : globalThis);
