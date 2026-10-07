-- ============================================================
--  Datos iniciales
--  Usuarios: admin@perfumeria.com / admin123
--            cajero@perfumeria.com / cajero123
--  ¡Cambia estas contraseñas apenas entres al sistema!
-- ============================================================
SET NAMES utf8mb4;

INSERT INTO users (name, email, password_hash, role) VALUES
('Administrador', 'admin@perfumeria.com', '$2y$10$.lPSxB/Vefkwkrn3h6udAOwiTkU8GLJNyitbBLqp.qZcIDYcnYUf.', 'admin'),
('Cajero Principal', 'cajero@perfumeria.com', '$2y$10$ivmPrYAkyeKGsB0ZXlevbOnalTfUkfPEJwOGBhKhTrMzLXMDmCyJ2', 'cajero');

INSERT INTO settings (`key`, `value`) VALUES
('company_name', 'MI PERFUMERIA S.A.S.'),
('company_trade_name', 'Mi Perfumería'),
('company_nit', '900123456'),
('company_dv', '8'),
('company_person_type', '1'),
('company_tax_regime', '48'),
('company_tax_responsibilities', 'O-13'),
('company_address', 'Calle 10 # 20-30 Local 5'),
('company_city_code', '11001'),
('company_city_name', 'Bogotá, D.C.'),
('company_department_code', '11'),
('company_department', 'Bogotá'),
('company_phone', '3001234567'),
('company_email', 'facturacion@miperfumeria.com'),
('ticket_footer', '¡Gracias por su compra! Cambios dentro de los 8 días con factura y empaque original sellado.'),
('allow_negative_stock', '0'),
('cashier_max_discount', '20'),
('dian_environment', '2'),
('dian_driver', 'simulacion'),
('dian_software_id', ''),
('dian_software_pin', ''),
('dian_test_set_id', ''),
('dian_provider_url', ''),
('dian_provider_token', ''),
('pos_box_plate', 'CAJA-01'),
('pos_box_type', 'POS'),
('software_manufacturer', 'Desarrollo propio'),
('software_name', 'POS Perfumería');

-- Rangos de prueba (habilitación DIAN). Cámbialos por los de tu resolución real.
INSERT INTO numbering_ranges (doc_type, prefix, from_number, to_number, current_number, resolution_number, resolution_date, valid_from, valid_to, technical_key) VALUES
('FEV', 'SETP', 990000000, 995000000, 989999999, '18760000001', '2019-01-19', '2019-01-19', '2030-01-19', 'fc8eac422eba16e22ffd8c6f94b3f40a6e38162c'),
('POS', 'POS', 1, 1000000, 0, '18760000002', '2024-01-01', '2024-01-01', '2030-12-31', NULL),
('NC',  'NC',  1, 1000000, 0, NULL, NULL, NULL, NULL, NULL);

-- Consumidor final (obligatorio, id = 1)
INSERT INTO customers (id, doc_type, doc_number, name, person_type, tax_regime, tax_responsibilities, city_code, city_name, department) VALUES
(1, '13', '222222222222', 'CONSUMIDOR FINAL', 2, '49', 'R-99-PN', '11001', 'Bogotá, D.C.', 'Bogotá');

INSERT INTO brands (name) VALUES
('Carolina Herrera'), ('Paco Rabanne'), ('Dior'), ('Chanel'), ('Versace'),
('Jean Paul Gaultier'), ('Lancôme'), ('Calvin Klein'), ('Hugo Boss'), ('Yves Saint Laurent');

INSERT INTO categories (name) VALUES
('Perfumes'), ('Estuches / Sets'), ('Body Mist'), ('Cremas y lociones'), ('Desodorantes'), ('Decants / Miniaturas');

INSERT INTO products (code, name, brand_id, category_id, gender, concentration, size_ml, olfactive_family, cost, price, tax_rate, stock, min_stock) VALUES
('3614229823837', 'Good Girl', 1, 1, 'Femenino', 'EDP', 80, 'Oriental floral', 310000, 559900, 19, 8, 2),
('8411061784249', '212 VIP Men', 1, 1, 'Masculino', 'EDT', 100, 'Oriental especiado', 240000, 429900, 19, 6, 2),
('3349668566372', '1 Million', 2, 1, 'Masculino', 'EDT', 100, 'Amaderado especiado', 255000, 469900, 19, 10, 3),
('3349668573721', 'Lady Million', 2, 1, 'Femenino', 'EDP', 80, 'Floral afrutado', 245000, 449900, 19, 5, 2),
('3348901250146', 'Sauvage', 3, 1, 'Masculino', 'EDT', 100, 'Aromático fougère', 330000, 599900, 19, 7, 2),
('3348901419093', 'J''adore', 3, 1, 'Femenino', 'EDP', 100, 'Floral', 360000, 649900, 19, 4, 2),
('3145891265200', 'Coco Mademoiselle', 4, 1, 'Femenino', 'EDP', 100, 'Chipre floral', 420000, 759900, 19, 3, 1),
('8011003845118', 'Eros', 5, 1, 'Masculino', 'EDT', 100, 'Aromático fougère', 210000, 389900, 19, 9, 3),
('8433325007070', 'Le Male', 6, 1, 'Masculino', 'EDT', 125, 'Oriental fougère', 250000, 459900, 19, 6, 2),
('3605532612768', 'La Vie Est Belle', 7, 1, 'Femenino', 'EDP', 100, 'Floral frutal gourmand', 320000, 579900, 19, 5, 2),
('088300107407', 'CK One', 8, 1, 'Unisex', 'EDT', 200, 'Cítrico aromático', 120000, 219900, 19, 12, 4),
('737052347882', 'Boss Bottled', 9, 1, 'Masculino', 'EDT', 100, 'Amaderado especiado', 200000, 369900, 19, 8, 2),
('3614273069540', 'Black Opium', 10, 1, 'Femenino', 'EDP', 90, 'Oriental vainilla', 340000, 619900, 19, 4, 2),
('3614229823838', 'Set Good Girl (EDP 80ml + Loción)', 1, 2, 'Femenino', 'EDP', 80, 'Oriental floral', 360000, 649900, 19, 2, 1),
('7700000000011', 'Decant Sauvage 10ml', 3, 6, 'Masculino', 'EDT', 10, 'Aromático fougère', 25000, 59900, 19, 20, 5);

INSERT INTO inventory_movements (product_id, type, qty, stock_after, unit_cost, note, user_id)
SELECT id, 'inicial', stock, stock, cost, 'Inventario inicial', 1 FROM products;
