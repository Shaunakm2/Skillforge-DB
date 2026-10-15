/* Skillforge LMS — master lists that replace the "Validation" sheet of the old MIS workbook.
 * Admins edit them in Settings › Master data. Batches, users and the MIS report pick their values from here.
 */
const MASTER_DEFS = [
  // key, label, used by, description
  ['segments', 'Training segment', 'Batches · MIS “Training Segment”', 'Broad family a training belongs to.'],
  ['traineeTypes', 'Type of trainee', 'Batches · MIS “Type of Trainee”', 'New hire or existing employee.'],
  ['trainingNames', 'Training name', 'Batches · MIS “Training Name”', 'The programme a batch runs.'],
  ['departments', 'Department', 'Users, course audiences, reports', 'Team the person belongs to. Shown in Create account.'],
  ['divisions', 'Division', 'Users · MIS “Division”', 'Top-level business division.'],
  ['subDivisions', 'Sub division', 'Users · MIS “Sub Divison”', 'Team or account group inside a division.'],
  ['divisionHeads', 'Division head', 'Users · MIS “Division Head”', 'Head for each division.'],
  ['locations', 'Location', 'Users, rooms · MIS “Location”', 'Office / site.'],
  ['brands', 'Brand', 'Users · MIS “Brand”', 'Company brand the person works for.'],
  ['workModes', 'WFO / WFH', 'Users · MIS “WFO/WFH”', 'Where the person works from.'],
  ['attritionCats', 'Attrition category', 'Status updates · MIS “Attrition Category”', 'Voluntary or involuntary.'],
  ['attritionResp', 'Attrition responsibility', 'Status updates · MIS “Attrition Responsibility”', 'Which team the attrition is attributed to.'],
  ['attritionReasons', 'Attrition reason', 'Status updates · MIS “Reason”', 'Why the person left.'],
  ['education', 'Education', 'Users · MIS “Education”', 'Highest qualification.'],
];
const MASTERS0 = {
  segments: ['Functional Training', 'Communication Training', 'Leadership Training', 'Soft Skills Training', 'Core Elements', 'Essential Training', 'Special Request Training'],
  traineeTypes: ['New Hire', 'Existing'],
  departments: ['Customer Success', 'Sales', 'Engineering', 'Operations', 'Marketing', 'Finance', 'Learning & Development', 'IT'],
  // Sample values only (fictional data). Replace with your own lists in Settings › Master data.
  trainingNames: ['New Hire Induction', 'Customer Support Basics', 'Customer Support Advanced', 'Customer Support – Fast track', 'Inside Sales Programme', 'Field Sales Programme',
    'Finance Services Programme', 'Payables Process Training', 'Service Desk Programme', 'Process Refresher', 'Product Knowledge Update', 'Compliance Essentials', 'Data Privacy Essentials',
    'Information Security Essentials', 'Fire Safety Training', 'Core Elements', 'Communication Skills L1', 'Communication Skills L2', 'Communication Skills L3', 'Communication Refresher',
    'Communication – Special Request', 'Aspiring Leaders', 'First-time Managers', 'Client Induction', 'Client-specific Training', 'Specialised Training'],
  divisions: ['Customer Operations', 'Sales & Growth', 'Finance Services', 'Technology Services', 'Learning and Development'],
  subDivisions: ['Customer Ops – North', 'Customer Ops – South', 'Customer Ops – Digital', 'Sales – Inside', 'Sales – Field', 'Finance – Payables', 'Tech – Service Desk', 'Learning and Development'],
  divisionHeads: ['Rakesh Iyer', 'Sonal Mehta', 'Arvind Pillai', 'Neeta Shah', 'Lena Fischer'],
  locations: ['Ahmedabad', 'Pune', 'Bengaluru'],
  brands: ['Brand A', 'Brand B', 'Brand C', 'Brand D', 'Brand E', 'Brand F'],
  workModes: ['WFO', 'WFH', 'Hybrid'],
  attritionCats: ['Voluntary', 'Involuntary'],
  attritionResp: ['HR', 'Recruitment', 'Operations', 'Training'],
  attritionReasons: ['No call no show', 'Personal', 'Better opportunity', 'Higher studies', 'Health', 'Relocation', 'Attendance', 'Performance', 'Conduct in classroom', 'Policy violation', 'Background verification'],
  education: ['12th', 'BA', 'B.Com', 'BBA', 'BCA', 'B.Sc', 'B.Tech', 'B.Pharm', 'MA', 'M.Com', 'MBA', 'M.Sc', 'MCA'],
};
/* Sub division → division and division → head, used when generating data and in the MIS. */
const SUBDIV_OF = { 'Customer Ops – North':'Customer Operations', 'Customer Ops – South':'Customer Operations', 'Customer Ops – Digital':'Customer Operations', 'Sales – Inside':'Sales & Growth', 'Sales – Field':'Sales & Growth', 'Finance – Payables':'Finance Services', 'Tech – Service Desk':'Technology Services', 'Learning and Development':'Learning and Development' };
const HEAD_OF = { 'Customer Operations':'Rakesh Iyer', 'Sales & Growth':'Sonal Mehta', 'Finance Services':'Neeta Shah', 'Technology Services':'Arvind Pillai', 'Learning and Development':'Lena Fischer' };

/* Badges learners earn (Settings › Master data › Badges). Each badge has a rule: a metric and a threshold. */
const BADGE_METRICS = { lessons:'Lessons / steps completed', courses:'Courses completed', streak:'Day streak', perfect:'Assessments passed with 100%', discussions:'Discussions started', ontime:'Courses completed before the due date', essentials:'Essential trainings completed on time' };
const BADGES0 = [
  { id:'bd1', glyph:'1', name:'First lesson', desc:'Finish any lesson', metric:'lessons', n:1, color:'#0066A1', on:true },
  { id:'bd2', glyph:'7', name:'Week streak', desc:'7 days in a row', metric:'streak', n:7, color:'#007A4D', on:true },
  { id:'bd3', glyph:'14', name:'Fortnight', desc:'14 days in a row', metric:'streak', n:14, color:'#8C5A9E', on:true },
  { id:'bd4', glyph:'★', name:'Quiz Ace', desc:'100% on 3 assessments', metric:'perfect', n:3, color:'#D64545', on:true },
  { id:'bd5', glyph:'✎', name:'Conversation starter', desc:'Start a discussion', metric:'discussions', n:1, color:'#5B7DB8', on:true },
  { id:'bd6', glyph:'✓', name:'On time, every time', desc:'Finish 3 courses before their due date', metric:'ontime', n:3, color:'#08AE6E', on:true },
  { id:'bd7', glyph:'5', name:'High five', desc:'Complete 5 courses', metric:'courses', n:5, color:'#CA8A04', on:true },
  { id:'bd8', glyph:'E', name:'Essentials done', desc:'All essential trainings finished on time', metric:'essentials', n:1, color:'#DB2777', on:true },
];

/* v41.2: departments are editable in Settings › Master data. Older saved settings without the list fall back to the defaults. */
function deptList(s) { const d = s && s.masters && s.masters.departments; return Array.isArray(d) && d.length ? d : MASTERS0.departments; }
