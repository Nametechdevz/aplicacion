-- =====================================================================
-- Nailora Beauty — DATOS DE DEMOSTRACIÓN
--
-- Todo lo que contiene este archivo es contenido de ejemplo para probar
-- la tienda: productos genéricos (SKU con prefijo DEMO-), precios y
-- existencias ficticios, ilustraciones propias y textos legales iniciales.
-- No representa marcas, proveedores, reseñas ni promociones reales.
--
-- Puede importarse varias veces: no duplica registros.
-- Para retirar los productos de demostración antes de publicar la tienda,
-- use database/clear-demo.sql (lea las advertencias de ese archivo).
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------------------
INSERT IGNORE INTO categories (name, slug, description, image_path, is_active, sort_order) VALUES
('Esmaltes tradicionales', 'esmaltes-tradicionales', 'Esmaltes de secado al aire en tonos clásicos y de temporada.', 'assets/images/categories/esmaltes-tradicionales.svg', 1, 1),
('Esmaltes semipermanentes', 'esmaltes-semipermanentes', 'Esmaltes en gel de curado con lámpara UV/LED para un acabado duradero.', 'assets/images/categories/esmaltes-semipermanentes.svg', 1, 2),
('Bases y top coat', 'bases-y-top-coat', 'Preparación y sellado para que tu manicura luzca y dure más.', 'assets/images/categories/bases-y-top-coat.svg', 1, 3),
('Gel y polygel', 'gel-y-polygel', 'Geles constructores y polygel para extensiones y nivelación.', 'assets/images/categories/gel-y-polygel.svg', 1, 4),
('Acrílicos', 'acrilicos', 'Polvos acrílicos y líquidos para esculpir uñas.', 'assets/images/categories/acrilicos.svg', 1, 5),
('Lámparas UV/LED', 'lamparas-uv-led', 'Equipos de curado para esmaltes semipermanentes y geles.', 'assets/images/categories/lamparas-uv-led.svg', 1, 6),
('Herramientas de manicura', 'herramientas-de-manicura', 'Limas, empujadores, alicates y utensilios para el cuidado de las uñas.', 'assets/images/categories/herramientas-de-manicura.svg', 1, 7),
('Decoración y nail art', 'decoracion-y-nail-art', 'Piedras, pinceles y accesorios para diseños creativos.', 'assets/images/categories/decoracion-y-nail-art.svg', 1, 8),
('Removedores y tratamientos', 'removedores-y-tratamientos', 'Removedores, aceites y tratamientos para uñas y cutículas.', 'assets/images/categories/removedores-y-tratamientos.svg', 1, 9),
('Accesorios', 'accesorios', 'Complementos prácticos para tu rutina de manicura.', 'assets/images/categories/accesorios.svg', 1, 10);

-- ---------------------------------------------------------------------
-- Productos de demostración (SKU DEMO-*). Precios en COP.
-- ---------------------------------------------------------------------
INSERT IGNORE INTO products
    (category_id, name, slug, sku, product_type, short_description, description, price, compare_at_price, cost_price, stock, low_stock_threshold, has_variants, is_active, is_featured, is_new)
