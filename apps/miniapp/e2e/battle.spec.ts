import { expect, test } from "@playwright/test";

test("development player completes a battle and keeps server progression after reload", async ({ page }) => {
  await page.goto("/");
  const progression = page.getByTestId("player-progression");
  await expect(progression).toBeVisible();
  const creditsBefore = Number((await progression.innerText()).match(/💳 (\d+)/)?.[1]);

  const character = page.locator("button").filter({ hasText: "七海Nana7mi" }).first();
  await expect(character).toBeVisible();
  await character.click();
  await page.getByRole("button", { name: /确认角色|Confirm character/ }).click();

  await expect(page.getByText(/回合|Turn/).first()).toBeVisible();
  for (let action = 0; action < 30; action += 1) {
    const rewardDialog = page.getByRole("dialog");
    if (await rewardDialog.isVisible().catch(() => false)) {
      break;
    }
    const attack = page.getByRole("button", { name: /轻击|Light Attack/ });
    await expect(attack).toBeEnabled();
    await attack.click();
    await expect(attack).toBeEnabled({ timeout: 10_000 }).catch(() => undefined);
  }

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
