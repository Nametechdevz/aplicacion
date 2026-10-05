<?php /* Genera el QR DIAN en el elemento #qr */ ?>
<script src="<?= asset('vendor/qrcode.min.js') ?>"></script>
<script>
(function () {
    var el = document.getElementById('qr');
    if (el && window.QRCode && el.dataset.qr) {
        new QRCode(el, { text: el.dataset.qr, width: <?= (int) ($qrSize ?? 140) ?>, height: <?= (int) ($qrSize ?? 140) ?>, correctLevel: QRCode.CorrectLevel.M });
    }
    if (location.search.indexOf('autoprint=1') !== -1) {
        window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });
    }
})();
</script>
