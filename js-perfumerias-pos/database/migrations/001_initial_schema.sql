-- =====================================================================
-- JS Perfumerías POS — Esquema inicial
-- Compatible con MySQL 8.0+ (y MariaDB 10.6+ para desarrollo).
-- Política horaria: todas las columnas DATETIME se almacenan en UTC.
-- La aplicación convierte a America/Bogota (UTC-5) al mostrar.
-- Dinero: DECIMAL(14,2). Costos unitarios: DECIMAL(14,4).
-- Cantidades (unidad base de inventario): DECIMAL(16,3).
-- Nunca se usa FLOAT/DOUBLE para importes ni cantidades.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- Seguridad: usuarios, roles, permisos
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name                VARCHAR(120) NOT NULL,
    username            VARCHAR(60)  NOT NULL,
    email               VARCHAR(160) NULL,
    phone               VARCHAR(40)  NULL,
    password_hash       VARCHAR(255) NOT NULL,
    is_active           TINYINT(1)   NOT NULL DEFAULT 1,
    last_login_at       DATETIME     NULL,
    password_changed_at DATETIME     NULL,
    created_by          INT UNSIGNED NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE roles (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    code        VARCHAR(40)  NOT NULL,
    name        VARCHAR(80)  NOT NULL,
    description VARCHAR(255) NULL,
    is_system   TINYINT(1)   NOT NULL DEFAULT 0,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE permissions (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    code        VARCHAR(60)  NOT NULL,
    module      VARCHAR(40)  NOT NULL,
    name        VARCHAR(120) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE role_permissions (
    role_id       INT UNSIGNED NOT NULL,
    permission_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
    CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_roles (
    user_id INT UNSIGNED NOT NULL,
    role_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Permisos individuales que conceden o niegan sobre el rol (p. ej. ajustes de inventario).
CREATE TABLE user_permissions (
    user_id       INT UNSIGNED NOT NULL,
    permission_id INT UNSIGNED NOT NULL,
    effect        ENUM('grant','deny') NOT NULL DEFAULT 'grant',
    PRIMARY KEY (user_id, permission_id),
    CONSTRAINT fk_up_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_up_perm FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE login_attempts (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    username     VARCHAR(60)  NOT NULL,
    ip_address   VARCHAR(45)  NOT NULL,
    success      TINYINT(1)   NOT NULL DEFAULT 0,
    attempted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_la_user_time (username, attempted_at),
    KEY idx_la_ip_time (ip_address, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Sucursales
-- ---------------------------------------------------------------------
CREATE TABLE branches (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    code           VARCHAR(10)  NOT NULL,
    name           VARCHAR(120) NOT NULL,
    type           ENUM('warehouse','store') NOT NULL DEFAULT 'store',
    address        VARCHAR(255) NULL,
    city           VARCHAR(80)  NULL,
    phone          VARCHAR(40)  NULL,
    email          VARCHAR(160) NULL,
    receipt_footer VARCHAR(255) NULL,
    is_active      TINYINT(1)   NOT NULL DEFAULT 1,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_branches_code (code),
    KEY idx_branches_type (type, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE branch_user_assignments (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    branch_id  INT UNSIGNED NOT NULL,
    user_id    INT UNSIGNED NOT NULL,
    is_default TINYINT(1)   NOT NULL DEFAULT 0,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bua (branch_id, user_id),
    KEY idx_bua_user (user_id),
    CONSTRAINT fk_bua_branch FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE,
    CONSTRAINT fk_bua_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Numeración de documentos (ventas por sucursal, transferencias, compras...)
CREATE TABLE document_sequences (
    seq_key    VARCHAR(40)  NOT NULL,
    prefix     VARCHAR(20)  NOT NULL,
    next_value INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (seq_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
CREATE TABLE categories (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    parent_id  INT UNSIGNED NULL,
    name       VARCHAR(80)  NOT NULL,
    is_active  TINYINT(1)   NOT NULL DEFAULT 1,
    sort_order INT          NOT NULL DEFAULT 0,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_categories_name (parent_id, name),
    CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE brands (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name       VARCHAR(80)  NOT NULL,
    is_active  TINYINT(1)   NOT NULL DEFAULT 1,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_brands_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE units_of_measure (
    id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    code              VARCHAR(10)  NOT NULL,
    name              VARCHAR(40)  NOT NULL,
    dimension         ENUM('count','volume','mass') NOT NULL,
    allows_decimal    TINYINT(1)   NOT NULL DEFAULT 0,
    max_precision     TINYINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_units_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Conversiones explícitas. Solo se permiten las registradas aquí.
CREATE TABLE unit_conversions (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    from_unit_id INT UNSIGNED NOT NULL,
    to_unit_id   INT UNSIGNED NOT NULL,
    factor       DECIMAL(18,6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_unit_conv (from_unit_id, to_unit_id),
    CONSTRAINT fk_uc_from FOREIGN KEY (from_unit_id) REFERENCES units_of_measure (id),
    CONSTRAINT fk_uc_to FOREIGN KEY (to_unit_id) REFERENCES units_of_measure (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
    id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
    code                 VARCHAR(40)  NOT NULL,
    sku                  VARCHAR(60)  NULL,
    barcode              VARCHAR(60)  NULL,
    name                 VARCHAR(160) NOT NULL,
    description          TEXT         NULL,
    brand_id             INT UNSIGNED NULL,
    category_id          INT UNSIGNED NULL,
    subcategory_id       INT UNSIGNED NULL,
    base_unit_id         INT UNSIGNED NOT NULL,
    sale_mode            ENUM('unit','fractional') NOT NULL DEFAULT 'unit',
    qty_precision        TINYINT UNSIGNED NOT NULL DEFAULT 0,
    container_content    DECIMAL(16,3) NULL COMMENT 'Contenido neto por envase en unidad base',
    container_label      VARCHAR(60)  NULL,
    price                DECIMAL(14,2) NOT NULL COMMENT 'Precio de venta por unidad base',
    cost                 DECIMAL(14,4) NOT NULL DEFAULT 0 COMMENT 'Costo vigente por unidad base',
    min_price            DECIMAL(14,2) NULL COMMENT 'Precio mínimo autorizado por unidad base',
    max_discount_pct     DECIMAL(5,2)  NULL,
    min_margin_pct       DECIMAL(5,2)  NULL,
    allow_negative_stock TINYINT(1)   NOT NULL DEFAULT 0,
    is_active            TINYINT(1)   NOT NULL DEFAULT 1,
    created_by           INT UNSIGNED NULL,
    updated_by           INT UNSIGNED NULL,
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_products_code (code),
    UNIQUE KEY uq_products_sku (sku),
    UNIQUE KEY uq_products_barcode (barcode),
    KEY idx_products_name (name),
    KEY idx_products_cat (category_id, is_active),
    KEY idx_products_brand (brand_id, is_active),
    CONSTRAINT fk_products_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE SET NULL,
    CONSTRAINT fk_products_cat FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
    CONSTRAINT fk_products_subcat FOREIGN KEY (subcategory_id) REFERENCES categories (id) ON DELETE SET NULL,
    CONSTRAINT fk_products_unit FOREIGN KEY (base_unit_id) REFERENCES units_of_measure (id),
    CONSTRAINT chk_products_price CHECK (price >= 0),
    CONSTRAINT chk_products_cost CHECK (cost >= 0),
    CONSTRAINT chk_products_precision CHECK (qty_precision <= 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_images (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id INT UNSIGNED NOT NULL,
    file_name  VARCHAR(80)  NOT NULL,
    thumb_name VARCHAR(80)  NOT NULL,
    width      SMALLINT UNSIGNED NULL,
    height     SMALLINT UNSIGNED NULL,
    is_primary TINYINT(1)   NOT NULL DEFAULT 0,
    sort_order INT          NOT NULL DEFAULT 0,
    created_by INT UNSIGNED NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_pi_product (product_id, is_primary),
    CONSTRAINT fk_pi_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Presentaciones de venta: cada una consume una cantidad fija de la unidad base.
-- Ej.: "Decant 10 ml" consume 10 ml del inventario del producto a granel.
CREATE TABLE product_variants (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id INT UNSIGNED NOT NULL,
    name       VARCHAR(80)  NOT NULL,
    sku        VARCHAR(60)  NULL,
    barcode    VARCHAR(60)  NULL,
    base_qty   DECIMAL(16,3) NOT NULL,
    price      DECIMAL(14,2) NOT NULL,
    is_active  TINYINT(1)   NOT NULL DEFAULT 1,
    sort_order INT          NOT NULL DEFAULT 0,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pv_sku (sku),
    UNIQUE KEY uq_pv_barcode (barcode),
    KEY idx_pv_product (product_id, is_active),
    CONSTRAINT fk_pv_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT chk_pv_qty CHECK (base_qty > 0),
    CONSTRAINT chk_pv_price CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_price_history (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id INT UNSIGNED NOT NULL,
    variant_id INT UNSIGNED NULL,
    field      VARCHAR(20)  NOT NULL,
    old_value  DECIMAL(14,4) NULL,
    new_value  DECIMAL(14,4) NULL,
    source     VARCHAR(30)  NOT NULL DEFAULT 'manual',
    user_id    INT UNSIGNED NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_pph_product (product_id, created_at),
    CONSTRAINT fk_pph_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Inventario
-- ---------------------------------------------------------------------
CREATE TABLE inventory (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    branch_id  INT UNSIGNED NOT NULL,
    product_id INT UNSIGNED NOT NULL,
    quantity   DECIMAL(16,3) NOT NULL DEFAULT 0 COMMENT 'Existencia física en unidad base',
    reserved   DECIMAL(16,3) NOT NULL DEFAULT 0 COMMENT 'Comprometida (p. ej. transferencias aprobadas)',
    in_transit DECIMAL(16,3) NOT NULL DEFAULT 0 COMMENT 'Entrante, despachada y aún no recibida',
    min_stock  DECIMAL(16,3) NOT NULL DEFAULT 0,
    location   VARCHAR(60)  NULL,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_inventory (branch_id, product_id),
    KEY idx_inventory_product (product_id),
    CONSTRAINT fk_inv_branch FOREIGN KEY (branch_id) REFERENCES branches (id),
    CONSTRAINT fk_inv_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT chk_inv_reserved CHECK (reserved >= 0),
    CONSTRAINT chk_inv_transit CHECK (in_transit >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inventory_movements (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    branch_id      INT UNSIGNED NOT NULL,
    product_id     INT UNSIGNED NOT NULL,
    type           ENUM('initial','entry','purchase_receipt','supplier_return','sale','sale_void','customer_return',
                        'transfer_out','transfer_in','transfer_return','adjustment','count','waste') NOT NULL,
    quantity       DECIMAL(16,3) NOT NULL COMMENT 'Con signo, en unidad base',
    balance_before DECIMAL(16,3) NOT NULL,
    balance_after  DECIMAL(16,3) NOT NULL,
    unit_cost      DECIMAL(14,4) NULL,
    reference_type VARCHAR(30)  NULL,
    reference_id   INT UNSIGNED NULL,
    notes          VARCHAR(255) NULL,
    user_id        INT UNSIGNED NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_im_branch_product (branch_id, product_id, created_at),
    KEY idx_im_created (created_at),
    KEY idx_im_reference (reference_type, reference_id),
    KEY idx_im_type (type, created_at),
    CONSTRAINT fk_im_branch FOREIGN KEY (branch_id) REFERENCES branches (id),
    CONSTRAINT fk_im_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT fk_im_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inventory_counts (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    number     VARCHAR(30)  NOT NULL,
    branch_id  INT UNSIGNED NOT NULL,
    status     ENUM('applied','cancelled') NOT NULL DEFAULT 'applied',
    notes      VARCHAR(255) NULL,
    created_by INT UNSIGNED NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ic_number (number),
    CONSTRAINT fk_ic_branch FOREIGN KEY (branch_id) REFERENCES branches (id),
    CONSTRAINT fk_ic_user FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inventory_count_items (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    count_id     INT UNSIGNED NOT NULL,
    product_id   INT UNSIGNED NOT NULL,
    system_qty   DECIMAL(16,3) NOT NULL,
    counted_qty  DECIMAL(16,3) NOT NULL,
    difference   DECIMAL(16,3) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_ici_count FOREIGN KEY (count_id) REFERENCES inventory_counts (id) ON DELETE CASCADE,
    CONSTRAINT fk_ici_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_transfers (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    number           VARCHAR(30)  NOT NULL,
    from_branch_id   INT UNSIGNED NOT NULL,
    to_branch_id     INT UNSIGNED NOT NULL,
    status           ENUM('requested','approved','in_transit','received','received_with_differences','resolved','rejected','cancelled') NOT NULL DEFAULT 'requested',
    notes            VARCHAR(500) NULL,
    requested_by     INT UNSIGNED NOT NULL,
    requested_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_by      INT UNSIGNED NULL,
    approved_at      DATETIME     NULL,
    dispatched_by    INT UNSIGNED NULL,
    dispatched_at    DATETIME     NULL,
    received_by      INT UNSIGNED NULL,
    received_at      DATETIME     NULL,
    resolved_by      INT UNSIGNED NULL,
    resolved_at      DATETIME     NULL,
    resolution_notes VARCHAR(500) NULL,
    rejection_reason VARCHAR(255) NULL,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_st_number (number),
    KEY idx_st_from (from_branch_id, status),
    KEY idx_st_to (to_branch_id, status),
    CONSTRAINT fk_st_from FOREIGN KEY (from_branch_id) REFERENCES branches (id),
    CONSTRAINT fk_st_to FOREIGN KEY (to_branch_id) REFERENCES branches (id),
    CONSTRAINT fk_st_req FOREIGN KEY (requested_by) REFERENCES users (id),
    CONSTRAINT chk_st_branches CHECK (from_branch_id <> to_branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_transfer_items (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    transfer_id   INT UNSIGNED NOT NULL,
    product_id    INT UNSIGNED NOT NULL,
    qty_requested DECIMAL(16,3) NOT NULL,
    qty_approved  DECIMAL(16,3) NULL,
    qty_sent      DECIMAL(16,3) NULL,
    qty_received  DECIMAL(16,3) NULL,
    unit_cost     DECIMAL(14,4) NULL,
    resolution    ENUM('write_off','return_origin') NULL,
    notes         VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sti (transfer_id, product_id),
    CONSTRAINT fk_sti_transfer FOREIGN KEY (transfer_id) REFERENCES stock_transfers (id) ON DELETE CASCADE,
    CONSTRAINT fk_sti_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT chk_sti_qty CHECK (qty_requested > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Proveedores y compras
-- ---------------------------------------------------------------------
CREATE TABLE suppliers (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name         VARCHAR(160) NOT NULL,
    tax_id       VARCHAR(40)  NULL,
    contact_name VARCHAR(120) NULL,
    phone        VARCHAR(40)  NULL,
    email        VARCHAR(160) NULL,
    address      VARCHAR(255) NULL,
    notes        TEXT         NULL,
    is_active    TINYINT(1)   NOT NULL DEFAULT 1,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_suppliers_tax (tax_id),
    KEY idx_suppliers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE purchase_orders (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    number           VARCHAR(30)  NOT NULL,
    supplier_id      INT UNSIGNED NOT NULL,
    branch_id        INT UNSIGNED NOT NULL,
    status           ENUM('draft','ordered','partial','received','cancelled') NOT NULL DEFAULT 'draft',
    order_date       DATE         NOT NULL,
    expected_date    DATE         NULL,
    subtotal         DECIMAL(14,2) NOT NULL DEFAULT 0,
    discount_total   DECIMAL(14,2) NOT NULL DEFAULT 0,
    additional_costs DECIMAL(14,2) NOT NULL DEFAULT 0,
    total            DECIMAL(14,2) NOT NULL DEFAULT 0,
    notes            VARCHAR(500) NULL,
    created_by       INT UNSIGNED NOT NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_po_number (number),
    KEY idx_po_supplier (supplier_id, status),
    KEY idx_po_status (status, order_date),
    CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
    CONSTRAINT fk_po_branch FOREIGN KEY (branch_id) REFERENCES branches (id),
    CONSTRAINT fk_po_user FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE purchase_order_items (
    id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    purchase_order_id INT UNSIGNED NOT NULL,
    product_id        INT UNSIGNED NOT NULL,
    quantity          DECIMAL(16,3) NOT NULL COMMENT 'Unidad base',
    qty_received      DECIMAL(16,3) NOT NULL DEFAULT 0,
    unit_cost         DECIMAL(14,4) NOT NULL,
    discount_amount   DECIMAL(14,2) NOT NULL DEFAULT 0,
    line_total        DECIMAL(14,2) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_poi_po (purchase_order_id),
    CONSTRAINT fk_poi_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id) ON DELETE CASCADE,
    CONSTRAINT fk_poi_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT chk_poi_qty CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE goods_receipts (
    id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    number            VARCHAR(30)  NOT NULL,
    purchase_order_id INT UNSIGNED NOT NULL,
    branch_id         INT UNSIGNED NOT NULL,
    supplier_invoice  VARCHAR(60)  NULL,
    invoice_date      DATE         NULL,
    additional_costs  DECIMAL(14,2) NOT NULL DEFAULT 0,
    total             DECIMAL(14,2) NOT NULL DEFAULT 0,
    notes             VARCHAR(500) NULL,
    received_by       INT UNSIGNED NOT NULL,
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_gr_number (number),
    KEY idx_gr_po (purchase_order_id),
    CONSTRAINT fk_gr_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id),
    CONSTRAINT fk_gr_branch FOREIGN KEY (branch_id) REFERENCES branches (id),
    CONSTRAINT fk_gr_user FOREIGN KEY (received_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE goods_receipt_items (
    id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    goods_receipt_id       INT UNSIGNED NOT NULL,
    purchase_order_item_id INT UNSIGNED NOT NULL,
    product_id             INT UNSIGNED NOT NULL,
    quantity               DECIMAL(16,3) NOT NULL,
    unit_cost              DECIMAL(14,4) NOT NULL COMMENT 'Costo unitario puesto en bodega',
    line_total             DECIMAL(14,2) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_gri_gr FOREIGN KEY (goods_receipt_id) REFERENCES goods_receipts (id) ON DELETE CASCADE,
    CONSTRAINT fk_gri_poi FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items (id),
    CONSTRAINT fk_gri_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT chk_gri_qty CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE supplier_returns (
    id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    number            VARCHAR(30)  NOT NULL,
    supplier_id       INT UNSIGNED NOT NULL,
    purchase_order_id INT UNSIGNED NULL,
    branch_id         INT UNSIGNED NOT NULL,
    reason            VARCHAR(255) NOT NULL,
    total             DECIMAL(14,2) NOT NULL DEFAULT 0,
    created_by        INT UNSIGNED NOT NULL,
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sr_number (number),
    CONSTRAINT fk_sr_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
    CONSTRAINT fk_sr_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id),
    CONSTRAINT fk_sr_branch FOREIGN KEY (branch_id) REFERENCES branches (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE supplier_return_items (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
    supplier_return_id INT UNSIGNED NOT NULL,
    product_id         INT UNSIGNED NOT NULL,
    quantity           DECIMAL(16,3) NOT NULL,
    unit_cost          DECIMAL(14,4) NOT NULL,
    line_total         DECIMAL(14,2) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_sri_sr FOREIGN KEY (supplier_return_id) REFERENCES supplier_returns (id) ON DELETE CASCADE,
    CONSTRAINT fk_sri_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Clientes y fidelización (estructura preparada, inactiva por defecto)
-- ---------------------------------------------------------------------
CREATE TABLE customers (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    full_name       VARCHAR(160) NOT NULL,
    document_type   VARCHAR(10)  NULL,
    document_number VARCHAR(30)  NULL,
    phone           VARCHAR(40)  NULL,
    email           VARCHAR(160) NULL,
    preferences     VARCHAR(500) NULL,
    notes           VARCHAR(500) NULL,
    branch_id       INT UNSIGNED NULL COMMENT 'Sucursal de registro',
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    created_by      INT UNSIGNED NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_customers_doc (document_number),
    KEY idx_customers_name (full_name),
    KEY idx_customers_phone (phone),
    CONSTRAINT fk_customers_branch FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE loyalty_programs (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name             VARCHAR(80)  NOT NULL,
    is_active        TINYINT(1)   NOT NULL DEFAULT 0,
    amount_per_point DECIMAL(14,2) NULL,
    rules            JSON         NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE loyalty_ledger (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    program_id     INT UNSIGNED NOT NULL,
    customer_id    INT UNSIGNED NOT NULL,
    points         DECIMAL(12,2) NOT NULL,
    type           ENUM('earn','redeem','adjust','expire') NOT NULL,
    reference_type VARCHAR(30)  NULL,
    reference_id   INT UNSIGNED NULL,
    user_id        INT UNSIGNED NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_ll_customer (customer_id),
    CONSTRAINT fk_ll_program FOREIGN KEY (program_id) REFERENCES loyalty_programs (id),
    CONSTRAINT fk_ll_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Caja
-- ---------------------------------------------------------------------
CREATE TABLE payment_methods (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
    code               VARCHAR(30)  NOT NULL,
    name               VARCHAR(60)  NOT NULL,
    type               ENUM('cash','bank_transfer','wallet','card','other') NOT NULL,
    requires_reference TINYINT(1)   NOT NULL DEFAULT 0,
    is_active          TINYINT(1)   NOT NULL DEFAULT 1,
    sort_order         INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pm_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cash_registers (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    branch_id  INT UNSIGNED NOT NULL,
    code       VARCHAR(20)  NOT NULL,
    name       VARCHAR(60)  NOT NULL,
    is_active  TINYINT(1)   NOT NULL DEFAULT 1,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cr (branch_id, code),
    CONSTRAINT fk_cr_branch FOREIGN KEY (branch_id) REFERENCES branches (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cash_sessions (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    register_id     INT UNSIGNED NOT NULL,
    branch_id       INT UNSIGNED NOT NULL,
    user_id         INT UNSIGNED NOT NULL,
    status          ENUM('open','closed','approved') NOT NULL DEFAULT 'open',
    opening_amount  DECIMAL(14,2) NOT NULL DEFAULT 0,
    opened_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at       DATETIME     NULL,
    expected_cash   DECIMAL(14,2) NULL,
    counted_cash    DECIMAL(14,2) NULL,
    difference      DECIMAL(14,2) NULL,
    totals_snapshot JSON         NULL,
    count_detail    JSON         NULL,
    closing_notes   VARCHAR(500) NULL,
    approved_by     INT UNSIGNED NULL,
    approved_at     DATETIME     NULL,
    approval_notes  VARCHAR(500) NULL,
    open_marker     TINYINT AS (IF(status = 'open', 1, NULL)) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cs_one_open_per_register (register_id, open_marker),
    KEY idx_cs_user (user_id, status),
    KEY idx_cs_branch (branch_id, opened_at),
    CONSTRAINT fk_cs_register FOREIGN KEY (register_id) REFERENCES cash_registers (id),
    CONSTRAINT fk_cs_branch FOREIGN KEY (branch_id) REFERENCES branches (id),
    CONSTRAINT fk_cs_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cash_movements (
    id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    cash_session_id   INT UNSIGNED NOT NULL,
    type              ENUM('opening','sale','refund','cash_in','cash_out','expense','void') NOT NULL,
    payment_method_id INT UNSIGNED NULL,
    amount            DECIMAL(14,2) NOT NULL COMMENT 'Con signo: entradas positivas, salidas negativas',
    reference_type    VARCHAR(30)  NULL,
    reference_id      INT UNSIGNED NULL,
    reason            VARCHAR(255) NULL,
    user_id           INT UNSIGNED NOT NULL,
    authorized_by     INT UNSIGNED NULL,
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_cm_session (cash_session_id, type),
    UNIQUE KEY uq_cm_reference (cash_session_id, type, reference_type, reference_id, payment_method_id),
    CONSTRAINT fk_cm_session FOREIGN KEY (cash_session_id) REFERENCES cash_sessions (id),
    CONSTRAINT fk_cm_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods (id),
    CONSTRAINT fk_cm_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expenses (
    id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    branch_id         INT UNSIGNED NOT NULL,
    cash_session_id   INT UNSIGNED NULL,
    category          VARCHAR(60)  NOT NULL,
    description       VARCHAR(255) NOT NULL,
    amount            DECIMAL(14,2) NOT NULL,
    payment_method_id INT UNSIGNED NULL,
    user_id           INT UNSIGNED NOT NULL,
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_exp_branch (branch_id, created_at),
    CONSTRAINT fk_exp_branch FOREIGN KEY (branch_id) REFERENCES branches (id),
    CONSTRAINT fk_exp_session FOREIGN KEY (cash_session_id) REFERENCES cash_sessions (id),
    CONSTRAINT chk_exp_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Descuentos y autorizaciones
-- ---------------------------------------------------------------------
CREATE TABLE discount_limits (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    scope          ENUM('role','user','branch','product') NOT NULL,
    scope_id       INT UNSIGNED NOT NULL,
    max_percent    DECIMAL(5,2) NOT NULL,
    updated_by     INT UNSIGNED NULL,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_dl (scope, scope_id),
    CONSTRAINT chk_dl_pct CHECK (max_percent >= 0 AND max_percent <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE discount_approvals (
    id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    branch_id         INT UNSIGNED NOT NULL,
    requested_by      INT UNSIGNED NOT NULL,
    product_id        INT UNSIGNED NULL COMMENT 'NULL = descuento sobre el total',
    variant_id        INT UNSIGNED NULL,
    base_amount       DECIMAL(14,2) NOT NULL COMMENT 'Importe sobre el que se pide el descuento',
    requested_percent DECIMAL(7,4) NOT NULL,
    requested_amount  DECIMAL(14,2) NOT NULL,
    reason            VARCHAR(255) NULL,
    status            ENUM('pending','approved','rejected','used','expired') NOT NULL DEFAULT 'pending',
    decided_by        INT UNSIGNED NULL,
    decided_at        DATETIME     NULL,
    decision_notes    VARCHAR(255) NULL,
    used_sale_id      INT UNSIGNED NULL,
    expires_at        DATETIME     NOT NULL,
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_da_branch_status (branch_id, status),
    KEY idx_da_requester (requested_by, status),
    CONSTRAINT fk_da_branch FOREIGN KEY (branch_id) REFERENCES branches (id),
    CONSTRAINT fk_da_user FOREIGN KEY (requested_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Ventas
-- ---------------------------------------------------------------------
CREATE TABLE sales (
    id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    number            VARCHAR(30)  NOT NULL,
    client_request_id CHAR(36)     NOT NULL COMMENT 'Clave de idempotencia generada por el POS',
    branch_id         INT UNSIGNED NOT NULL,
    register_id       INT UNSIGNED NOT NULL,
    cash_session_id   INT UNSIGNED NOT NULL,
    user_id           INT UNSIGNED NOT NULL,
    customer_id       INT UNSIGNED NULL,
    status            ENUM('completed','voided') NOT NULL DEFAULT 'completed',
    subtotal          DECIMAL(14,2) NOT NULL COMMENT 'Suma a precio de lista',
    discount_total    DECIMAL(14,2) NOT NULL DEFAULT 0,
    total             DECIMAL(14,2) NOT NULL,
    cost_total        DECIMAL(14,2) NOT NULL DEFAULT 0,
    paid_total        DECIMAL(14,2) NOT NULL,
    change_total      DECIMAL(14,2) NOT NULL DEFAULT 0,
    items_count       INT UNSIGNED NOT NULL DEFAULT 0,
    notes             VARCHAR(255) NULL,
    voided_by         INT UNSIGNED NULL,
    voided_at         DATETIME     NULL,
    void_reason       VARCHAR(255) NULL,
    reprint_count     INT UNSIGNED NOT NULL DEFAULT 0,
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sales_number (number),
    UNIQUE KEY uq_sales_request (client_request_id),
    KEY idx_sales_branch_date (branch_id, created_at),
    KEY idx_sales_user_date (user_id, created_at),
    KEY idx_sales_customer (customer_id),
    KEY idx_sales_session (cash_session_id),
    KEY idx_sales_status (status, created_at),
    CONSTRAINT fk_sales_branch FOREIGN KEY (branch_id) REFERENCES branches (id),
    CONSTRAINT fk_sales_register FOREIGN KEY (register_id) REFERENCES cash_registers (id),
    CONSTRAINT fk_sales_session FOREIGN KEY (cash_session_id) REFERENCES cash_sessions (id),
    CONSTRAINT fk_sales_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL,
    CONSTRAINT chk_sales_total CHECK (total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fotografía histórica de cada línea: no depende del catálogo vigente.
CREATE TABLE sale_items (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    sale_id         INT UNSIGNED NOT NULL,
    product_id      INT UNSIGNED NOT NULL,
    variant_id      INT UNSIGNED NULL,
    product_code    VARCHAR(40)  NOT NULL,
    product_sku     VARCHAR(60)  NULL,
    product_name    VARCHAR(160) NOT NULL,
    variant_name    VARCHAR(80)  NULL,
    brand_name      VARCHAR(80)  NULL,
    category_name   VARCHAR(80)  NULL,
    unit_code       VARCHAR(10)  NOT NULL,
    quantity        DECIMAL(16,3) NOT NULL COMMENT 'Cantidad en la unidad de venta',
    qty_base        DECIMAL(16,3) NOT NULL COMMENT 'Cantidad consumida en unidad base',
    stock_before    DECIMAL(16,3) NOT NULL,
    stock_after     DECIMAL(16,3) NOT NULL,
    list_unit_price DECIMAL(14,2) NOT NULL COMMENT 'Precio de lista unitario',
    gross_amount    DECIMAL(14,2) NOT NULL COMMENT 'Importe antes de descuento',
    discount_type   ENUM('percent','amount','final_price') NULL,
    discount_value  DECIMAL(14,4) NULL,
    discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    total           DECIMAL(14,2) NOT NULL COMMENT 'Importe final de la línea',
    unit_cost       DECIMAL(14,4) NOT NULL COMMENT 'Costo por unidad base al momento de la venta',
    cost_total      DECIMAL(14,2) NOT NULL,
    approval_id     INT UNSIGNED NULL,
    returned_qty    DECIMAL(16,3) NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_si_sale (sale_id),
    KEY idx_si_product (product_id),
    CONSTRAINT fk_si_sale FOREIGN KEY (sale_id) REFERENCES sales (id),
    CONSTRAINT fk_si_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT fk_si_approval FOREIGN KEY (approval_id) REFERENCES discount_approvals (id),
    CONSTRAINT chk_si_qty CHECK (quantity > 0),
    CONSTRAINT chk_si_returned CHECK (returned_qty >= 0 AND returned_qty <= quantity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sale_payments (
    id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    sale_id           INT UNSIGNED NOT NULL,
    payment_method_id INT UNSIGNED NOT NULL,
    method_name       VARCHAR(60)  NOT NULL,
    amount            DECIMAL(14,2) NOT NULL COMMENT 'Valor aplicado a la venta',
    received          DECIMAL(14,2) NOT NULL COMMENT 'Valor entregado por el cliente',
    change_given      DECIMAL(14,2) NOT NULL DEFAULT 0,
    reference         VARCHAR(80)  NULL,
    verification      ENUM('not_required','pending_manual','verified') NOT NULL DEFAULT 'not_required',
    PRIMARY KEY (id),
    KEY idx_sp_sale (sale_id),
    KEY idx_sp_method (payment_method_id),
    CONSTRAINT fk_sp_sale FOREIGN KEY (sale_id) REFERENCES sales (id),
    CONSTRAINT fk_sp_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods (id),
    CONSTRAINT chk_sp_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registro inmutable de cada descuento aplicado (línea o total).
CREATE TABLE discounts (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    sale_id       INT UNSIGNED NOT NULL,
    sale_item_id  INT UNSIGNED NULL,
    type          ENUM('percent','amount','final_price') NOT NULL,
    value         DECIMAL(14,4) NOT NULL,
    amount        DECIMAL(14,2) NOT NULL,
    percent       DECIMAL(7,4)  NOT NULL COMMENT 'Porcentaje efectivo sobre el importe bruto',
    reason        VARCHAR(255) NULL,
    applied_by    INT UNSIGNED NOT NULL,
    approval_id   INT UNSIGNED NULL,
    approved_by   INT UNSIGNED NULL,
    below_margin  TINYINT(1)   NOT NULL DEFAULT 0,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_disc_sale (sale_id),
    KEY idx_disc_user (applied_by, created_at),
    CONSTRAINT fk_disc_sale FOREIGN KEY (sale_id) REFERENCES sales (id),
    CONSTRAINT fk_disc_item FOREIGN KEY (sale_item_id) REFERENCES sale_items (id),
    CONSTRAINT fk_disc_approval FOREIGN KEY (approval_id) REFERENCES discount_approvals (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Devoluciones
-- ---------------------------------------------------------------------
CREATE TABLE returns (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    number           VARCHAR(30)  NOT NULL,
    sale_id          INT UNSIGNED NOT NULL,
    branch_id        INT UNSIGNED NOT NULL,
    cash_session_id  INT UNSIGNED NULL,
    user_id          INT UNSIGNED NOT NULL,
    status           ENUM('pending','completed','rejected') NOT NULL DEFAULT 'pending',
    reason           VARCHAR(255) NOT NULL,
    refund_method_id INT UNSIGNED NULL,
    total            DECIMAL(14,2) NOT NULL,
    cost_total       DECIMAL(14,2) NOT NULL DEFAULT 0,
    approved_by      INT UNSIGNED NULL,
    approved_at      DATETIME     NULL,
    rejection_reason VARCHAR(255) NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_returns_number (number),
    KEY idx_returns_sale (sale_id),
    KEY idx_returns_branch (branch_id, created_at),
    CONSTRAINT fk_ret_sale FOREIGN KEY (sale_id) REFERENCES sales (id),
    CONSTRAINT fk_ret_branch FOREIGN KEY (branch_id) REFERENCES branches (id),
    CONSTRAINT fk_ret_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_ret_method FOREIGN KEY (refund_method_id) REFERENCES payment_methods (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE return_items (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    return_id      INT UNSIGNED NOT NULL,
    sale_item_id   INT UNSIGNED NOT NULL,
    product_id     INT UNSIGNED NOT NULL,
    quantity       DECIMAL(16,3) NOT NULL,
    qty_base       DECIMAL(16,3) NOT NULL,
    amount         DECIMAL(14,2) NOT NULL,
    cost_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
    restock        TINYINT(1)   NOT NULL DEFAULT 1,
    item_condition ENUM('resaleable','damaged','defective') NOT NULL DEFAULT 'resaleable',
    PRIMARY KEY (id),
    KEY idx_ri_return (return_id),
    KEY idx_ri_item (sale_item_id),
    CONSTRAINT fk_ri_return FOREIGN KEY (return_id) REFERENCES returns (id) ON DELETE CASCADE,
    CONSTRAINT fk_ri_item FOREIGN KEY (sale_item_id) REFERENCES sale_items (id),
    CONSTRAINT chk_ri_qty CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Auditoría y configuración
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     INT UNSIGNED NULL,
    branch_id   INT UNSIGNED NULL,
    action      VARCHAR(60)  NOT NULL,
    entity_type VARCHAR(40)  NULL,
    entity_id   INT UNSIGNED NULL,
    description VARCHAR(255) NULL,
    old_values  JSON         NULL,
    new_values  JSON         NULL,
    ip_address  VARCHAR(45)  NULL,
    user_agent  VARCHAR(255) NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_user (user_id, created_at),
    KEY idx_audit_entity (entity_type, entity_id),
    KEY idx_audit_action (action, created_at),
    KEY idx_audit_branch (branch_id, created_at),
    KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settings (
    setting_key VARCHAR(60)  NOT NULL,
    value       TEXT         NULL,
    updated_by  INT UNSIGNED NULL,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
