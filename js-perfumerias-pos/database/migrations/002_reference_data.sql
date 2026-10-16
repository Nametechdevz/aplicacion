-- =====================================================================
-- Datos de referencia estructurales (no son datos comerciales ficticios):
-- roles, permisos, unidades de medida, conversiones, medios de pago,
-- configuración por defecto y el almacén central.
-- =====================================================================

INSERT INTO roles (code, name, description, is_system) VALUES
('superadmin',   'Superadministrador',        'Control global de la empresa y de todas las sucursales', 1),
('branch_admin', 'Administrador de sucursal', 'Gestiona las sucursales que tiene asignadas', 1),
('cashier',      'Cajero / vendedor',         'Opera la caja y realiza ventas en su sucursal', 1);

INSERT INTO permissions (code, module, name) VALUES
('dashboard.view',        'dashboard',  'Ver panel de indicadores'),
('branches.all',          'branches',   'Acceso a todas las sucursales'),
('branches.manage',       'branches',   'Crear y editar sucursales'),
('users.manage',          'users',      'Gestionar todos los usuarios y roles'),
('users.manage_branch',   'users',      'Gestionar usuarios de sus sucursales'),
('products.view',         'products',   'Ver catálogo de productos'),
('products.manage',       'products',   'Crear y editar productos, categorías y marcas'),
('products.price',        'products',   'Modificar precios base'),
('products.cost_view',    'products',   'Ver costos y márgenes'),
('inventory.view',        'inventory',  'Ver inventario de sus sucursales'),
('inventory.adjust',      'inventory',  'Realizar ajustes y conteos de inventario'),
('inventory.entry',       'inventory',  'Registrar entradas de mercancía al almacén'),
('inventory.distribute',  'inventory',  'Distribuir existencias a sucursales'),
('transfers.request',     'transfers',  'Solicitar transferencias'),
('transfers.approve',     'transfers',  'Aprobar o rechazar transferencias'),
('transfers.dispatch',    'transfers',  'Despachar transferencias'),
('transfers.receive',     'transfers',  'Recibir transferencias'),
('transfers.resolve',     'transfers',  'Resolver diferencias de transferencias'),
('pos.sell',              'pos',        'Vender en el punto de venta'),
('pos.discount',          'pos',        'Aplicar descuentos dentro de su límite'),
('discounts.approve',     'pos',        'Autorizar descuentos superiores al límite'),
('discounts.configure',   'settings',   'Configurar límites de descuento'),
('sales.view_own',        'sales',      'Ver sus propias ventas'),
('sales.view_branch',     'sales',      'Ver ventas de sus sucursales'),
('sales.void',            'sales',      'Anular ventas'),
('sales.reprint',         'sales',      'Reimprimir comprobantes'),
('returns.create',        'returns',    'Registrar devoluciones'),
('returns.approve',       'returns',    'Aprobar devoluciones'),
('cash.operate',          'cash',       'Abrir, operar y cerrar su caja'),
('cash.view_branch',      'cash',       'Ver cierres de caja de sus sucursales'),
('cash.approve',          'cash',       'Aprobar cierres de caja'),
('cash.movements',        'cash',       'Registrar entradas, salidas y gastos de caja'),
('purchases.manage',      'purchases',  'Gestionar órdenes de compra y recepciones'),
('suppliers.manage',      'purchases',  'Gestionar proveedores'),
('customers.view',        'customers',  'Consultar clientes'),
('customers.manage',      'customers',  'Crear y editar clientes'),
('reports.view',          'reports',    'Ver reportes'),
('reports.financial',     'reports',    'Ver costos, márgenes y utilidad'),
('reports.export',        'reports',    'Exportar reportes'),
('audit.view',            'audit',      'Consultar auditoría'),
('settings.manage',       'settings',   'Configuración general de la empresa');

-- Superadministrador: todos los permisos.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'superadmin';

-- Administrador de sucursal.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'dashboard.view','users.manage_branch','products.view','products.cost_view','inventory.view',
  'transfers.request','transfers.receive','pos.sell','pos.discount','discounts.approve',
  'sales.view_own','sales.view_branch','sales.void','sales.reprint','returns.create','returns.approve',
  'cash.operate','cash.view_branch','cash.approve','cash.movements','customers.view','customers.manage',
  'reports.view','reports.financial','reports.export'
) WHERE r.code = 'branch_admin';

-- Cajero.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'products.view','pos.sell','pos.discount','sales.view_own','sales.reprint',
  'cash.operate','customers.view','customers.manage'
) WHERE r.code = 'cashier';

INSERT INTO units_of_measure (code, name, dimension, allows_decimal, max_precision) VALUES
('und', 'Unidad',     'count',  0, 0),
('ml',  'Mililitro',  'volume', 1, 2),
('l',   'Litro',      'volume', 1, 3),
('g',   'Gramo',      'mass',   1, 2),
('kg',  'Kilogramo',  'mass',   1, 3);

INSERT INTO unit_conversions (from_unit_id, to_unit_id, factor)
SELECT f.id, t.id, c.factor FROM (
  SELECT 'l' AS f, 'ml' AS t, 1000.000000 AS factor UNION ALL
  SELECT 'ml', 'l', 0.001000 UNION ALL
  SELECT 'kg', 'g', 1000.000000 UNION ALL
  SELECT 'g', 'kg', 0.001000
) c JOIN units_of_measure f ON f.code = c.f JOIN units_of_measure t ON t.code = c.t;

INSERT INTO payment_methods (code, name, type, requires_reference, is_active, sort_order) VALUES
('cash',     'Efectivo',               'cash',          0, 1, 1),
('transfer', 'Transferencia bancaria', 'bank_transfer', 1, 1, 2),
('nequi',    'Nequi',                  'wallet',        1, 1, 3),
('card',     'Tarjeta',                'card',          0, 1, 4);

INSERT INTO discount_limits (scope, scope_id, max_percent)
SELECT 'role', id, CASE code WHEN 'superadmin' THEN 100 WHEN 'branch_admin' THEN 20 ELSE 5 END FROM roles;

INSERT INTO settings (setting_key, value) VALUES
('company_name',          'JS Perfumerías'),
('company_tax_id',        ''),
('company_address',       ''),
('company_phone',         ''),
('company_email',         ''),
('currency',              'COP'),
('timezone',              'America/Bogota'),
('date_format',           'd/m/Y'),
('allow_negative_stock',  '0'),
('allow_mixed_payments',  '1'),
('min_margin_pct',        '15'),
('cost_policy',           'weighted_average'),
('approval_expiry_min',   '30'),
('cash_close_requires_approval', '1'),
('cash_difference_tolerance', '0'),
('returns_require_approval',  '1'),
('receipt_footer',        'Gracias por su compra.');

INSERT INTO loyalty_programs (name, is_active, amount_per_point, rules)
VALUES ('Programa de fidelización', 0, NULL, NULL);

INSERT INTO branches (code, name, type, city) VALUES ('ALM', 'Almacén central', 'warehouse', NULL);

INSERT INTO document_sequences (seq_key, prefix, next_value) VALUES
('transfer', 'TR-', 1), ('purchase', 'OC-', 1), ('receipt', 'RM-', 1),
('return', 'DV-', 1), ('supplier_return', 'DP-', 1), ('count', 'CF-', 1);
