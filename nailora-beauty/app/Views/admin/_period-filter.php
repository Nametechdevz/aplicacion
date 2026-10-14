<?php use App\Services\ReportService; ?>
<form method="get" action="<?= e(url($action)) ?>" class="period-filter" data-period-filter>
  <label for="periodo" class="visually-hidden">Periodo</label>
  <select id="periodo" name="periodo" data-period-select>
    <?php foreach (ReportService::PERIODS as $key => $label): ?>
      <option value="<?= e($key) ?>"<?= selected($key, $period['key']) ?>><?= e($label) ?></option>
    <?php endforeach; ?>
  </select>
  <span class="period-filter__range" data-period-range<?= $period['key'] === 'rango' ? '' : ' hidden' ?>>
    <label><span class="visually-hidden">Desde</span><input type="date" name="desde" value="<?= e($period['from']) ?>" max="<?= date('Y-m-d') ?>"></label>
    <label><span class="visually-hidden">Hasta</span><input type="date" name="hasta" value="<?= e($period['to']) ?>" max="<?= date('Y-m-d') ?>"></label>
  </span>
  <button type="submit" class="btn btn--ghost btn--sm">Aplicar</button>
</form>
