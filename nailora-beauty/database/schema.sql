-- =====================================================================
-- Nailora Beauty — Esquema de base de datos
-- Compatible con MySQL 8.0+ y MariaDB 10.5+
-- Motor InnoDB, juego de caracteres utf8mb4.
--
-- Este archivo es idempotente: usa CREATE TABLE IF NOT EXISTS y puede
-- importarse de nuevo sin borrar datos. No contiene contraseñas.
-- El primer administrador se crea con el instalador (/instalar) o con
-- `php bin/create-admin.php`.
-- =====================================================================

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

-- ---------------------------------------------------------------------
-- Usuarios administrativos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name          VARCHAR(120) NOT NULL,
    email         VARCHAR(190) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'admin',
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    last_login_at DATETIME     NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Intentos de inicio de sesión (limitación de fuerza bruta)
CREATE TABLE IF NOT EXISTS login_attempts (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ip           VARCHAR(45) NOT NULL,
    email_hash   CHAR(64)    NOT NULL,
    successful   TINYINT(1)  NOT NULL DEFAULT 0,
    attempted_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_login_ip (ip, attempted_at),
    KEY idx_login_email (email_hash, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name        VARCHAR(120) NOT NULL,
    slug        VARCHAR(140) NOT NULL,
    description TEXT         NULL,
    image_path  VARCHAR(255) NULL,
    is_active   TINYINT(1)   NOT NULL DEFAULT 1,
    sort_order  INT          NOT NULL DEFAULT 0,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_categories_slug (slug),
    KEY idx_categories_active_sort (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS brands (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name       VARCHAR(120) NOT NULL,
    slug       VARCHAR(140) NOT NULL,
    is_active  TINYINT(1)   NOT NULL DEFAULT 1,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_brands_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
    id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    category_id         INT UNSIGNED  NOT NULL,
    brand_id            INT UNSIGNED  NULL,
    name                VARCHAR(180)  NOT NULL,
    slug                VARCHAR(200)  NOT NULL,
    sku                 VARCHAR(60)   NOT NULL,
    product_type        VARCHAR(60)   NULL,
    short_description   VARCHAR(500)  NULL,
    description         TEXT          NULL,
    price               DECIMAL(12,2) NOT NULL,
    compare_at_price    DECIMAL(12,2) NULL COMMENT 'Precio anterior (tachado) definido manualmente',
    cost_price          DECIMAL(12,2) NULL COMMENT 'Costo de adquisición, solo visible en administración',
    stock               INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT 'Existencias si el producto NO tiene variantes',
    low_stock_threshold INT UNSIGNED  NOT NULL DEFAULT 5,
    has_variants        TINYINT(1)    NOT NULL DEFAULT 0,
    is_active           TINYINT(1)    NOT NULL DEFAULT 1,
    is_featured         TINYINT(1)    NOT NULL DEFAULT 0,
    is_new              TINYINT(1)    NOT NULL DEFAULT 0,
    meta_title          VARCHAR(180)  NULL,
    meta_description    VARCHAR(300)  NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_products_slug (slug),
    UNIQUE KEY uq_products_sku (sku),
    KEY idx_products_category (category_id, is_active),
    KEY idx_products_brand (brand_id),
    KEY idx_products_active_featured (is_active, is_featured),
    KEY idx_products_active_created (is_active, created_at),
    KEY idx_products_price (price),
    KEY idx_products_type (product_type),
    KEY idx_products_name (name),
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_products_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_products_price CHECK (price >= 0),
    CONSTRAINT chk_products_compare CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
    CONSTRAINT chk_products_cost CHECK (cost_price IS NULL OR cost_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_images (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id INT UNSIGNED NOT NULL,
    path       VARCHAR(255) NOT NULL COMMENT 'Ruta relativa a public/',
    alt        VARCHAR(200) NULL,
    sort_order INT          NOT NULL DEFAULT 0,
    is_primary TINYINT(1)   NOT NULL DEFAULT 0,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_images_product (product_id, is_primary, sort_order),
    CONSTRAINT fk_images_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Variantes reales (color, presentación...). Cada una tiene SKU, precio opcional y stock propios.
CREATE TABLE IF NOT EXISTS product_variants (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    product_id       INT UNSIGNED  NOT NULL,
    name             VARCHAR(120)  NOT NULL,
    sku              VARCHAR(60)   NOT NULL,
    color_hex        CHAR(7)       NULL,
    price            DECIMAL(12,2) NULL COMMENT 'NULL = usa el precio del producto',
    compare_at_price DECIMAL(12,2) NULL,
    stock            INT UNSIGNED  NOT NULL DEFAULT 0,
    is_active        TINYINT(1)    NOT NULL DEFAULT 1,
    sort_order       INT           NOT NULL DEFAULT 0,
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_variants_sku (sku),
    KEY idx_variants_product (product_id, is_active, sort_order),
    CONSTRAINT fk_variants_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT,
    CONSTRAINT chk_variants_price CHECK (price IS NULL OR price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Clientes y pedidos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    full_name    VARCHAR(150) NOT NULL,
    phone        VARCHAR(20)  NOT NULL COMMENT 'Normalizado: 57 + 10 dígitos',
    email        VARCHAR(190) NULL,
    department   VARCHAR(80)  NULL,
    city         VARCHAR(100) NULL,
    address      VARCHAR(255) NULL,
    neighborhood VARCHAR(120) NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_customers_phone (phone),
    KEY idx_customers_name (full_name),
    KEY idx_customers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
    id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    code                VARCHAR(24)   NULL COMMENT 'Código público NB-AAAA-000000',
    public_token        CHAR(32)      NOT NULL COMMENT 'Secreto para ver la confirmación sin cuenta',
    checkout_token      CHAR(32)      NULL COMMENT 'Evita pedidos duplicados por doble envío',
    customer_id         INT UNSIGNED  NOT NULL,
    customer_name       VARCHAR(150)  NOT NULL,
    customer_phone      VARCHAR(20)   NOT NULL,
    customer_email      VARCHAR(190)  NULL,
    department          VARCHAR(80)   NOT NULL,
    city                VARCHAR(100)  NOT NULL,
    address             VARCHAR(255)  NOT NULL,
    neighborhood        VARCHAR(120)  NULL,
    delivery_notes      VARCHAR(500)  NULL,
    payment_method      VARCHAR(80)   NULL,
    payment_status      ENUM('pending','paid','refunded') NOT NULL DEFAULT 'pending',
    status              ENUM('pending','confirmed','preparing','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
    stock_status        ENUM('reserved','released') NOT NULL DEFAULT 'reserved' COMMENT 'released = stock devuelto por cancelación',
    subtotal            DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_total      DECIMAL(12,2) NOT NULL DEFAULT 0,
    shipping_cost       DECIMAL(12,2) NULL COMMENT 'NULL = por confirmar',
    total               DECIMAL(12,2) NOT NULL DEFAULT 0,
    whatsapp_opened_at  DATETIME      NULL COMMENT 'El cliente pulsó el botón de WhatsApp (no implica confirmación)',
    confirmed_at        DATETIME      NULL,
    cancelled_at        DATETIME      NULL,
    privacy_accepted_at DATETIME      NOT NULL,
    ip_address          VARCHAR(45)   NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_orders_code (code),
    UNIQUE KEY uq_orders_checkout_token (checkout_token),
    KEY idx_orders_status_created (status, created_at),
    KEY idx_orders_created (created_at),
    KEY idx_orders_customer (customer_id),
    KEY idx_orders_phone (customer_phone),
    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE RESTRICT,
    CONSTRAINT chk_orders_amounts CHECK (subtotal >= 0 AND discount_total >= 0 AND total >= 0 AND (shipping_cost IS NULL OR shipping_cost >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Copia inmutable de cada producto vendido (nombre, SKU y precios al momento de la compra)
CREATE TABLE IF NOT EXISTS order_items (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    order_id        INT UNSIGNED  NOT NULL,
    product_id      INT UNSIGNED  NULL,
    variant_id      INT UNSIGNED  NULL,
    product_name    VARCHAR(180)  NOT NULL,
    variant_name    VARCHAR(120)  NULL,
    sku             VARCHAR(60)   NOT NULL,
    unit_price      DECIMAL(12,2) NOT NULL COMMENT 'Precio de lista unitario',
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'Descuento unitario por promoción',
    final_price     DECIMAL(12,2) NOT NULL COMMENT 'Precio unitario cobrado',
    quantity        INT UNSIGNED  NOT NULL,
    line_total      DECIMAL(12,2) NOT NULL,
    promotion_name  VARCHAR(150)  NULL,
    PRIMARY KEY (id),
    KEY idx_items_order (order_id),
    KEY idx_items_product (product_id),
    KEY idx_items_variant (variant_id),
    CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL,
    CONSTRAINT fk_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE SET NULL,
    CONSTRAINT chk_items_quantity CHECK (quantity > 0),
    CONSTRAINT chk_items_prices CHECK (unit_price >= 0 AND final_price >= 0 AND discount_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_status_history (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id    INT UNSIGNED NOT NULL,
    from_status VARCHAR(20)  NULL,
    to_status   VARCHAR(20)  NOT NULL,
    user_id     INT UNSIGNED NULL COMMENT 'NULL = sistema / cliente',
    note        VARCHAR(500) NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_status_history_order (order_id, created_at),
    CONSTRAINT fk_status_history_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    CONSTRAINT fk_status_history_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_notes (
    id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    order_id   INT UNSIGNED  NOT NULL,
    user_id    INT UNSIGNED  NULL,
    note       VARCHAR(1000) NOT NULL,
    created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_order_notes_order (order_id, created_at),
    CONSTRAINT fk_order_notes_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    CONSTRAINT fk_order_notes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Inventario: libro de movimientos (solo inserción; la aplicación nunca
-- edita ni borra filas). La columna variant_key permite la restricción
-- única que impide descontar o devolver dos veces el stock de un pedido.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id      INT UNSIGNED    NOT NULL,
    variant_id      INT UNSIGNED    NULL,
    variant_key     INT UNSIGNED    AS (IFNULL(variant_id, 0)) STORED,
    movement_type   ENUM('initial','purchase','return_in','damage','loss','adjustment','order_reserve','order_cancel_return') NOT NULL,
    quantity_before INT             NOT NULL,
    quantity_change INT             NOT NULL COMMENT 'Positivo = entrada, negativo = salida',
    quantity_after  INT             NOT NULL,
    reason          VARCHAR(255)    NOT NULL,
    reference       VARCHAR(120)    NULL,
    order_id        INT UNSIGNED    NULL,
    user_id         INT UNSIGNED    NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_movements_order_line (order_id, movement_type, product_id, variant_key),
    KEY idx_movements_product (product_id, created_at),
    KEY idx_movements_variant (variant_id),
    KEY idx_movements_type (movement_type, created_at),
    KEY idx_movements_created (created_at),
    CONSTRAINT fk_movements_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT,
    CONSTRAINT fk_movements_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE RESTRICT,
    CONSTRAINT fk_movements_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
    CONSTRAINT fk_movements_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT chk_movements_after CHECK (quantity_after >= 0 AND quantity_before >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Promociones automáticas (sin cupón): se aplican en el servidor
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promotions (
    id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    name           VARCHAR(150)  NOT NULL,
    discount_type  ENUM('percent','fixed') NOT NULL,
    discount_value DECIMAL(12,2) NOT NULL,
    scope          ENUM('all','products','categories') NOT NULL DEFAULT 'products',
    starts_at      DATETIME      NOT NULL,
    ends_at        DATETIME      NOT NULL,
    is_active      TINYINT(1)    NOT NULL DEFAULT 1,
    created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_promotions_active_dates (is_active, starts_at, ends_at),
    CONSTRAINT chk_promotions_value CHECK (discount_value > 0),
    CONSTRAINT chk_promotions_percent CHECK (discount_type <> 'percent' OR discount_value <= 90),
    CONSTRAINT chk_promotions_dates CHECK (ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promotion_products (
    promotion_id INT UNSIGNED NOT NULL,
    product_id   INT UNSIGNED NOT NULL,
    PRIMARY KEY (promotion_id, product_id),
    KEY idx_promo_products_product (product_id),
    CONSTRAINT fk_promo_products_promotion FOREIGN KEY (promotion_id) REFERENCES promotions (id) ON DELETE CASCADE,
    CONSTRAINT fk_promo_products_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promotion_categories (
    promotion_id INT UNSIGNED NOT NULL,
    category_id  INT UNSIGNED NOT NULL,
    PRIMARY KEY (promotion_id, category_id),
    KEY idx_promo_categories_category (category_id),
    CONSTRAINT fk_promo_categories_promotion FOREIGN KEY (promotion_id) REFERENCES promotions (id) ON DELETE CASCADE,
    CONSTRAINT fk_promo_categories_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Configuración, páginas informativas y auditoría
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    `key`      VARCHAR(80) NOT NULL,
    `value`    TEXT        NULL,
    updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pages (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug             VARCHAR(120) NOT NULL,
    title            VARCHAR(150) NOT NULL,
    content          MEDIUMTEXT   NULL,
    meta_description VARCHAR(300) NULL,
    is_active        TINYINT(1)   NOT NULL DEFAULT 1,
    sort_order       INT          NOT NULL DEFAULT 0,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pages_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     INT UNSIGNED    NULL,
    action      VARCHAR(80)     NOT NULL,
    entity_type VARCHAR(60)     NULL,
    entity_id   INT UNSIGNED    NULL,
    details     TEXT            NULL,
    ip_address  VARCHAR(45)     NULL,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_created (created_at),
    KEY idx_audit_entity (entity_type, entity_id),
    KEY idx_audit_user (user_id),
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET foreign_key_checks = 1;

-- ---------------------------------------------------------------------
-- Valores iniciales seguros de configuración (no se sobrescriben si ya existen)
-- El número de WhatsApp queda vacío: debe configurarse en /admin/configuracion.
-- ---------------------------------------------------------------------
INSERT IGNORE INTO settings (`key`, `value`) VALUES
('store_name', 'Nailora Beauty'),
('store_tagline', 'Esmaltes y productos para uñas'),
('store_description', 'Tienda online de esmaltes, productos para uñas, herramientas y accesorios de belleza con envíos a toda Colombia.'),
('logo_path', ''),
('favicon_path', ''),
('whatsapp_number', ''),
('contact_phone', ''),
('contact_email', ''),
('store_address', ''),
('business_hours', 'Lunes a sábado, 9:00 a. m. a 6:00 p. m.'),
('currency', 'COP'),
('promo_bar_enabled', '1'),
('promo_bar_text', 'Tu próximo color favorito está aquí'),
('hero_eyebrow', 'Nueva colección'),
('hero_title', 'Color que se queda contigo'),
('hero_subtitle', 'Esmaltes, geles y herramientas para lucir uñas impecables en casa o en tu salón. Envíos a toda Colombia.'),
('hero_image', ''),
('hero_cta_text', 'Comprar ahora'),
('shipping_mode', 'manual'),
('shipping_flat_rate', '0'),
('free_shipping_threshold', '0'),
('shipping_info', 'Enviamos a todo el territorio colombiano. El costo y el tiempo de entrega dependen de la ciudad de destino y se confirman por WhatsApp antes de despachar tu pedido.'),
('payment_methods', 'Transferencia bancaria\nPago contra entrega (según cobertura)'),
('low_stock_default', '5'),
('social_instagram', ''),
('social_facebook', ''),
('social_tiktok', ''),
('whatsapp_order_intro', 'Hola, Nailora Beauty. Quiero confirmar mi pedido.'),
('benefits', 'Envíos a toda Colombia|Despachamos a cualquier municipio del país.\nAtención por WhatsApp|Te acompañamos antes y después de tu compra.\nCompra segura|Confirmamos cada pedido contigo antes de cobrar.');
