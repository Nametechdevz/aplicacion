-- =====================================================================
-- Nailora Beauty — Retirar los productos de DEMOSTRACIÓN (SKU DEMO-*)
--
-- Ejecútelo antes de publicar la tienda con sus productos reales.
-- 1) Desactiva todos los productos de demostración (siempre es seguro).
-- 2) Elimina definitivamente los que NO aparecen en ningún pedido, junto
--    con sus imágenes, variantes y movimientos de inventario de prueba.
--    Los que sí aparecen en pedidos quedan desactivados para no romper
--    el historial de esos pedidos.
-- No toca categorías, páginas, configuración, usuarios ni pedidos.
-- HAGA UNA COPIA DE SEGURIDAD ANTES DE EJECUTARLO.
-- =====================================================================

SET NAMES utf8mb4;

UPDATE products SET is_active = 0, is_featured = 0 WHERE sku LIKE 'DEMO-%';

CREATE TEMPORARY TABLE demo_removable AS
SELECT p.id FROM products p
WHERE p.sku LIKE 'DEMO-%'
  AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id);

DELETE FROM inventory_movements WHERE product_id IN (SELECT id FROM demo_removable);
DELETE FROM product_images WHERE product_id IN (SELECT id FROM demo_removable);
DELETE FROM product_variants WHERE product_id IN (SELECT id FROM demo_removable);
DELETE FROM products WHERE id IN (SELECT id FROM demo_removable);

DROP TEMPORARY TABLE demo_removable;
