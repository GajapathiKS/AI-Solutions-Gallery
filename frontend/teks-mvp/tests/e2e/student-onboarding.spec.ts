import { test, expect, Page } from '@playwright/test';
import { login } from './auth.util';

const TODAY = new Date();
const FORMAT_DATE = (date: Date) => date.toISOString().slice(0, 10);

async function fillStudentForm(page: Page, data: {
  localId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gradeLevel: string;
  campus: string;
  guardianContact: string;
  programFocus?: string;
  enrollmentDate: string;
  nextReviewDate?: string | null;
}) {
  await page.getByLabel('Local ID').fill(data.localId);
  await page.getByLabel('First Name').fill(data.firstName);
  await page.getByLabel('Last Name').fill(data.lastName);
  await page.getByLabel('Date of Birth').fill(data.dateOfBirth);
  await page.getByLabel('Grade Level').fill(data.gradeLevel);
  await page.getByLabel('Campus').fill(data.campus);
  await page.getByLabel('Guardian Contact').fill(data.guardianContact);

  if (data.programFocus) {
    await page.getByLabel('Program Focus').fill(data.programFocus);
  }

  await page.getByLabel('Enrollment Date').fill(data.enrollmentDate);

  if (data.nextReviewDate) {
    await page.getByLabel('Next Review Date').fill(data.nextReviewDate);
  }
}

test.describe('Student onboarding form', () => {
  test('educator can add a new student and review details', async ({ page }) => {
    await login(page);

    await page.goto('/students');
    await page.waitForLoadState('networkidle');

    const stamp = Date.now();
    const student = {
      localId: `pw-${stamp}`,
      firstName: 'Playwright',
      lastName: 'Student',
      dateOfBirth: '2012-03-14',
      gradeLevel: '5',
      campus: 'Pecan Grove Elementary',
      guardianContact: 'guardian@example.com',
      programFocus: 'STEM Enrichment',
      enrollmentDate: FORMAT_DATE(TODAY),
      nextReviewDate: FORMAT_DATE(new Date(TODAY.getTime() + 1000 * 60 * 60 * 24 * 30))
    } as const;

    await fillStudentForm(page, student);

    const submitButton = page.getByRole('button', { name: 'Add Student' });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    const localIdCell = page.getByRole('cell', { name: student.localId, exact: true });
    await expect(localIdCell).toBeVisible({ timeout: 15000 });

    const tableRow = localIdCell.locator('xpath=ancestor::tr');
    await tableRow.getByRole('link', { name: 'Open' }).click();

    await expect(page).toHaveURL(/\/students\/.+/);
    await expect(page.getByRole('heading', { level: 2, name: `${student.firstName} ${student.lastName}` })).toBeVisible();
    await expect(page.getByText('Local ID', { exact: true }).locator('xpath=..')).toContainText(student.localId);
    await expect(page.getByText('Program Focus', { exact: true }).locator('xpath=..')).toContainText(student.programFocus);
  });
});
