import { test, expect } from '@playwright/test';
import { login } from './auth.util';

function uniqueStudentData() {
  const stamp = Date.now();
  return {
    localId: `ui_${stamp}`,
    firstName: `UI${stamp}`,
    lastName: `Student${stamp}`,
    dateOfBirth: '2012-02-15',
    gradeLevel: '5',
    campus: 'Central Elementary',
    guardianContact: 'guardian@example.com',
    programFocus: 'Reading Support',
    enrollmentDate: '2024-08-01',
    nextReviewDate: '2025-02-01'
  };
}

test.describe('Student onboarding via UI', () => {
  test('administrator can add a student from the students list', async ({ page }) => {
    await login(page);

    await page.goto('/students');
    await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();

    const data = uniqueStudentData();

    await page.getByLabel('Local ID').fill(data.localId);
    await page.getByLabel('First Name').fill(data.firstName);
    await page.getByLabel('Last Name').fill(data.lastName);
    await page.getByLabel('Date of Birth').fill(data.dateOfBirth);
    await page.getByLabel('Grade Level').fill(data.gradeLevel);
    await page.getByLabel('Campus').fill(data.campus);
    await page.getByLabel('Program Focus').fill(data.programFocus);
    await page.getByLabel('Guardian Contact').fill(data.guardianContact);
    await page.getByLabel('Enrollment Date').fill(data.enrollmentDate);
    await page.getByLabel('Next Review Date').fill(data.nextReviewDate);

    await expect(page.getByRole('button', { name: 'Add Student' })).toBeEnabled();
    await page.getByRole('button', { name: 'Add Student' }).click();

    const tableRow = page.getByRole('row', { name: new RegExp(data.localId, 'i') });
    await expect(tableRow).toBeVisible({ timeout: 15000 });

    const openLink = tableRow.getByRole('link', { name: 'Open' });
    await openLink.click();

    await expect(
      page.getByRole('heading', {
        level: 2,
        name: new RegExp(`${data.firstName} ${data.lastName}`, 'i')
      })
    ).toBeVisible();
  });
});
