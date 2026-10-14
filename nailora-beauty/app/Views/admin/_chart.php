<?php
/** Gráfica de barras de una serie (ventas confirmadas) generada como SVG en el servidor. */
$points = $series['points'];
$max = max(1, max(array_column($points, 'sales_total') ?: [0]));
// Escala "redonda" para el eje
$magnitude = 10 ** max(0, floor(log10($max)));
$niceMax = ceil($max / $magnitude) * $magnitude;
$w = 720; $h = 240; $padL = 64; $padB = 28; $padT = 10;
$plotW = $w - $padL - 8; $plotH = $h - $padB - $padT;
$n = max(1, count($points));
$slot = $plotW / $n;
$barW = max(2, min(28, $slot * 0.62));
$labelEvery = max(1, (int) ceil($n / 10));
$hasData = array_sum(array_column($points, 'sales_total')) > 0;
?>
<figure class="chart">
  <?php if (!$hasData): ?>
    <div class="chart__empty"><?= icon('chart', '', 28) ?><p>Aún no hay ventas confirmadas en este periodo.</p></div>
  <?php else: ?>
  <svg viewBox="0 0 <?= $w ?> <?= $h ?>" class="chart__svg" role="img" aria-label="Ventas confirmadas por <?= $series['monthly'] ? 'mes' : 'día' ?>">
    <?php for ($i = 0; $i <= 4; $i++): $v = $niceMax * $i / 4; $y = $padT + $plotH - ($v / $niceMax) * $plotH; ?>
      <line x1="<?= $padL ?>" x2="<?= $w - 8 ?>" y1="<?= round($y, 1) ?>" y2="<?= round($y, 1) ?>" class="chart__grid"/>
      <text x="<?= $padL - 8 ?>" y="<?= round($y + 4, 1) ?>" class="chart__axis" text-anchor="end"><?= e($v >= 1000000 ? number_format($v / 1000000, 1, ',', '.') . ' M' : ($v >= 1000 ? number_format($v / 1000, 0, ',', '.') . ' mil' : number_format($v, 0, ',', '.'))) ?></text>
    <?php endfor; ?>
    <?php foreach ($points as $i => $p):
        $x = $padL + $slot * $i + ($slot - $barW) / 2;
        $bh = $p['sales_total'] > 0 ? max(2, ($p['sales_total'] / $niceMax) * $plotH) : 0;
        $y = $padT + $plotH - $bh;
        $r = min(4, $barW / 2, $bh);
    ?>
      <g class="chart__bar-group" tabindex="0">
        <title><?= e($p['label'] . ': ' . money($p['sales_total']) . ' en ventas confirmadas · ' . $p['registered'] . ' pedido(s) registrado(s)') ?></title>
        <rect x="<?= round($padL + $slot * $i, 1) ?>" y="<?= $padT ?>" width="<?= round($slot, 1) ?>" height="<?= $plotH ?>" class="chart__hit"/>
        <?php if ($bh > 0): ?>
          <path class="chart__bar" d="M<?= round($x, 1) ?>,<?= round($padT + $plotH, 1) ?> V<?= round($y + $r, 1) ?> Q<?= round($x, 1) ?>,<?= round($y, 1) ?> <?= round($x + $r, 1) ?>,<?= round($y, 1) ?> H<?= round($x + $barW - $r, 1) ?> Q<?= round($x + $barW, 1) ?>,<?= round($y, 1) ?> <?= round($x + $barW, 1) ?>,<?= round($y + $r, 1) ?> V<?= round($padT + $plotH, 1) ?> Z"/>
        <?php endif; ?>
      </g>
      <?php if ($i % $labelEvery === 0): ?>
        <text x="<?= round($padL + $slot * $i + $slot / 2, 1) ?>" y="<?= $h - 8 ?>" class="chart__axis" text-anchor="middle"><?= e($series['monthly'] ? mb_substr($p['label'], 0, 3) : $p['label']) ?></text>
      <?php endif; ?>
    <?php endforeach; ?>
    <line x1="<?= $padL ?>" x2="<?= $w - 8 ?>" y1="<?= $padT + $plotH ?>" y2="<?= $padT + $plotH ?>" class="chart__baseline"/>
  </svg>
  <details class="chart__table">
    <summary>Ver datos en tabla</summary>
    <div class="table-wrap">
      <table class="table table--compact">
        <thead><tr><th scope="col"><?= $series['monthly'] ? 'Mes' : 'Día' ?></th><th scope="col" class="num">Ventas confirmadas</th><th scope="col" class="num">Pedidos registrados</th></tr></thead>
        <tbody>
          <?php foreach ($points as $p): ?><tr><td><?= e($p['label']) ?></td><td class="num"><?= money($p['sales_total']) ?></td><td class="num"><?= (int) $p['registered'] ?></td></tr><?php endforeach; ?>
        </tbody>
      </table>
    </div>
  </details>
  <?php endif; ?>
</figure>
