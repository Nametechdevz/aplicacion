<?php

declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Validator;
use App\Models\AuditLog;
use App\Models\Page;

final class PageController extends AdminController
{
    public function index(): void
    {
        $this->render('pages/index', ['title' => 'Páginas', 'pages' => Page::all()], ['Páginas' => null]);
    }

    public function edit(string $id): void
    {
        $page = Page::find((int) $id) ?? abort(404);
        $this->render('pages/form', ['title' => $page['title'], 'page' => $page], ['Páginas' => 'admin/paginas', $page['title'] => null]);
    }

    public function update(string $id): void
    {
        Page::find((int) $id) ?? abort(404);
        $v = Validator::make($this->request->all(), [
            'title' => 'required|string|min:2|max:150',
            'content' => 'string|max:60000',
            'meta_description' => 'string|max:300',
            'is_active' => 'bool',
        ], ['title' => 'título', 'content' => 'contenido']);
        if ($v->fails()) {
            $this->failValidation($v->errors(), 'admin/paginas/' . $id . '/editar');
        }
        $data = $v->validated();
        Page::update((int) $id, [
            'title' => clean_text($data['title'], 150),
            'content' => str_replace("\r\n", "\n", trim((string) $data['content'])),
            'meta_description' => $data['meta_description'] ? clean_text($data['meta_description'], 300) : null,
            'is_active' => $data['is_active'],
        ]);
        AuditLog::record('page.update', 'page', (int) $id);
        $this->done('Página guardada.', 'admin/paginas');
    }
}