SELECT c.id, d.name, d.slug, d.sku, d.ptype, d.short_d, d.long_d, d.price, d.compare_at, d.cost, d.stock, d.low, d.variants, 1, d.featured, d.is_new
FROM (
    SELECT 'esmaltes-tradicionales' AS cat, 'Esmalte tradicional rosa nude' AS name, 'esmalte-tradicional-rosa-nude' AS slug, 'DEMO-ET-001' AS sku, 'Esmalte' AS ptype,
           'Tono rosa nude de acabado cremoso, ideal para el día a día. Producto de demostración.' AS short_d,
           'Producto de demostración: reemplace esta descripción con la información real del producto (contenido, modo de uso, ingredientes y advertencias del fabricante).\n\nEsmalte de secado al aire con acabado cremoso. Aplique dos capas finas sobre una base y selle con top coat para mayor duración.' AS long_d,
           12000.00 AS price, NULL AS compare_at, 6500.00 AS cost, 25 AS stock, 5 AS low, 0 AS variants, 1 AS featured, 1 AS is_new
    UNION ALL SELECT 'esmaltes-tradicionales', 'Esmalte tradicional rojo cereza', 'esmalte-tradicional-rojo-cereza', 'DEMO-ET-002', 'Esmalte',
           'Rojo intenso y clásico con alto brillo. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.\n\nRojo cereza de alta pigmentación. Recomendado aplicar sobre base coat.',
           12000.00, NULL, 6500.00, 18, 5, 0, 0, 0
    UNION ALL SELECT 'esmaltes-tradicionales', 'Esmalte tradicional colección básica', 'esmalte-tradicional-coleccion-basica', 'DEMO-ET-100', 'Esmalte',
           'Elige tu tono favorito entre cuatro colores esenciales. Producto de demostración con variantes.',
           'Producto de demostración: este producto muestra cómo funcionan las variantes. Cada color tiene su propio SKU, precio y existencias.\n\nEsmalte de secado al aire de 15 ml.',
           13000.00, NULL, 7000.00, 0, 3, 1, 1, 1
    UNION ALL SELECT 'esmaltes-semipermanentes', 'Esmalte semipermanente vino', 'esmalte-semipermanente-vino', 'DEMO-ES-001', 'Esmalte semipermanente',
           'Tono vino profundo de curado UV/LED. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.\n\nEsmalte en gel de curado en lámpara UV/LED. Siga siempre las indicaciones de tiempo de curado del fabricante.',
           24000.00, NULL, 13000.00, 15, 4, 0, 1, 0
    UNION ALL SELECT 'esmaltes-semipermanentes', 'Esmalte semipermanente rosa empolvado', 'esmalte-semipermanente-rosa-empolvado', 'DEMO-ES-002', 'Esmalte semipermanente',
           'Rosa suave y elegante con acabado brillante. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.\n\nEsmalte en gel de curado en lámpara UV/LED.',
           24000.00, NULL, 13000.00, 12, 4, 0, 1, 1
    UNION ALL SELECT 'esmaltes-semipermanentes', 'Esmalte semipermanente fucsia', 'esmalte-semipermanente-fucsia', 'DEMO-ES-003', 'Esmalte semipermanente',
           'Fucsia vibrante para diseños llamativos. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.',
           24000.00, NULL, 13000.00, 3, 4, 0, 0, 0
    UNION ALL SELECT 'bases-y-top-coat', 'Base coat fortalecedora', 'base-coat-fortalecedora', 'DEMO-BT-001', 'Base y top coat',
           'Prepara la uña y mejora la adherencia del color. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.\n\nAplique una capa fina antes del color.',
           18000.00, NULL, 9000.00, 20, 5, 0, 1, 0
    UNION ALL SELECT 'bases-y-top-coat', 'Top coat brillante', 'top-coat-brillante', 'DEMO-BT-002', 'Base y top coat',
           'Sella el color con un acabado de alto brillo. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.',
           18000.00, NULL, 9000.00, 22, 5, 0, 1, 0
    UNION ALL SELECT 'bases-y-top-coat', 'Top coat mate', 'top-coat-mate', 'DEMO-BT-003', 'Base y top coat',
           'Acabado aterciopelado sin brillo. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.',
           19000.00, NULL, 9500.00, 9, 5, 0, 0, 1
    UNION ALL SELECT 'gel-y-polygel', 'Gel constructor transparente', 'gel-constructor-transparente', 'DEMO-GP-001', 'Gel',
           'Gel para nivelar y reforzar uñas naturales. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.',
           32000.00, NULL, 17000.00, 10, 3, 0, 0, 0
    UNION ALL SELECT 'gel-y-polygel', 'Polygel rosa', 'polygel-rosa', 'DEMO-GP-002', 'Gel',
           'Polygel de consistencia moldeable para extensiones. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.',
           38000.00, NULL, 20000.00, 7, 3, 0, 1, 0
    UNION ALL SELECT 'acrilicos', 'Polvo acrílico transparente', 'polvo-acrilico-transparente', 'DEMO-AC-001', 'Acrílico',
           'Polvo acrílico para esculpir y encapsular. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.',
           35000.00, NULL, 18000.00, 8, 3, 0, 0, 0
    UNION ALL SELECT 'acrilicos', 'Monómero líquido para acrílico', 'monomero-liquido-acrilico', 'DEMO-AC-002', 'Acrílico',
           'Líquido para trabajar polvo acrílico. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto, incluidas las advertencias de manipulación y ventilación.',
           42000.00, NULL, 22000.00, 6, 3, 0, 0, 0
    UNION ALL SELECT 'lamparas-uv-led', 'Lámpara UV/LED para uñas', 'lampara-uv-led-para-unas', 'DEMO-LM-001', 'Equipo',
           'Lámpara de curado para esmaltes semipermanentes y geles. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con las especificaciones reales del equipo (potencia, temporizador, garantía del fabricante).',
           120000.00, NULL, 70000.00, 4, 2, 0, 1, 0
    UNION ALL SELECT 'herramientas-de-manicura', 'Lima profesional 100/180 x5', 'lima-profesional-100-180', 'DEMO-HM-001', 'Herramienta',
           'Paquete de cinco limas de doble grano. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.',
           9000.00, NULL, 4000.00, 40, 10, 0, 0, 0
    UNION ALL SELECT 'herramientas-de-manicura', 'Empujador de cutícula en acero', 'empujador-cuticula-acero', 'DEMO-HM-002', 'Herramienta',
           'Empujador de doble punta para preparar la cutícula. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.',
           15000.00, NULL, 7000.00, 14, 5, 0, 0, 0
    UNION ALL SELECT 'herramientas-de-manicura', 'Alicate de cutícula', 'alicate-cuticula', 'DEMO-HM-003', 'Herramienta',
           'Alicate de corte preciso. Producto de demostración (sin existencias para probar el estado agotado).',
           'Producto de demostración: este producto se carga sin existencias para comprobar que la tienda impide comprar productos agotados.',
           28000.00, NULL, 14000.00, 0, 3, 0, 0, 0
    UNION ALL SELECT 'decoracion-y-nail-art', 'Piedras decorativas para nail art', 'piedras-decorativas-nail-art', 'DEMO-NA-001', 'Decoración',
           'Surtido de piedras en tonos rosa y transparentes. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.',
           8000.00, NULL, 3500.00, 30, 5, 0, 0, 1
    UNION ALL SELECT 'decoracion-y-nail-art', 'Set de pinceles para nail art', 'set-pinceles-nail-art', 'DEMO-NA-002', 'Decoración',
           'Pinceles finos para líneas y detalles. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.',
           16000.00, NULL, 7500.00, 11, 4, 0, 0, 0
    UNION ALL SELECT 'removedores-y-tratamientos', 'Removedor de esmalte sin acetona', 'removedor-esmalte-sin-acetona', 'DEMO-RT-001', 'Tratamiento',
           'Retira el esmalte tradicional con suavidad. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.',
           11000.00, NULL, 5000.00, 16, 5, 0, 0, 0
    UNION ALL SELECT 'removedores-y-tratamientos', 'Aceite para cutículas', 'aceite-para-cuticulas', 'DEMO-RT-002', 'Tratamiento',
           'Hidrata y suaviza la cutícula. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.',
           14000.00, NULL, 6000.00, 13, 5, 0, 1, 0
    UNION ALL SELECT 'accesorios', 'Separadores de dedos', 'separadores-de-dedos', 'DEMO-AX-001', 'Accesorio',
           'Separadores de espuma reutilizables. Producto de demostración.',
           'Producto de demostración: reemplace esta descripción con la información real del producto.',
           5000.00, NULL, 1800.00, 35, 8, 0, 0, 0
) AS d
JOIN categories c ON c.slug = d.cat;

