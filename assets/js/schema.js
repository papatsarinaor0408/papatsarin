/**
 * Field schema for การพัฒนาบุคลากร (personnel development plan / course) records.
 * `header` values match the exact Thai column headers found in the real
 * "Exported ... .xlsx" file used by the organization, so an import maps 1:1.
 * Anything not present in an uploaded file is simply left blank.
 */
const FIELDS = [
  { key: 'nameTh',            header: 'ชื่อหลักสูตร (ภาษาไทย)' },
  { key: 'nameEn',             header: 'ชื่อหลักสูตร (ภาษาอังกฤษ)' },
  { key: 'sourceStatus',        header: 'สถานะหลักสูตร' },
  { key: 'respondsTo',          header: 'หลักสูตรตอบสนอง' },
  { key: 'courseType',          header: 'ประเภทหลักสูตร' },
  { key: 'inputFactor',         header: 'ปัจจัยนำเข้าหลัก' },
  { key: 'strategy',            header: 'ยุทธศาสตร์' },
  { key: 'projectPlan',         header: 'แผนงานโครงการ' },
  { key: 'masterPlan',          header: 'แผนแม่บท' },
  { key: 'orgNecessity',        header: 'ความจำเป็นของหน่วยงาน' },
  { key: 'rationale',           header: 'หลักการและเหตุผล' },
  { key: 'objective',           header: 'วัตถุประสงค์ในการฝึกอบรม/การพัฒนา' },
  { key: 'skillsGained',        header: 'ทักษะ ความรู้ ที่ได้หลังการพัฒนา' },
  { key: 'outcome',             header: 'ผลลัพธ์จากการพัฒนา' },
  { key: 'kpi',                 header: 'ตัวชี้วัด (kpi) หลังการพัฒนา' },
  { key: 'deliveryType',        header: 'ประเภทการส่งอบรม' },
  { key: 'learningFormat',      header: 'รูปแบบการเรียนรู้และการพัฒนา' },
  { key: 'internalInstructor',  header: 'วิทยากรภายใน กฟผ. (ชื่อ/หน่วยงาน)' },
  { key: 'externalInstructor',  header: 'วิทยากรภายนอก (ชื่อ - เบอร์ติดต่อสถาบันผู้จัดอบรม)' },
  { key: 'overseasLocation',    header: 'สถานที่จัดอบรมต่างประเทศ' },
  { key: 'days',                header: 'จำนวนวันอบรม (วัน)', numeric: true },
  { key: 'participants',        header: 'จำนวนผู้เข้าอบรม (คน)', numeric: true },
  { key: 'startDate',           header: 'วันเริ่มต้นการอบรม' },
  { key: 'endDate',             header: 'วันสิ้นสุดการอบรม' },
  { key: 'coordinator',         header: 'ผู้ประสานงานหลักสูตร (ผู้ให้ข้อมูล)' },
  { key: 'budgetTotal',         header: 'งบประมาณรวมทั้งหมด', numeric: true },
  { key: 'budgetOutsource',     header: 'ค่าจ้างเหมาบริการทั้งหลักสูตร/ค่าวิทยากรภายนอก', numeric: true },
  { key: 'remark',              header: 'หมายเหตุ' },
  { key: 'creatorName',         header: 'ผู้สร้างหลักสูตร' },
  { key: 'creatorId',           header: 'เลขประจำตัวผู้สร้างหลักสูตร' },
  { key: 'creatorPosition',     header: 'ตำแหน่งผู้สร้างหลักสูตร' },
  { key: 'sectionName',         header: 'แผนกผู้สร้างหลักสูตร' },
  { key: 'divisionName',        header: 'กองผู้สร้างหลักสูตร' },
  { key: 'deptName',            header: 'ฝ่ายผู้สร้างหลักสูตร' },
  { key: 'targetGroupNames',    header: 'กลุ่มเป้าหมาย (รายชื่อ/ประเภทหน่วยงาน)' },
  { key: 'targetPositions',     header: 'ตำแหน่งกลุ่มเป้าหมาย' },
  { key: 'targetSection',       header: 'แผนกกลุ่มเป้าหมาย' },
  { key: 'targetDivision',      header: 'กองกลุ่มเป้าหมาย' },
  { key: 'targetDept',          header: 'ฝ่ายกลุ่มเป้าหมาย' },
];

// Review workflow — the three decisions the executive can take on each plan.
const REVIEW_STATUS = {
  pending:  { label: 'รอพิจารณา',              order: 0 },
  approved: { label: 'เห็นชอบ',                 order: 1 },
  revise:   { label: 'เห็นชอบแต่ให้ทบทวน',       order: 2 },
  rejected: { label: 'ไม่เห็นชอบ',               order: 3 },
};

// Grouping levels available for the "หน่วยงานเสนอ" dimension (org hierarchy).
const ORG_LEVELS = [
  { key: 'deptName',     label: 'ฝ่าย' },
  { key: 'divisionName', label: 'กอง' },
  { key: 'sectionName',  label: 'แผนก' },
];
