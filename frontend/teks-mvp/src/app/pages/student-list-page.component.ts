import { AsyncPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProgramService } from '../services/program.service';
import { StudentSummary } from '../models/student';

@Component({
  standalone: true,
  selector: 'app-student-list-page',
  imports: [NgFor, NgIf, AsyncPipe, RouterLink, DatePipe],
  template: `
    <div class="card">
      <div style="display:flex; align-items:center; justify-content: space-between;">
        <h2 data-testid="students-heading">Students</h2>
        <a class="btn primary" routerLink="/students/new" data-testid="add-student-btn">+ Add Student</a>
      </div>
    </div>

    <div class="card">
      <h3>Active Students</h3>
      <div *ngIf="students | async as items; else loading">
        <p *ngIf="!items.length">No students enrolled yet.</p>
        <table class="table" *ngIf="items.length">
          <thead>
            <tr>
              <th>Local ID</th>
              <th>Name</th>
              <th>Grade</th>
              <th>Campus</th>
              <th>Program</th>
              <th>Active Goals</th>
              <th>Next Review</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let student of items">
              <td>{{ student.localId }}</td>
              <td>{{ student.firstName }} {{ student.lastName }}</td>
              <td>{{ student.gradeLevel }}</td>
              <td>{{ student.campus }}</td>
              <td>{{ student.programFocus }}</td>
              <td>{{ student.activeGoals }}</td>
              <td>{{ student.nextReviewDate | date:'M/d/yyyy' || 'TBD' }}</td>
              <td><a class="btn" [routerLink]="['/students', student.id]">Open</a></td>
            </tr>
          </tbody>
        </table>
      </div>
      <ng-template #loading>
        <p>Loading students…</p>
      </ng-template>
    </div>
  `,
  styles: []
})
export class StudentListPageComponent {
  private api = inject(ProgramService);
  students = this.api.getStudents();
}
