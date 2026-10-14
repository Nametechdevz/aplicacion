<?php

declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Session;
use App\Models\AuditLog;
use App\Models\Setting;
use App\Services\UploadService;
use DomainException;

final class SettingsController extends AdminController
{
    /** Campos de texto editables: clave => [etiqueta, longitud máxima]. */
    private const TEXT_FIELDS = [
        'store_name' => 120, 'store_tagline' => 160, 'store_description' => 500, 'contact_phone' => 40,
        'store_address' => 255, 'business_hours' => 200, 'promo_bar_text' => 160, 'hero_eyebrow' => 60,
        'hero_title' => 120, 'hero_subtitle' => 300, 'hero_cta_text' => 40, 'shipping_info' => 1000,
        'payment_methods' => 1000, 'whatsapp_order_intro' => 200, 'benefits' => 1000,
    ];

    private const IMAGE_FIELDS = ['logo_path' => 'Logotipo', 'favicon_path' => 'Favicon', 'hero_image' => 'Imagen principal'];

    public function index(): void
    {
        $this->render('settings/index', ['title' => 'Configuración', 'settings' => Setting::all()], ['Configuración' => null]);
    }

    public function update(): void
    {
        $r = $this->request;
        $errors = [];
        $values = [];

        foreach (self::TEXT_FIELDS as $key => $max) {
            $value = str_replace("\r\n", "\n", trim((string) $r->input($key, '')));
            if (mb_strlen($value) > $max) {
                $errors[$key] = "Máximo $max caracteres.";
            }
            $values[$key] = $value;
        }
        if ($values['store_name'] === '') {
            $errors['store_name'] = 'El nombre de la tienda es obligatorio.';
        }

        $whatsapp = trim((string) $r->input('whatsapp_number', ''));
        if ($whatsapp !== '') {
            $normalized = normalize_whatsapp($whatsapp);
            if ($normalized === null) {
                $errors['whatsapp_number'] = 'Use el formato internacional sin espacios, por ejemplo 573001234567.';
            }
            $values['whatsapp_number'] = $normalized ?? '';
        } else {
            $values['whatsapp_number'] = '';
        }

        $email = trim((string) $r->input('contact_email', ''));
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['contact_email'] = 'Correo electrónico no válido.';
        }
        $values['contact_email'] = $email;

        foreach (['social_instagram', 'social_facebook', 'social_tiktok'] as $key) {
            $url = trim((string) $r->input($key, ''));
            if ($url !== '' && (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https://#i', $url))) {
                $errors[$key] = 'Ingrese la dirección completa que empiece por https://';
            }
            $values[$key] = $url;
        }

        $mode = (string) $r->input('shipping_mode', 'manual');
        $values['shipping_mode'] = in_array($mode, ['manual', 'flat'], true) ? $mode : 'manual';
        foreach (['shipping_flat_rate', 'free_shipping_threshold'] as $key) {
            $amount = parse_money($r->input($key, '0')) ?? 0;
            if ($amount < 0 || $amount > 99999999) {
                $errors[$key] = 'Valor no válido.';
            }
            $values[$key] = (string) (int) round($amount);
        }
        $low = filter_var($r->input('low_stock_default', '5'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => 100000]]);
        if ($low === false) {
            $errors['low_stock_default'] = 'Ingrese un número entero.';
        }
        $values['low_stock_default'] = (string) ($low === false ? 5 : $low);
        $values['promo_bar_enabled'] = $r->input('promo_bar_enabled') ? '1' : '0';
        $values['currency'] = 'COP';

        if ($errors) {
            Session::flashInput($r->all(), $errors);
            $this->done('Revise los campos marcados.', 'admin/configuracion', 'error');
        }

        $old = Setting::all();
        foreach (self::IMAGE_FIELDS as $key => $label) {
            $file = $r->file($key);
            if ($file) {
                try {
                    $values[$key] = UploadService::storeImage($file, 'settings');
                    UploadService::delete($old[$key] ?? null);
                } catch (DomainException $e) {
                    flash('error', "$label: " . $e->getMessage());
                }
            } elseif ($r->input('remove_' . $key) === '1') {
                UploadService::delete($old[$key] ?? null);
                $values[$key] = '';
            }
        }

        Setting::setMany($values);
        AuditLog::record('settings.update', 'settings', null, ['keys' => array_keys(array_diff_assoc($values, $old))]);
        $this->done('Configuración guardada.', 'admin/configuracion');
    }
}
