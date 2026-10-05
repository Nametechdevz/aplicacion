<div class="card">
    <div class="card-header d-flex justify-content-between align-items-center">
        <span><?= e($s['session']['user_name']) ?> · <?= fdate($s['session']['opened_at'], 'd/m/Y h:i a') ?> → <?= $s['session']['closed_at'] ? fdate($s['session']['closed_at'], 'd/m/Y h:i a') : 'abierta' ?></span>
        <a href="<?= url('/cash/' . $s['session']['id'] . '/print') ?>" target="_blank" class="btn btn-sm btn-light"><i class="bi bi-printer"></i> Imprimir</a>
    </div>
    <div class="card-body">
        <?php include __DIR__ . '/_summary.php'; ?>
        <?php if ($s['session']['notes']): ?><p class="mt-2 mb-0"><b>Observaciones:</b> <?= e($s['session']['notes']) ?></p><?php endif; ?>
        <a href="<?= url('/sales', ['from' => substr($s['session']['opened_at'], 0, 10), 'to' => substr($s['session']['closed_at'] ?? date('Y-m-d'), 0, 10), 'user_id' => $s['session']['user_id']]) ?>" class="btn btn-sm btn-outline-primary mt-3">Ver ventas del turno</a>
    </div>
</div>
