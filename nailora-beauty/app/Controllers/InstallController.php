<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Controller;
use App\Core\ErrorHandler;
use App\Core\Session;
use App\Core\Validator;
use App\Models\Setting;
use App\Models\User;
use App\Services\InstallService;

/**
 * Instalador web protegido:
 *  - solo funciona si INSTALL_TOKEN (16+ caracteres) está definido en .env;
 *  - exige escribir ese token en el formulario;
 *  - se bloquea para siempre al crear storage/installed.lock;
 *  - nunca sobrescribe administradores existentes.
 */
final class InstallController extends Controller
{
    private function guard(): void
    {
        if (InstallService::isInstalled()) {
            abort(404);
        }
        if (mb_strlen((string) config('app.install_token')) < 16) {
            abort(403, 'El instalador está desactivado. Defina INSTALL_TOKEN (mínimo 16 caracteres) en el archivo .env para habilitarlo temporalmente.');
        }
        header('X-Robots-Tag: noindex, nofollow');
    }

    public function show(): void
    {
        $this->guard();
        $this->view('install/index', [
            'pageTitle' => 'Instalación de Nailora Beauty',
            'requirements' => InstallService::requirements(),
            'db' => InstallService::databaseStatus(),
        ], 'layouts/minimal');
    }

    public function store(): void
    {
        $this->guard();
        $r = $this->request;
        if (!hash_equals((string) config('app.install_token'), (string) $r->input('install_token', ''))) {
            sleep(1);
            Session::flashInput($r->all());
            flash('error', 'El token de instalación no es correcto.');
            redirect('instalar');
        }

        $db = InstallService::databaseStatus();
        if (!$db['connected']) {
            flash('error', $db['error']);
            redirect('instalar');
        }

        $needsAdmin = !$db['has_schema'] || $db['admins'] === 0;
        $v = Validator::make($r->all(), $needsAdmin ? [
            'name' => 'required|string|min:2|max:120',
            'email' => 'required|email|max:190',
            'password' => 'required|string',
        ] : [], ['name' => 'nombre', 'email' => 'correo', 'password' => 'contraseña']);
        if ($needsAdmin) {
            $policy = User::passwordPolicyError((string) $r->input('password', ''));
            if ($policy) {
                $v->addError('password', $policy);
            }
            if ((string) $r->input('password') !== (string) $r->input('password_confirmation')) {
                $v->addError('password_confirmation', 'Las contraseñas no coinciden.');
            }
        }
        if ($v->fails()) {
            $this->failValidation($v->errors(), 'instalar');
        }

        try {
            if (!$db['has_schema']) {
                InstallService::importFile(BASE_PATH . '/database/schema.sql');
            }
            if ($r->input('load_demo') === '1') {
                InstallService::importFile(BASE_PATH . '/database/seed.sql');
            }
            if (User::count() === 0) {
                User::create(clean_text($r->input('name'), 120), (string) $r->input('email'), (string) $r->input('password'));
            }
            $whatsapp = normalize_whatsapp((string) $r->input('whatsapp_number', ''));
            if ($whatsapp) {
                Setting::setMany(['whatsapp_number' => $whatsapp]);
            }
            InstallService::writeLock();
        } catch (\Throwable $e) {
            ErrorHandler::log('Fallo en la instalación: ' . $e->getMessage());
            flash('error', 'La instalación no pudo completarse. Revise storage/logs para ver el detalle técnico.');
            redirect('instalar');
        }

        flash('success', 'Instalación completada. Elimine INSTALL_TOKEN del archivo .env e inicie sesión.');
        redirect('admin/login');
    }
}
