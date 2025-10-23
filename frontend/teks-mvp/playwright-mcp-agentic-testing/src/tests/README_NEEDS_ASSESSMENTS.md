# Needs Assessments Test Cases

This directory contains comprehensive end-to-end test cases for the Needs Assessments functionality in the TEKS MVP application.

## Test Files Overview

### 1. **create_needs_assessment_stu702.txt**
**Purpose**: Create and verify a needs assessment for student STU702 (James Chen)  
**Focus Area**: Reading comprehension and phonics support  
**Test Flow**:
- Navigate to students list
- Find and open STU702 student record
- Navigate to Needs Assessments section
- Create new needs assessment with comprehensive reading support details
- Verify successful creation and data display

**Key Validations**:
- Success message displayed
- Redirect to list page
- Data correctly saved and displayed
- Created date shows current date

---

### 2. **create_needs_assessment_stu701.txt**
**Purpose**: Create and verify a needs assessment for student STU701 (Maria Rodriguez)  
**Focus Area**: Advanced mathematics enrichment  
**Test Flow**:
- Navigate to students list
- Find and open STU701 student record
- Access Needs Assessments section
- Create new needs assessment for gifted math student
- Verify successful creation and complete data display

**Key Validations**:
- Success message appears
- All field values correctly displayed in table
- Proper redirect after submission
- Created date present

---

### 3. **create_needs_assessment_stu700.txt**
**Purpose**: Create and verify a needs assessment for student STU700 (TestStudent Automation)  
**Focus Area**: Reading fluency and stamina  
**Test Flow**:
- Navigate to students list
- Find and open STU700 student record
- Access Needs Assessments section
- Create new needs assessment with reading fluency interventions
- Verify successful creation and data persistence

**Key Validations**:
- Success message displayed
- Complete needs assessment visible in list
- All data fields correctly saved
- Created date displayed

---

### 4. **cancel_needs_assessment_creation.txt**
**Purpose**: Test cancel functionality and verify no data is saved  
**Test Flow**:
- Navigate to STU702 student record
- Open Needs Assessments section
- Note current assessment count
- Click "+ New Needs Assessment"
- Partially fill form with test data
- Click Cancel button
- Verify no new assessment created

**Key Validations**:
- Redirect to list page occurs
- Assessment count unchanged
- No test data appears in list
- Existing assessments remain unchanged

---

### 5. **validate_needs_assessment_form.txt**
**Purpose**: Test form validation rules and required fields  
**Test Flow**:
- Navigate to STU702 student record
- Open New Needs Assessment form
- Test empty form (Create button disabled)
- Test partial completion (button still disabled)
- Test complete form (button becomes enabled)
- Cancel without saving

**Key Validations**:
- Create button disabled with empty fields
- Create button disabled with partial data
- Create button enabled only when all 4 required fields filled
- Cancel works correctly
- No test data saved

**Required Fields**:
1. Academic Needs
2. Support Services
3. Instructional Strategies
4. Assessment Tools

---

## How to Run Tests

### Using DOM-Intelligent Agent (Recommended)

```powershell
# Navigate to test directory
cd c:\MCP_POCS\AIProjects\frontend\teks-mvp\playwright-mcp-agentic-testing

# Run individual tests
node dist/cli-dom.js src/tests/create_needs_assessment_stu702.txt --env dev --url http://localhost:4200/students

node dist/cli-dom.js src/tests/create_needs_assessment_stu701.txt --env dev --url http://localhost:4200/students

node dist/cli-dom.js src/tests/create_needs_assessment_stu700.txt --env dev --url http://localhost:4200/students

node dist/cli-dom.js src/tests/cancel_needs_assessment_creation.txt --env dev --url http://localhost:4200/students

node dist/cli-dom.js src/tests/validate_needs_assessment_form.txt --env dev --url http://localhost:4200/students
```

### Run All Tests Sequentially

```powershell
# Run all needs assessment tests
foreach ($test in @(
    "create_needs_assessment_stu702.txt",
    "create_needs_assessment_stu701.txt", 
    "create_needs_assessment_stu700.txt",
    "cancel_needs_assessment_creation.txt",
    "validate_needs_assessment_form.txt"
)) {
    Write-Host "Running test: $test" -ForegroundColor Cyan
    node dist/cli-dom.js "src/tests/$test" --env dev --url http://localhost:4200/students
    Write-Host ""
}
```

---

## Test Coverage

### Functional Coverage
- ✅ Create new needs assessment with all required fields
- ✅ View needs assessments list
- ✅ Success message display
- ✅ Data persistence and display
- ✅ Cancel functionality
- ✅ Form validation (required fields)
- ✅ Button state management (enabled/disabled)
- ✅ Navigation flow (list → form → list)

### Test Data Variety
- **STU702**: Reading intervention focus
- **STU701**: Gifted/advanced student support
- **STU700**: Reading fluency support

### Edge Cases
- Empty form submission prevention
- Partial form completion validation
- Cancel without saving
- Multiple assessments per student

---

## Prerequisites

1. **Backend API**: Running at `https://localhost:7140`
2. **Frontend App**: Running at `http://localhost:4200`
3. **Test Students**: STU700, STU701, STU702 must exist in database
4. **Environment**: Development environment configured

---

## Expected Results

All tests should:
1. Complete without errors
2. Generate screenshots in reports directory
3. Create/verify data in backend database
4. Properly handle Angular reactive forms
5. Validate all form interactions

---

## Notes

- Tests use DOM-intelligent agent pattern to work with Angular reactive forms
- Each test includes complete navigation flow from students list
- Tests verify both UI feedback and data persistence
- Screenshots captured at key verification points
- All tests are idempotent (can be run multiple times)

---

## Related URLs

- **Students List**: http://localhost:4200/students
- **Student Detail**: http://localhost:4200/students/{studentId}
- **Needs Assessments List**: http://localhost:4200/students/{studentId}/needs
- **New Needs Assessment**: http://localhost:4200/students/{studentId}/needs/new

---

## API Endpoints Used

- `GET /api/needsassessments/student/{studentId}` - Get needs assessments
- `POST /api/needsassessments` - Create needs assessment
- `GET /api/students` - Get students list
- `GET /api/students/{id}` - Get student details
