-- ============================================================
--  POS Perfumería + Facturación Electrónica DIAN (Colombia)
--  Esquema MySQL 5.7+ / MariaDB 10.3+
-- ============================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------- Usuarios ----------
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','cajero') NOT NULL DEFAULT 'cajero',
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Configuración (clave/valor) ----------
CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(80) PRIMARY KEY,
  `value` TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Resoluciones / rangos de numeración DIAN ----------
CREATE TABLE IF NOT EXISTS numbering_ranges (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doc_type ENUM('FEV','POS','NC') NOT NULL COMMENT 'FEV=Factura electrónica, POS=Doc. equivalente POS electrónico, NC=Nota crédito',
  prefix VARCHAR(10) NOT NULL DEFAULT '',
  from_number INT UNSIGNED NOT NULL,
  to_number INT UNSIGNED NOT NULL,
  current_number INT UNSIGNED NOT NULL COMMENT 'Último número usado',
  resolution_number VARCHAR(40) NULL,
  resolution_date DATE NULL,
  valid_from DATE NULL,
  valid_to DATE NULL,
  technical_key VARCHAR(120) NULL COMMENT 'Clave técnica de la resolución (FEV)',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Catálogo ----------
CREATE TABLE IF NOT EXISTS brands (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE COMMENT 'Código de barras / SKU',
  name VARCHAR(200) NOT NULL,
  brand_id INT UNSIGNED NULL,
  category_id INT UNSIGNED NULL,
  gender ENUM('Femenino','Masculino','Unisex') NOT NULL DEFAULT 'Unisex',
  concentration VARCHAR(30) NULL COMMENT 'Parfum, EDP, EDT, EDC, Body Mist...',
  size_ml INT UNSIGNED NULL,
  olfactive_family VARCHAR(60) NULL,
  cost DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Costo unitario (promedio ponderado)',
  price DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Precio de venta IVA incluido',
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 19.00,
  stock INT NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 0,
  image VARCHAR(255) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_products_name (name),
  CONSTRAINT fk_products_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Terceros ----------
CREATE TABLE IF NOT EXISTS customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doc_type VARCHAR(2) NOT NULL DEFAULT '13' COMMENT 'Tabla DIAN: 13 CC, 31 NIT, 22 CE, 41 Pasaporte, 12 TI, 42 Doc. extranjero',
  doc_number VARCHAR(30) NOT NULL,
  dv CHAR(1) NULL,
  name VARCHAR(200) NOT NULL,
  person_type TINYINT NOT NULL DEFAULT 2 COMMENT '1 Jurídica, 2 Natural',
  tax_regime VARCHAR(2) NOT NULL DEFAULT '49' COMMENT '48 Responsable IVA, 49 No responsable',
  tax_responsibilities VARCHAR(60) NOT NULL DEFAULT 'R-99-PN',
  email VARCHAR(160) NULL,
  phone VARCHAR(40) NULL,
  address VARCHAR(200) NULL,
  city_code VARCHAR(5) NULL COMMENT 'Código DANE municipio',
  city_name VARCHAR(80) NULL,
  department VARCHAR(80) NULL,
  birthday DATE NULL,
  notes VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_customer_doc (doc_type, doc_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS suppliers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nit VARCHAR(30) NOT NULL,
  name VARCHAR(200) NOT NULL,
  contact VARCHAR(120) NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(160) NULL,
  address VARCHAR(200) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Compras ----------
CREATE TABLE IF NOT EXISTS purchases (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT UNSIGNED NULL,
  user_id INT UNSIGNED NOT NULL,
  invoice_number VARCHAR(60) NULL,
  purchase_date DATE NOT NULL,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_purchases_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  CONSTRAINT fk_purchases_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  qty INT NOT NULL,
  unit_cost DECIMAL(14,2) NOT NULL COMMENT 'Costo unitario sin IVA',
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(14,2) NOT NULL,
  tax DECIMAL(14,2) NOT NULL,
  total DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_pi_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  CONSTRAINT fk_pi_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Inventario (kárdex) ----------
CREATE TABLE IF NOT EXISTS inventory_movements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  type ENUM('compra','venta','devolucion','ajuste_entrada','ajuste_salida','inicial') NOT NULL,
  qty INT NOT NULL COMMENT 'Positivo entra, negativo sale',
  stock_after INT NOT NULL,
  unit_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  reference VARCHAR(60) NULL,
  note VARCHAR(255) NULL,
  user_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_im_product (product_id, created_at),
  CONSTRAINT fk_im_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Caja ----------
CREATE TABLE IF NOT EXISTS cash_sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  opened_at DATETIME NOT NULL,
  opening_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  closed_at DATETIME NULL,
  expected_cash DECIMAL(14,2) NULL,
  counted_cash DECIMAL(14,2) NULL,
  difference DECIMAL(14,2) NULL,
  notes VARCHAR(255) NULL,
  status ENUM('abierta','cerrada') NOT NULL DEFAULT 'abierta',
  KEY idx_cs_user_status (user_id, status),
  CONSTRAINT fk_cs_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cash_movements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cash_session_id INT UNSIGNED NOT NULL,
  type ENUM('ingreso','egreso') NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  concept VARCHAR(200) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cm_session FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Ventas ----------
CREATE TABLE IF NOT EXISTS sales (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cash_session_id INT UNSIGNED NULL,
  user_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  doc_type ENUM('POS','FEV') NOT NULL DEFAULT 'POS',
  numbering_range_id INT UNSIGNED NULL,
  prefix VARCHAR(10) NOT NULL DEFAULT '',
  number INT UNSIGNED NOT NULL,
  full_number VARCHAR(30) NOT NULL,
  issued_at DATETIME NOT NULL,
  subtotal DECIMAL(14,2) NOT NULL COMMENT 'Base gravable (sin IVA)',
  discount_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_total DECIMAL(14,2) NOT NULL,
  total DECIMAL(14,2) NOT NULL,
  paid DECIMAL(14,2) NOT NULL,
  change_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  status ENUM('completada','devolucion_parcial','anulada') NOT NULL DEFAULT 'completada',
  notes VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sales_number (doc_type, prefix, number),
  KEY idx_sales_issued (issued_at),
  CONSTRAINT fk_sales_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_sales_session FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sale_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  code VARCHAR(60) NOT NULL,
  description VARCHAR(250) NOT NULL,
  qty INT NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL COMMENT 'IVA incluido',
  unit_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_pct DECIMAL(6,3) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(5,2) NOT NULL,
  base DECIMAL(14,2) NOT NULL,
  tax DECIMAL(14,2) NOT NULL,
  total DECIMAL(14,2) NOT NULL,
  returned_qty INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_si_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_si_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sale_payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_id INT UNSIGNED NOT NULL,
  method VARCHAR(30) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  reference VARCHAR(80) NULL,
  CONSTRAINT fk_sp_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Notas crédito (devoluciones / anulaciones) ----------
CREATE TABLE IF NOT EXISTS credit_notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  numbering_range_id INT UNSIGNED NULL,
  prefix VARCHAR(10) NOT NULL DEFAULT '',
  number INT UNSIGNED NOT NULL,
  full_number VARCHAR(30) NOT NULL,
  reason_code VARCHAR(2) NOT NULL COMMENT '1 Devolución parcial, 2 Anulación, 3 Rebaja, 4 Ajuste precio, 5 Otros',
  reason_text VARCHAR(255) NOT NULL,
  refund_method VARCHAR(30) NOT NULL DEFAULT 'efectivo',
  subtotal DECIMAL(14,2) NOT NULL,
  tax_total DECIMAL(14,2) NOT NULL,
  total DECIMAL(14,2) NOT NULL,
  issued_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cn_number (prefix, number),
  CONSTRAINT fk_cn_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT fk_cn_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS credit_note_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  credit_note_id INT UNSIGNED NOT NULL,
  sale_item_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  code VARCHAR(60) NOT NULL,
  description VARCHAR(250) NOT NULL,
  qty INT NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  tax_rate DECIMAL(5,2) NOT NULL,
  base DECIMAL(14,2) NOT NULL,
  tax DECIMAL(14,2) NOT NULL,
  total DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_cni_cn FOREIGN KEY (credit_note_id) REFERENCES credit_notes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Documentos electrónicos ----------
CREATE TABLE IF NOT EXISTS electronic_documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_id INT UNSIGNED NULL,
  credit_note_id INT UNSIGNED NULL,
  doc_kind ENUM('FEV','POS','NC') NOT NULL,
  full_number VARCHAR(30) NOT NULL,
  uuid VARCHAR(96) NOT NULL COMMENT 'CUFE o CUDE (SHA-384)',
  qr_data TEXT NULL,
  xml_path VARCHAR(255) NULL,
  environment CHAR(1) NOT NULL DEFAULT '2' COMMENT '1 Producción, 2 Pruebas',
  driver VARCHAR(30) NOT NULL,
  status ENUM('pendiente','aceptado','rechazado','error') NOT NULL DEFAULT 'pendiente',
  track_id VARCHAR(120) NULL,
  response TEXT NULL,
  attempts INT NOT NULL DEFAULT 0,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ed_status (status),
  CONSTRAINT fk_ed_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_ed_cn FOREIGN KEY (credit_note_id) REFERENCES credit_notes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
