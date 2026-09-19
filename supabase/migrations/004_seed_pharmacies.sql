-- ============================================================
-- 004_seed_pharmacies.sql
-- Real partner medical laboratories — one per major Tunisian governorate
-- ============================================================

INSERT INTO partner_pharmacies (name, region, address, phone, is_active) VALUES
  ('Laboratoire d''Analyses Médicales Farah Messai Mahjoub', 'Tunis',    'Centre Médical Hannibal, Cité des Pins, 1er étage, Les Berges du Lac 2, 1053 Tunis', '+216 71 267 322', TRUE),
  ('Laboratoire Riba Mahmoud',                               'Sousse',   'Immeuble Gloulou, 1er étage, Rue 22 Janvier 1952, Sousse 4000',                      '+216 73 227 878', TRUE),
  ('Laboratoire d''Analyses Médicales Kamel Zribi',          'Sfax',     'Route de Tunis Km 3, Complexe Dar Ettabib, 1er étage, Sfax 3000',                    '+216 70 030 519', TRUE),
  ('Laboratoire d''Analyses Médicales Fehmi Ben Moussa',     'Kairouan', 'Avenue Abi Zamâa El Balaoui, Galerie Errabi, 3100 Kairouan',                         '+216 77 227 292', TRUE),
  ('Laboratoire d''Analyses Médicales Mohamed Becha',        'Gabès',    '154 Boulevard Mohamed Ali, 6000 Gabès',                                              '+216 75 265 814', TRUE),
  ('Laboratoire Abir Belkhechine',                           'Ariana',   'Centre Médical Kamoun, Avenue de l''Ère Nouvelle, Ennasr 2, 2036 Ariana',            '+216 70 039 439', TRUE),
  ('Laboratoire Dr Mohamed Sellem',                          'Nabeul',   'Immeuble Gannar, 3ème étage, 13 Avenue Habib Thameur, 8000 Nabeul',                  '+216 72 270 777', TRUE),
  ('Centre d''Analyses Médicales Bio Dhaouadi',              'Bizerte',  '21 Avenue d''Algérie, 7000 Bizerte',                                                  '+216 72 430 648', TRUE),
  ('Laboratoire d''Analyses Médicales Bechir Hmissi',        'Béja',     '56 Rue de la République, Immeuble Kandil, Béja Nord, 9000 Béja',                     '+216 78 440 900', TRUE),
  ('Laboratoire BIO 24 Alliance',                            'Monastir', 'Centre Médical Ruspina, 1er étage, Avenue Combattant Suprême, 5000 Monastir',        '+216 73 462 717', TRUE);
