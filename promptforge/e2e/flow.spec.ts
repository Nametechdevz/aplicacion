import { expect, test, type Page } from '@playwright/test';

const password = 'ForjaSegura2026';

async function register(page: Page, email: string) {
  await page.goto('/register');
  await page.fill('#name', 'Persona E2E');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await expect(page).toHaveURL('/');
}

test('flujo principal: idea → tipo → preguntas → prompt → guardar → biblioteca', async ({ page }, info) => {
  await register(page, `e2e-${info.project.name}-${Date.now()}@example.com`);

  await page.fill('input[aria-label="Describe tu proyecto"]', 'Quiero una tienda online de ropa deportiva con WooCommerce, pagos online, inventario, cupones, usuarios, dashboard administrativo y diseño premium.');
  await page.click('button:has-text("Forjar prompt")');
  await expect(page.getByText('Detectado', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /WooCommerce.*Tienda online sobre WordPress/ })).toHaveAttribute('aria-pressed', 'true');

  await page.click('button:has-text("Continuar")');
  await page.fill('#q-name', 'Pulse Sportswear');
  await page.getByRole('button', { name: 'Generar prompt' }).first().click();

  await expect(page.getByText('Prompt Quality Score')).toBeVisible();
  await expect(page.locator('#quality-title + p')).toContainText('/100');
  const editor = page.locator('textarea[aria-label^="Prompt versión"]');
  await expect(editor).toHaveValue(/## FUNCIONALIDADES/);
  await expect(editor).toHaveValue(/PROMPT MAESTRO — Pulse Sportswear/);

  // Cambiar de versión y simplificar
  await page.getByRole('tab', { name: /QUICK/ }).click();
  await expect(editor).toHaveValue(/Versión QUICK/);
  await page.getByRole('tab', { name: /MASTER/ }).click();
  await page.getByRole('button', { name: 'Simplificar' }).click();
  await expect(page.getByText('Cambios aplicados')).toBeVisible();
  await page.getByRole('button', { name: 'Deshacer' }).first().click();

  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page).toHaveURL(/\/prompts\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();

  await page.goto('/prompts');
  await expect(page.getByRole('heading', { name: 'Pulse Sportswear' })).toBeVisible();
  await page.fill('input[aria-label="Buscar prompts"]', 'no-existe-xyz');
  await expect(page.getByText('Sin resultados')).toBeVisible();

  // Sin scroll horizontal en ninguna vista
  for (const url of ['/', '/prompts', '/templates', '/settings', '/new']) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, url).toBe(false);
  }
});

test('las rutas privadas redirigen al login', async ({ page }) => {
  await page.goto('/prompts');
  await expect(page).toHaveURL(/\/login$/);
});
