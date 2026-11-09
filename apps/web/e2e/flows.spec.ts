import { expect, test, type Page } from '@playwright/test';

/** Blocks the "open Airbnb" popup target so tests never hit the network. */
test.beforeEach(async ({ context }) => {
  await context.route(/airbnb\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Airbnb (stub)</title>' }));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

async function login(page: Page, email = 'carla@exemplo.com.br') {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Receber código' }).click();
  await expect(page.getByRole('heading', { name: 'Digite o código' })).toBeVisible();
  await page.getByLabel('Dígito 1 de 6').fill('123456');
  await page.waitForURL(/\/app$/);
}

test('protects /app routes and redirects to login', async ({ page }) => {
  await page.goto('/app/calendario');
  await page.waitForURL(/\/entrar\?next=%2Fapp%2Fcalendario/);
  await expect(page.getByRole('heading', { name: 'Entrar na Precisari' })).toBeVisible();
});

test('rejects an invalid code and accepts any 6 digits', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('carla@exemplo.com.br');
  await page.getByRole('button', { name: 'Receber código' }).click();
  await page.getByLabel('Dígito 1 de 6').fill('000000');
  await expect(page.locator('#otp-error')).toContainText('Código inválido');
  await page.getByLabel('Dígito 1 de 6').fill('654321');
  await page.waitForURL(/\/app$/);
});

test('login → Hoje: approve (copy + open Airbnb), undo, and dismiss with keyboard', async ({ page, context }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: /Bom (dia|tarde|noite), Carla\./ }).or(page.getByRole('heading', { name: /Boa (tarde|noite), Carla\./ }))).toBeVisible();
  const gain = page.getByTestId('potential-gain');
  await expect(gain).toHaveText('+R$ 280');
  await expect(page.getByText('1 de 3')).toBeVisible();

  const card = page.getByTestId('action-card');
  await expect(card.getByRole('heading', { name: 'Sábado tá disputado.' })).toBeVisible();

  const popup = context.waitForEvent('page');
  await card.getByRole('button', { name: 'Revisar e copiar preço' }).click();
  await (await popup).close();
  await expect(page.getByTestId('toast')).toContainText('Preço R$ 349 copiado');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('349');
  await expect(gain).toHaveText('+R$ 180');
  await expect(page.getByText('1 de 2')).toBeVisible();

  // Undo puts the suggestion back.
  await page.getByTestId('toast').getByRole('button', { name: 'Desfazer' }).click();
  await expect(gain).toHaveText('+R$ 280');

  // Keyboard: ← dismisses the top card.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('toast')).toContainText('Sugestão ignorada');
  await expect(page.getByText('1 de 2')).toBeVisible();
});

test('onboarding: iCal → address → type → prices → notifications → 90-day wow', async ({ page }) => {
  await login(page);
  await page.goto('/app/imoveis/novo');
  await expect(page.getByText('Passo 1 de 5')).toBeVisible();

  // Step 1: invalid link is rejected, then a valid iCal link.
  await page.getByLabel('Link do calendário (iCal)').fill('https://example.com/nao-e-ical');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Esse link não parece um calendário iCal')).toBeVisible();
  await page.getByLabel('Link do calendário (iCal)').fill('https://www.airbnb.com.br/calendar/ical/123456.ics?s=abc');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Step 2: address autocomplete + confirmation.
  await expect(page.getByText('Passo 2 de 5')).toBeVisible();
  await page.getByRole('combobox', { name: 'Endereço' }).fill('Rua Coberta Gramado');
  await page.getByRole('option', { name: /Rua Coberta, 45/ }).click();
  await expect(page.getByRole('heading', { name: 'Confirme no mapa' })).toBeVisible();
  await page.getByLabel('Como você chama esse imóvel?').fill('Chalé da Serra');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Step 3: destination type pre-filled from the address (Gramado → Serra).
  await expect(page.getByText('Passo 3 de 5')).toBeVisible();
  await expect(page.getByRole('radio', { name: /Serra/ })).toBeChecked();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Step 4: prices and costs (min must be ≤ base).
  await expect(page.getByText('Passo 4 de 5')).toBeVisible();
  await page.getByLabel('Preço atual por noite (base)').fill('300');
  await page.getByLabel('Preço mínimo aceitável').fill('400');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('O mínimo precisa ser menor ou igual à base.')).toBeVisible();
  await page.getByLabel('Preço mínimo aceitável').fill('220');
  await page.getByLabel('Taxa de faxina').fill('120');
  await page.getByRole('button', { name: 'Aumentar: Capacidade (hóspedes)' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Step 5: notifications (push lives on mobile; weekly e-mail toggle here).
  await expect(page.getByText('Passo 5 de 5')).toBeVisible();
  await page.getByRole('switch', { name: 'Resumo semanal por e-mail' }).click();
  await page.getByRole('button', { name: 'Ver meu calendário' }).click();

  // Wow moment: 90-day heat map + potential gain.
  await expect(page.getByTestId('onboarding-wow')).toBeVisible();
  await expect(page.getByTestId('wow-gain')).toHaveText(/^\+R\$ [\d.]+$/);
  await expect(page.getByRole('table').first()).toBeVisible();

  await page.getByRole('link', { name: 'Ver calendário completo' }).click();
  await expect(page.getByRole('button', { name: /Imóvel: Chalé da Serra/ })).toBeVisible();
});

test('calendar: select a night and see the detail panel', async ({ page }) => {
  await login(page);
  await page.goto('/app/calendario');
  const panel = page.getByTestId('night-panel');
  await expect(panel.getByText('Dentro do seu limite')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Copiar preço e abrir Airbnb' })).toBeVisible();
  const booked = page.getByRole('button', { name: /: reservado$/ }).first();
  await booked.click();
  await expect(panel.getByRole('heading', { name: 'Noite reservada' })).toBeVisible();
});

test('/assinar?plano=pro opens checkout with Pro selected', async ({ page }) => {
  await login(page);
  await page.goto('/assinar?plano=pro');
  await page.waitForURL(/\/checkout\?plano=pro/);
  await expect(page.getByRole('radio', { name: /Pro/ })).toBeChecked();
  await expect(page.getByTestId('checkout-total')).toHaveText('R$ 29,90');
});

test('no horizontal scroll at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const check = async (path: string) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  };
  await check('/');
  await check('/entrar');
  await login(page);
  for (const p of ['/app', '/app/calendario', '/app/resultados', '/app/imoveis', '/app/imoveis/novo', '/app/imoveis/prop_campeche', '/app/conta', '/checkout']) {
    await check(p);
  }
});
