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
          <input formControlName="localId" />
        </label>
        <label>
          First Name
          <input formControlName="firstName" />
        </label>
        <label>
          Last Name
          <input formControlName="lastName" />
        </label>
        <label>
          Date of Birth
          <input type="date" formControlName="dateOfBirth" />
        </label>
        <label>
          Grade Level
          <input formControlName="gradeLevel" />
        </label>
        <label>
          Campus
          <input formControlName="campus" />
        </label>
        <label>
          Program Focus
          <input formControlName="programFocus" placeholder="Bilingual Support" />
        </label>
        <label>
          Guardian Contact
          <input formControlName="guardianContact" placeholder="parent@domain" />
        </label>
        <label>
          Enrollment Date
          <input type="date" formControlName="enrollmentDate" />
        </label>
        <label>
          Next Review Date
          <input type="date" formControlName="nextReviewDate" />
        </label>
        <div style="display:flex; gap:.5rem;">
          <button class="btn primary" type="submit" [disabled]="form.invalid || form.pending">Create Student</button>
          <button class="btn" type="button" (click)="cancel()">Cancel</button>
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
    if (this.form.invalid) {
      return;
    }
    const payload = {
      ...this.form.getRawValue(),
      nextReviewDate: this.form.value.nextReviewDate || null
    };
    this.api.createStudent({
      ...payload,
      dateOfBirth: payload.dateOfBirth,
      enrollmentDate: payload.enrollmentDate
    }).subscribe(() => {
      this.router.navigate(['/students']);
    });
  }

  cancel() {
    this.router.navigate(['/students']);
  }
}
