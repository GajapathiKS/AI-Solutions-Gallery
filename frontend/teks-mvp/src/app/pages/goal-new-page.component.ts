import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ProgramService } from '../services/program.service';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-goal-new-page',
  imports: [ReactiveFormsModule, CommonModule],
  template: `
    <div class="card">
      <h2>New Goal</h2>
      <form [formGroup]="form" (ngSubmit)="submit()" class="form-grid">
        <label>
          Description
          <textarea formControlName="description" required></textarea>
          <span class="error" *ngIf="form.get('description')?.invalid && form.get('description')?.touched">
            Description is required
          </span>
        </label>
        <label>
          Category
          <input formControlName="category" required />
          <span class="error" *ngIf="form.get('category')?.invalid && form.get('category')?.touched">
            Category is required
          </span>
        </label>
        <label>
          Measurement
          <input formControlName="measurement" required />
          <span class="error" *ngIf="form.get('measurement')?.invalid && form.get('measurement')?.touched">
            Measurement is required
          </span>
        </label>
        <label>
          Owner
          <input formControlName="owner" required />
          <span class="error" *ngIf="form.get('owner')?.invalid && form.get('owner')?.touched">
            Owner is required
          </span>
        </label>
        <label>
          Target Date
          <input type="date" formControlName="targetDate" required />
          <span class="error" *ngIf="form.get('targetDate')?.invalid && form.get('targetDate')?.touched">
            Target Date is required
          </span>
        </label>
        <div style="display:flex; gap:.5rem;">
          <button class="btn primary" type="submit">Create</button>
          <button class="btn" type="button" (click)="cancel()">Cancel</button>
        </div>
        <p class="error" *ngIf="errorMsg">{{ errorMsg }}</p>
      </form>
    </div>
  `,
  styles: [`
    .error {
      color: #d32f2f;
      font-size: 0.875rem;
      margin-top: 0.25rem;
      display: block;
    }
  `]
})
export class GoalNewPageComponent {
  private fb = inject(FormBuilder);
  private api = inject(ProgramService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  studentId = this.route.parent?.snapshot.paramMap.get('id') ?? this.route.snapshot.paramMap.get('id')!;
  errorMsg: string | null = null;

  form = this.fb.nonNullable.group({
    description: ['', Validators.required],
    category: ['Academic', Validators.required],
    measurement: ['', Validators.required],
    owner: ['', Validators.required],
    targetDate: ['', Validators.required]
  });

  submit() {
    // Mark all fields as touched to show validation errors
    Object.keys(this.form.controls).forEach(key => {
      this.form.get(key)?.markAsTouched();
    });
    
    if (this.form.invalid) {
      this.errorMsg = 'Please fill in all required fields.';
      return;
    }
    
    this.errorMsg = null;
    const payload = { studentId: this.studentId, ...this.form.getRawValue() } as any;
    this.api.createGoal(payload).subscribe({
      next: () => this.router.navigate(['/students', this.studentId, 'goals']),
      error: () => this.errorMsg = 'Failed to create goal.'
    });
  }

  cancel() { this.router.navigate(['/students', this.studentId, 'goals']); }
}
