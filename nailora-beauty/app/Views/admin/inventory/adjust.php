<?php
use App\Core\View;
use App\Models\InventoryMovement;

$current = null;
if ($product) {
    if ((int) $product['has_variants']) {
        foreach ($variants as $v) { if ((int) $v['id'] === $variantId) { $current = (int) $v['stock']; } }
    } else {
        $current = (int) $product['stock'];
    }
}
?>
<?= View::partial('admin/_header', ['title' => 'Registrar movimiento de inventario']) ?>
<?= View::partial('admin/inventory/_tabs') ?>

<div class="admin-grid admin-grid--form">
  <div>
    <form method="get" action="<?= e(url('admin/inventario/ajustar')) ?>" class="panel">
      <h2 class="panel__title">1. Producto</h2>
      <div class="filter-bar filter-bar--plain">
        <label for="producto" class="visually-hidden">Producto</label>
        <select id="producto" name="producto" required data-autosubmit-select>
          <option value="">Seleccione un producto…</option>
          <?php foreach ($products as $p): ?><option value="<?= (int) $p['id'] ?>"<?= selected($p['id'], $product['id'] ?? '') ?>><?= e($p['name']) ?> (<?= e($p['sku']) ?>)<?= (int) $p['is_active'] ? '' : ' — inactivo' ?></option><?php endforeach; ?>
        </select>
        <?php if ($variants): ?>
          <label for="variante" class="visually-hidden">Variante</label>
          <select id="variante" name="variante" required data-autosubmit-select>
            <option value="">Seleccione la variante…</option>
            <?php foreach ($variants as $v): ?><option value="<?= (int) $v['id'] ?>"<?= selected($v['id'], $variantId) ?>><?= e($v['name']) ?> (<?= e($v['sku']) ?>) — <?= (int) $v['stock'] ?> und.</option><?php endforeach; ?>
          </select>
        <?php endif; ?>
        <button type="submit" class="btn btn--ghost">Seleccionar</button>
      </div>
      <?php if ($product && (int) $product['has_variants'] && !$variants): ?>
        <p class="notice notice--warning">Este producto maneja variantes pero aún no tiene ninguna. <a href="<?= e(url('admin/productos/' . $product['id'] . '/editar#variantes')) ?>">Agregar variantes</a>.</p>
      <?php endif; ?>
    </form>

    <?php if ($current !== null): ?>
    <form method="post" action="<?= e(url('admin/inventario/ajustar')) ?>" class="panel" data-once-submit>
      <?= csrf_field() ?>
      <input type="hidden" name="product_id" value="<?= (int) $product['id'] ?>">
      <?php if ($variantId): ?><input type="hidden" name="variant_id" value="<?= (int) $variantId ?>"><?php endif; ?>
      <h2 class="panel__title">2. Movimiento</h2>
      <p class="stock-now">Existencias actuales: <strong data-current-stock="<?= $current ?>"><?= $current ?></strong> unidades</p>
      <div class="form-grid">
        <div class="field field--full">
          <label for="movement_type">Tipo de movimiento</label>
          <select id="movement_type" name="movement_type" required data-movement-type>
            <?php foreach (InventoryMovement::MANUAL_TYPES as $type => $dir): ?>
              <option value="<?= e($type) ?>" data-direction="<?= e($dir) ?>"<?= selected($type, old('movement_type')) ?>><?= e(InventoryMovement::TYPES[$type]) ?> (<?= $dir === 'in' ? 'suma' : ($dir === 'out' ? 'resta' : 'fija la cantidad contada') ?>)</option>
            <?php endforeach; ?>
          </select>
        </div>
        <div class="field">
          <label for="quantity" data-quantity-label>Cantidad</label>
          <input id="quantity" name="quantity" type="number" min="0" step="1" required value="<?= e(old('quantity')) ?>" data-quantity>
          <p class="hint" data-preview aria-live="polite"></p>
        </div>
        <div class="field">
          <label for="reference">Referencia <span class="optional">(factura, remisión…)</span></label>
          <input id="reference" name="reference" maxlength="120" value="<?= e(old('reference')) ?>">
        </div>
        <div class="field field--full">
          <label for="reason">Motivo (obligatorio)</label>
          <input id="reason" name="reason" required maxlength="255" value="<?= e(old('reason')) ?>" placeholder="Ej.: Reposición de proveedor, conteo físico mensual, frasco roto…">
        </div>
      </div>
      <div class="form-actions"><button type="submit" class="btn btn--primary" data-loading-text="Registrando…">Registrar movimiento</button></div>
    </form>
    <?php endif; ?>
  </div>

  <aside class="panel">
    <h2 class="panel__title">Movimientos recientes</h2>
    <?php if ($recent): ?>
      <ul class="timeline">
        <?php foreach ($recent as $m): $chg = (int) $m['quantity_change']; ?>
          <li>
            <strong class="<?= $chg >= 0 ? 'text-success' : 'text-error' ?>"><?= $chg > 0 ? '+' : '' ?><?= $chg ?></strong>
            <?= e(movement_type_label($m['movement_type'])) ?><?= $m['variant_name'] ? ' · ' . e($m['variant_name']) : '' ?>
            <span class="muted small"><?= e(date_es($m['created_at'], true)) ?> · <?= (int) $m['quantity_before'] ?> → <?= (int) $m['quantity_after'] ?></span>
          </li>
        <?php endforeach; ?>
      </ul>
      <a class="link-arrow" href="<?= e(url('admin/inventario/movimientos?producto=' . $product['id'])) ?>">Ver historial completo <?= icon('arrow-right', '', 14) ?></a>
    <?php else: ?>
      <p class="muted"><?= $product ? 'Sin movimientos registrados.' : 'Seleccione un producto para ver su historial.' ?></p>
    <?php endif; ?>
  </aside>
</div>
