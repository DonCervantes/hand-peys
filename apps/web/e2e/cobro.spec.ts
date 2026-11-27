import { expect, test } from "@playwright/test";

// Flujo completo en modo demo: landing → entrar → registro → KYC (mock) → crear link → pagar → ver cobro.
test("un changarro cobra $350 con un link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Cobra con un link/ })).toBeVisible();

  await page.getByRole("link", { name: "Entrar" }).first().click();
  await page.getByPlaceholder("Tu nombre").fill("Lupe");
  await page.getByPlaceholder("tu@correo.com").fill("lupe@example.com");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/app\/registro/, { timeout: 15_000 });

  await page.getByPlaceholder("Tamales Doña Lupe").fill("Tamales E2E");
  await page.getByPlaceholder("Coyoacán, CDMX").fill("Coyoacán");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("button", { name: /Verificar mi identidad/ }).click();
  await page.getByRole("button", { name: "Usar INE de ejemplo" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Usar selfie de ejemplo" }).click();
  await page.getByRole("button", { name: /Verificar mi identidad/ }).click();
  await expect(page.getByText(/Comercio verificado/)).toBeVisible({ timeout: 20_000 });

  await page.goto("/app/cobrar");
  await page.getByPlaceholder("350").fill("350");
  await page.getByPlaceholder("10 tamales verdes").fill("10 tamales");
  await page.getByRole("button", { name: "Crear link de cobro" }).click();
  await expect(page).toHaveURL(/\/app\/links\/[0-9a-f]{32}/);
  const id = page.url().split("/").pop()!;

  await page.goto(`/p/${id}`);
  await page.getByRole("button", { name: /Pagar \$350\.00 MXN/ }).click();
  await expect(page.getByText("¡Pago completado!")).toBeVisible();

  await page.goto("/app");
  await expect(page.getByText("$346.85 MXN")).toBeVisible();
  await expect(page.getByText("comisión $3.15 MXN")).toBeVisible();
});