-- Variantes del producto con colores
INSERT IGNORE INTO product_variants (product_id, name, sku, color_hex, price, stock, is_active, sort_order)
SELECT p.id, v.name, v.sku, v.hex, v.price, v.stock, 1, v.ord
FROM (
    SELECT 'Rosa nude' AS name, 'DEMO-ET-100-RN' AS sku, '#E3B5A8' AS hex, NULL AS price, 10 AS stock, 1 AS ord
    UNION ALL SELECT 'Rojo cereza', 'DEMO-ET-100-RC', '#B3123A', NULL, 8, 2
    UNION ALL SELECT 'Vino', 'DEMO-ET-100-VI', '#6F2445', NULL, 2, 3
    UNION ALL SELECT 'Blanco perla', 'DEMO-ET-100-BP', '#F4EFEA', 14000.00, 6, 4
) AS v
JOIN products p ON p.sku = 'DEMO-ET-100';

-- Imágenes (ilustraciones propias incluidas en public/assets/images/demo)
INSERT INTO product_images (product_id, path, alt, sort_order, is_primary)
SELECT p.id, i.path, p.name, i.ord, i.prim
FROM (
    SELECT 'DEMO-ET-001' AS sku, 'assets/images/demo/esmalte-rosa-nude.svg' AS path, 0 AS ord, 1 AS prim
    UNION ALL SELECT 'DEMO-ET-002', 'assets/images/demo/esmalte-rojo-cereza.svg', 0, 1
    UNION ALL SELECT 'DEMO-ET-100', 'assets/images/demo/esmalte-coleccion.svg', 0, 1
    UNION ALL SELECT 'DEMO-ET-100', 'assets/images/demo/esmalte-rosa-nude.svg', 1, 0
    UNION ALL SELECT 'DEMO-ET-100', 'assets/images/demo/esmalte-rojo-cereza.svg', 2, 0
    UNION ALL SELECT 'DEMO-ET-100', 'assets/images/demo/esmalte-vino.svg', 3, 0
    UNION ALL SELECT 'DEMO-ET-100', 'assets/images/demo/esmalte-blanco-perla.svg', 4, 0
    UNION ALL SELECT 'DEMO-ES-001', 'assets/images/demo/semipermanente-vino.svg', 0, 1
    UNION ALL SELECT 'DEMO-ES-002', 'assets/images/demo/semipermanente-rosa.svg', 0, 1
    UNION ALL SELECT 'DEMO-ES-003', 'assets/images/demo/semipermanente-fucsia.svg', 0, 1
    UNION ALL SELECT 'DEMO-BT-001', 'assets/images/demo/base-coat.svg', 0, 1
    UNION ALL SELECT 'DEMO-BT-002', 'assets/images/demo/top-coat-brillante.svg', 0, 1
    UNION ALL SELECT 'DEMO-BT-003', 'assets/images/demo/top-coat-mate.svg', 0, 1
    UNION ALL SELECT 'DEMO-GP-001', 'assets/images/demo/gel-constructor.svg', 0, 1
    UNION ALL SELECT 'DEMO-GP-002', 'assets/images/demo/polygel-rosa.svg', 0, 1
    UNION ALL SELECT 'DEMO-AC-001', 'assets/images/demo/acrilico-polvo.svg', 0, 1
    UNION ALL SELECT 'DEMO-AC-002', 'assets/images/demo/monomero.svg', 0, 1
    UNION ALL SELECT 'DEMO-LM-001', 'assets/images/demo/lampara-uv-led.svg', 0, 1
    UNION ALL SELECT 'DEMO-HM-001', 'assets/images/demo/lima-profesional.svg', 0, 1
    UNION ALL SELECT 'DEMO-HM-002', 'assets/images/demo/empujador-cuticula.svg', 0, 1
    UNION ALL SELECT 'DEMO-HM-003', 'assets/images/demo/alicate-cuticula.svg', 0, 1
    UNION ALL SELECT 'DEMO-NA-001', 'assets/images/demo/piedras-nail-art.svg', 0, 1
    UNION ALL SELECT 'DEMO-NA-002', 'assets/images/demo/pinceles-nail-art.svg', 0, 1
    UNION ALL SELECT 'DEMO-RT-001', 'assets/images/demo/removedor.svg', 0, 1
    UNION ALL SELECT 'DEMO-RT-002', 'assets/images/demo/aceite-cuticula.svg', 0, 1
    UNION ALL SELECT 'DEMO-AX-001', 'assets/images/demo/separadores.svg', 0, 1
) AS i
JOIN products p ON p.sku = i.sku
WHERE NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id AND pi.path = i.path);

