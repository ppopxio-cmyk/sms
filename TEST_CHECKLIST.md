# Teacher Features Test Checklist

## Phase 3c — Teacher Attendance (Enhanced)

### Grid View
- [ ] Click "Grid" button switches from list to grid view
- [ ] Grid shows students as rows, recent sessions as columns
- [ ] Each cell shows color-coded status (green=present, red=absent, amber=late, blue=excused)
- [ ] Clicking a cell toggles status for that student

### Fast Marking
- [ ] "All present" button marks all students as present
- [ ] "All except excused" button marks everyone present except selected excused
- [ ] "All absent" button marks all students as absent
- [ ] Status toggle works correctly when clicking individual cells

### Skip Days Logic
- [ ] Selecting Saturday/Sunday for regular program shows skip warning
- [ ] Selecting Monday-Friday for extension program shows skip warning
- [ ] Warning message correctly identifies the delivery stream type

### History View
- [ ] Opening history modal works
- [ ] Switching between "Monthly" and "Yearly" view works
- [ ] Month selector works when in monthly view
- [ ] History table shows date (Ethiopian), period, present/absent/late counts, rate, status
- [ ] Export from history modal works

### Export
- [ ] Export menu shows in attendance mark page
- [ ] Exporting PDF/Word/Excel works with correct filters

---

## Phase 3d — Teacher Assessments (Enhanced)

### Secret Code Display
- [ ] Published assessments show secret code in table
- [ ] Eye/EyeOff icon toggles code visibility
- [ ] Copy icon copies code to clipboard with toast confirmation
- [ ] Newly created assessments have secret codes generated

### Existing Features Preserved
- [ ] Assessment creation form still works
- [ ] Status filtering (All/Draft/Published/Closed/Submitted) works
- [ ] Type filtering works
- [ ] Class selection works
- [ ] Pagination works

---

## Phase 3e — Teacher Reports (Enhanced)

### New Report Types
- [ ] "Performance chart" tab appears in report tabs
- [ ] "Grade distribution" tab appears in report tabs
- [ ] Selecting "Performance chart" loads performance data
- [ ] Selecting "Grade distribution" loads grade distribution data

### Charts
- [ ] Attendance report shows line chart (present/absent/lates over time)
- [ ] Attendance report shows bar chart (stacked by status)
- [ ] Grade distribution shows pie chart
- [ ] Performance shows bar chart (average vs max per assessment)
- [ ] Charts are responsive and render correctly

### Export
- [ ] Export menu works for all report types
- [ ] Exported files include Ethiopian calendar dates
- [ ] Performance and grade-distribution reports have export endpoints

### Backward Compatibility
- [ ] Grade sheet report still works
- [ ] Attendance report still works with date range filters
- [ ] Roster report still works

---

## Phase 4 — Audit & Notifications

### Audit Logging
- [ ] Saving attendance creates audit entry
- [ ] Finalizing attendance creates audit entry
- [ ] Creating assessment creates audit entry
- [ ] Publishing assessment creates audit entry
- [ ] Submitting reports creates audit entry
- [ ] All audit entries include: actor, role, action, entity, entityId, IP, timestamp

### Notifications
- [ ] Teacher submitting course marks creates notification for registrar
- [ ] Assessment published creates notification for students (if applicable)
- [ ] Assessment submissions create notification for teacher

---

## Integration Tests

### End-to-End Workflow
1. [ ] Teacher marks attendance for a class (grid view + fast mark)
2. [ ] Teacher finalizes the attendance sheet
3. [ ] Teacher creates an assessment with secret code
4. [ ] Teacher publishes the assessment
5. [ ] Student accesses public link, verifies with student ID + code
6. [ ] Student uploads submission
7. [ ] Teacher sees submission in assessments detail
8. [ ] Teacher grades the submission
9. [ ] Teacher enters marks in course mark page
10. [ ] Teacher submits marks to registrar
11. [ ] Registrar sees submitted marks with notification
12. [ ] Teacher generates report with charts
13. [ ] Teacher exports report in all formats (PDF, Word, Excel)

### Security Tests
- [ ] Public assessment link requires valid hash
- [ ] Secret code verification blocks unauthorized students
- [ ] Rate limiting applies to public endpoints
- [ ] File upload validates type (PDF/Word only) and size
- [ ] ImageKit webhook signature verified

### Ethiopian Calendar Consistency
- [ ] All dates displayed in Ethiopian calendar format
- [ ] Date filters use Ethiopian calendar input
- [ ] Exported files use Ethiopian dates
