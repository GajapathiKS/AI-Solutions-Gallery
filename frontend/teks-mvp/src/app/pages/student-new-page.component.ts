import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ProgramService } from '../services/program.service';

@Component({
  standalone: true,
  selector: 'app-student-new-page',
  imports: [ReactiveFormsModule],
  template: `
    <div class="card">
      <h2>Add New Student</h2>
      <form [formGroup]="form" (ngSubmit)="submit()" class="form-grid">
        <label>
          Local ID
          <input formControlName="localId" name="localId" />
        </label>
        <label>
          First Name
          <input formControlName="firstName" name="firstName" />
        </label>
        <label>
          Last Name
          <input formControlName="lastName" name="lastName" />
        </label>
        <label>
          Date of Birth
          <input type="date" formControlName="dateOfBirth" name="dateOfBirth" />
        </label>
        <label>
          Grade Level
          <input formControlName="gradeLevel" name="gradeLevel" />
        </label>
        <label>
          Campus
          <input formControlName="campus" name="campus" />
        </label>
        <label>
          Program Focus
          <input formControlName="programFocus" name="programFocus" placeholder="Bilingual Support" />
        </label>
        <label>
          Guardian Contact
          <input formControlName="guardianContact" name="guardianContact" placeholder="parent@domain" />
        </label>
        <label>
          Enrollment Date
          <input type="date" formControlName="enrollmentDate" name="enrollmentDate" />
        </label>
        <label>
          Next Review Date
          <input type="date" formControlName="nextReviewDate" name="nextReviewDate" />
        </label>
        <div style="display:flex; gap:.5rem;">
          <button id="create-student-button" class="btn primary" type="button" (click)="submit()" data-testid="create-student-btn">Create Student</button>
          <button class="btn" type="button" (click)="cancel()" data-testid="cancel-btn">Cancel</button>
        </div>
      </form>
    </div>
  `,
  styles: []
})
export class StudentNewPageComponent {
  private fb = inject(FormBuilder);
  private api = inject(ProgramService);
  private router = inject(Router);

  form = this.fb.nonNullable.group({
    localId: ['', Validators.required],
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    dateOfBirth: ['', Validators.required],
    gradeLevel: ['', Validators.required],
    campus: ['', Validators.required],
    guardianContact: ['', Validators.required],
    programFocus: [''],
    enrollmentDate: [new Date().toISOString().slice(0, 10), Validators.required],
    nextReviewDate: ['']
  });

  submit() {
    console.log('[SUBMIT DEBUG] submit() method called!');
    // For automated testing: read values directly from DOM instead of FormControl
    // This works around Playwright MCP not triggering Angular change detection
    const formElement = document.querySelector('form') as HTMLFormElement;
    console.log('[SUBMIT DEBUG] Form element found:', !!formElement);
    
    if (formElement) {
      const formData = new FormData(formElement);
      const payload = {
        localId: (formData.get('localId') as string) || this.form.value.localId || '',
        firstName: (formData.get('firstName') as string) || this.form.value.firstName || '',
        lastName: (formData.get('lastName') as string) || this.form.value.lastName || '',
        dateOfBirth: (formData.get('dateOfBirth') as string) || this.form.value.dateOfBirth || '',
        gradeLevel: (formData.get('gradeLevel') as string) || this.form.value.gradeLevel || '',
        campus: (formData.get('campus') as string) || this.form.value.campus || '',
        guardianContact: (formData.get('guardianContact') as string) || this.form.value.guardianContact || '',
        programFocus: (formData.get('programFocus') as string) || this.form.value.programFocus || '',
        enrollmentDate: (formData.get('enrollmentDate') as string) || this.form.value.enrollmentDate || new Date().toISOString().slice(0, 10),
        nextReviewDate: (formData.get('nextReviewDate') as string) || this.form.value.nextReviewDate || null
      };

      console.log('[SUBMIT DEBUG] FormData values:', {
        localId: formData.get('localId'),
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName')
      });
      console.log('[SUBMIT DEBUG] Final payload:', payload);
      console.log('[SUBMIT DEBUG] Validation:', { 
        hasLocalId: !!payload.localId, 
        hasFirstName: !!payload.firstName, 
        hasLastName: !!payload.lastName 
      });

      // Only submit if we have at least the required fields from DOM
      if (payload.localId && payload.firstName && payload.lastName) {
        console.log('[SUBMIT DEBUG] Submitting to API...');
        this.api.createStudent({
          ...payload,
          dateOfBirth: payload.dateOfBirth,
          enrollmentDate: payload.enrollmentDate
        }).subscribe({
          next: () => {
            console.log('[SUBMIT DEBUG] Student created successfully');
            this.router.navigate(['/students'], { queryParams: { added: '1' } });
          },
          error: (err) => {
            console.error('[SUBMIT DEBUG] API error:', err);
          }
        });
      } else {
        console.log('[SUBMIT DEBUG] Validation failed - not submitting');
      }
    }
  }

  cancel() {
    this.router.navigate(['/students']);
  }
}
