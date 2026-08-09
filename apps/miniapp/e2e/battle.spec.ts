import { expect, test } from "@playwright/test";

const waitForAction = async (page: import("@playwright/test").Page, name: RegExp): Promise<void> => {
  const action = page.getByRole("button", { name });
  const actionBarReady = page.locator('button[data-kind="lightAttack"]');
  await expect(action).toBeEnabled();
  await action.click();
  await expect
    .poll(
      async () =>
        (await actionBarReady.isEnabled().catch(() => false)) ||
        (await page
          .getByRole("dialog")
          .isVisible()
          .catch(() => false)),
      { timeout: 10_000 }
    )
    .toBe(true);
};

const selectLulu = async (page: import("@playwright/test").Page): Promise<void> => {
  const character = page.locator("button").filter({ hasText: "lulu" }).first();
  await expect(character).toBeVisible();
  await character.click();
  await page.getByRole("button", { name: /确认角色|Confirm character/ }).click();
  await expect(page.getByText(/回合|Turn/).first()).toBeVisible();
};

const finishWithLightAttacks = async (page: import("@playwright/test").Page): Promise<void> => {
  for (let action = 0; action < 30; action += 1) {
    if (
      await page
        .getByRole("dialog")
        .isVisible()
        .catch(() => false)
    ) {
      return;
    }
    await waitForAction(page, /轻击|Light Attack/);
  }
};

test("development player exercises every action and keeps server progression after reload", async ({ page }) => {
  await page.goto("/");
  const progression = page.getByTestId("player-progression");
  await expect(progression).toBeVisible();
  const creditsBefore = Number((await progression.innerText()).match(/💳 (\d+)/)?.[1]);

  await selectLulu(page);
  await waitForAction(page, /格挡|Block/);
  await waitForAction(page, /反击|Counter/);
  await waitForAction(page, /重击|Heavy Attack/);
  await finishWithLightAttacks(page);

  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /继续|Continue|返回|Return/ }).click();
  await expect(progression).toBeVisible();

  await selectLulu(page);

  const special = page.getByRole("button", { name: /必杀技|Special/ });
  for (let action = 0; action < 6 && (await special.isDisabled()); action += 1) {
    await waitForAction(page, /轻击|Light Attack/);
  }
  await expect(special).toBeEnabled();
  await waitForAction(page, /必杀技|Special/);
  await finishWithLightAttacks(page);

  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /继续|Continue|返回|Return/ }).click();
  await expect(progression).toBeVisible();
  const persistedProgression = await progression.textContent();
  if (persistedProgression === null) {
    throw new Error("player progression is missing");
  }
  const creditsAfter = Number(persistedProgression.match(/💳 (\d+)/)?.[1]);
  expect(creditsAfter).toBeGreaterThan(creditsBefore);

  await page.reload();
  await expect(progression).toHaveText(persistedProgression);
});

test("character selection remains usable at a 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /选择你的角色|Choose Your Character/ })).toBeVisible();
  const character = page.locator("button").filter({ hasText: "七海Nana7mi" }).first();
  await character.click();
  await expect(page.getByRole("button", { name: /确认角色|Confirm character/ })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
