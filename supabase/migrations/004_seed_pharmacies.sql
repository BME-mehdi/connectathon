-- ============================================================
-- 004_seed_pharmacies.sql
-- Demo partner pharmacies — one per major Tunisian governorate
-- ============================================================

INSERT INTO partner_pharmacies (name, region, address, phone, is_active) VALUES
  ('Pharmacie Ben Ali',             'Tunis',    '12 Avenue Habib Bourguiba, Tunis 1000',        '+216 71 000 001', TRUE),
  ('Pharmacie Centrale Sousse',     'Sousse',   '45 Rue de France, Sousse 4000',                '+216 73 000 002', TRUE),
  ('Pharmacie El Amal Sfax',        'Sfax',     '8 Avenue de la République, Sfax 3000',         '+216 74 000 003', TRUE),
  ('Pharmacie Ibn Khaldoun',        'Kairouan', '3 Rue Okba, Kairouan 3100',                    '+216 77 000 004', TRUE),
  ('Pharmacie du Peuple Gabès',     'Gabès',    '21 Avenue Farhat Hached, Gabès 6000',          '+216 75 000 005', TRUE),
  ('Pharmacie Sidi Bou Said',       'Ariana',   '5 Route de la Marsa, Ariana 2080',             '+216 71 000 006', TRUE),
  ('Pharmacie Nabeul Centre',       'Nabeul',   '67 Avenue Habib Thameur, Nabeul 8000',         '+216 72 000 007', TRUE),
  ('Pharmacie de la Santé Bizerte', 'Bizerte',  '14 Rue du 20 Mars, Bizerte 7000',              '+216 72 000 008', TRUE),
  ('Pharmacie Populaire Béja',      'Béja',     '2 Avenue de l''Indépendance, Béja 9000',       '+216 78 000 009', TRUE),
  ('Pharmacie Centrale Monastir',   'Monastir', '33 Avenue de la Corniche, Monastir 5000',      '+216 73 000 010', TRUE);