-- Movimientos de inventario iniciales (para que el historial cuadre con las existencias)
INSERT INTO inventory_movements (product_id, variant_id, movement_type, quantity_before, quantity_change, quantity_after, reason, reference)
SELECT p.id, NULL, 'initial', 0, p.stock, p.stock, 'Inventario inicial (datos de demostración)', 'SEED'
FROM products p
WHERE p.sku LIKE 'DEMO-%' AND p.has_variants = 0 AND p.stock > 0
  AND NOT EXISTS (SELECT 1 FROM inventory_movements m WHERE m.product_id = p.id AND m.variant_id IS NULL AND m.movement_type = 'initial');

INSERT INTO inventory_movements (product_id, variant_id, movement_type, quantity_before, quantity_change, quantity_after, reason, reference)
SELECT v.product_id, v.id, 'initial', 0, v.stock, v.stock, 'Inventario inicial (datos de demostración)', 'SEED'
FROM product_variants v
WHERE v.sku LIKE 'DEMO-%' AND v.stock > 0
  AND NOT EXISTS (SELECT 1 FROM inventory_movements m WHERE m.variant_id = v.id AND m.movement_type = 'initial');

-- ---------------------------------------------------------------------
-- Páginas informativas: texto inicial prudente que el propietario debe
-- revisar y adaptar (Administración > Páginas) antes de publicar.
-- Formato: párrafos separados por línea en blanco, "## " para títulos,
-- "- " para listas.
-- ---------------------------------------------------------------------
INSERT IGNORE INTO pages (slug, title, content, meta_description, sort_order) VALUES
('sobre-nosotros', 'Sobre Nailora Beauty',
'Nailora Beauty es una tienda online dedicada a esmaltes, productos para uñas, herramientas y accesorios de belleza, con envíos a todo Colombia.\n\nQueremos que encuentres en un solo lugar lo que necesitas para lucir uñas cuidadas, ya sea en casa o en tu salón.\n\n## Cómo trabajamos\n\n- Manejamos inventario propio y actualizamos la disponibilidad de cada producto.\n- Confirmamos cada pedido contigo por WhatsApp antes de despacharlo.\n- Te acompañamos con dudas sobre productos y envíos.\n\n(Texto inicial: revíselo y adáptelo a la historia real de su negocio).',
'Conoce Nailora Beauty, tienda online de esmaltes y productos para uñas en Colombia.', 1),
('contacto', 'Contacto',
'¿Tienes preguntas sobre un producto, tu pedido o los envíos? Escríbenos y te responderemos en el horario de atención.',
'Canales de contacto de Nailora Beauty.', 2),
('preguntas-frecuentes', 'Preguntas frecuentes',
'## ¿Cómo hago un pedido?\n\nAgrega los productos al carrito, completa tus datos de entrega y envía el pedido. Después podrás abrir WhatsApp con el resumen para que confirmemos contigo la disponibilidad, el costo del envío y el método de pago.\n\n## ¿Mi pedido queda confirmado al enviarlo?\n\nTu pedido queda registrado en la tienda, pero se considera confirmado cuando nuestro equipo lo revisa y te lo confirma por WhatsApp.\n\n## ¿Hacen envíos a todo el país?\n\nSí, enviamos a todo el territorio colombiano. El costo y el tiempo de entrega dependen del destino.\n\n## ¿Qué métodos de pago aceptan?\n\nLos métodos disponibles se muestran al finalizar la compra y se confirman por WhatsApp. Esta tienda no procesa pagos con tarjeta en línea.\n\n(Texto inicial: revíselo y adáptelo).',
'Respuestas a las preguntas más comunes sobre pedidos, envíos y pagos.', 3),
('politica-de-privacidad', 'Política de privacidad',
'Este texto es un punto de partida y debe ser revisado por el propietario de la tienda, idealmente con asesoría legal, antes de publicarse.\n\n## Información que recopilamos\n\nAl realizar un pedido solicitamos nombre, número de contacto, datos de entrega y, de forma opcional, correo electrónico. Esta información se usa únicamente para gestionar y entregar tu pedido y para comunicarnos contigo sobre él.\n\n## Cómo protegemos tus datos\n\nLos datos se almacenan en nuestra base de datos con acceso restringido al personal autorizado. No vendemos ni compartimos tus datos con terceros, salvo con las empresas de transporte en la medida necesaria para entregar el pedido.\n\n## Tus derechos\n\nPuedes solicitar la consulta, actualización o eliminación de tus datos a través de nuestros canales de contacto.',
'Política de privacidad de Nailora Beauty.', 4),
('tratamiento-de-datos', 'Tratamiento de datos personales',
'Este texto es un punto de partida y debe ser revisado y completado por el responsable del tratamiento antes de publicarse, conforme a la normativa colombiana de protección de datos personales (Ley 1581 de 2012 y sus decretos reglamentarios).\n\n## Responsable del tratamiento\n\nComplete aquí la razón social o nombre, identificación, dirección y canales de contacto del responsable.\n\n## Finalidades\n\n- Gestionar pedidos, entregas y comunicaciones relacionadas.\n- Atender solicitudes, peticiones, quejas y reclamos.\n\n## Derechos del titular\n\nConocer, actualizar, rectificar y solicitar la supresión de sus datos, así como revocar la autorización otorgada, a través de los canales de contacto indicados.',
'Política de tratamiento de datos personales de Nailora Beauty.', 5),
('condiciones-de-compra', 'Condiciones de compra',
'Este texto es un punto de partida y debe ser revisado por el propietario de la tienda antes de publicarse.\n\n## Pedidos\n\nAl enviar un pedido, este queda registrado y pendiente de confirmación. El pedido se confirma cuando nuestro equipo verifica la disponibilidad, el costo del envío y el método de pago contigo por WhatsApp.\n\n## Precios\n\nLos precios se expresan en pesos colombianos (COP). El costo del envío se informa antes de confirmar el pedido.\n\n## Disponibilidad\n\nLas existencias se actualizan de forma manual. Si un producto deja de estar disponible, te lo informaremos antes de confirmar el pedido.',
'Condiciones de compra de Nailora Beauty.', 6),
('envios', 'Envíos',
'Enviamos a todo el territorio colombiano.\n\n## Costo del envío\n\nEl costo depende de la ciudad o municipio de destino. Si no se muestra en el carrito, se confirmará por WhatsApp antes de despachar el pedido.\n\n## Tiempos de entrega\n\nLos tiempos varían según el destino y la transportadora. Te informaremos el tiempo estimado al confirmar tu pedido.\n\n(Texto inicial: revíselo y complételo con sus condiciones reales).',
'Información de envíos de Nailora Beauty a todo Colombia.', 7),
('cambios-y-devoluciones', 'Cambios y devoluciones',
'Este texto es un punto de partida y debe ser revisado por el propietario de la tienda antes de publicarse.\n\nSi tu producto llegó con algún problema, escríbenos por WhatsApp dentro de los días siguientes a la entrega, con el número de pedido y fotografías del producto, para revisar tu caso.\n\nDefina aquí las condiciones reales de cambios, devoluciones y el derecho de retracto aplicable a las ventas a distancia.',
'Política de cambios y devoluciones de Nailora Beauty.', 8);
