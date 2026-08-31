/**
 * นำเข้าไฟล์ "ข้อมูลไฟนอล" — ไฟล์ Excel หลายชีทที่ส่งออกจากระบบกลาง อศค.
 * หลังจากคีย์หลักสูตรเข้าระบบใหม่แล้ว (มีรหัสจริง เช่น TN-0313) คนละรูปแบบ
 * กับไฟล์นำเข้าหลักที่ใช้ importer.js/schema.js — จึงแยกตัวอ่านเป็นไฟล์นี้
 * ต่างหาก ทำงานฝั่งเบราว์เซอร์ทั้งหมดเหมือนกัน
 */

const FINAL_SHEET_NAMES = {
  courses: 'หลักสูตร',
  targetsByName: 'กลุ่มเป้าหมายตามรายชื่อ',
  targetsByUnit: 'กลุ่มเป้าหมายตามหน่วยงาน',
  budget: 'งบประมาณ',
};

const FINAL_COURSE_FIELDS = [
  { key: 'deputyLine',         header: 'รอง' },
  { key: 'assistantGovernor',  header: 'ผู้ช่วย' },
  { key: 'deptName',           header: 'ฝ่าย' },
  { key: 'workingGroup',       header: 'คณะทำงาน' },
  { key: 'nameTh',             header: 'ชื่อหลักสูตร (ภาษาไทย)' },
  { key: 'nameEn',             header: 'ชื่อหลักสูตร (ภาษาอังกฤษ)' },
  { key: 'sourceStatus',       header: 'สถานะหลักสูตร' },
  { key: 'respondsTo',         header: 'หลักสูตรตอบสนอง' },
  { key: 'courseType',         header: 'ประเภทหลักสูตร' },
  { key: 'inputFactor',        header: 'ปัจจัยนำเข้าหลัก' },
  { key: 'strategy',           header: 'ยุทธศาสตร์' },
  { key: 'projectPlan',        header: 'แผนงานโครงการ' },
  { key: 'masterPlan',         header: 'แผนแม่บท' },
  { key: 'techCompetency23',   header: 'Technical Competency 23 ประเภทงาน' },
  { key: 'techCompetency66',   header: 'Technical Competency 66 สายอาชีพ' },
  { key: 'legalQualitySafety', header: 'กฏหมาย คุณภาพและความปลอดภัย เฉพาะสายงาน' },
  { key: 'orgNecessity',       header: 'ความจำเป็นของหน่วยงาน' },
  { key: 'rationale',          header: 'หลักการและเหตุผล' },
  { key: 'objective',          header: 'วัตถุประสงค์ในการฝึกอบรม/การพัฒนา' },
  { key: 'skillsGained',       header: 'ทักษะ ความรู้ ที่ได้หลังการพัฒนา' },
  { key: 'outcome',            header: 'ผลลัพธ์จากการพัฒนา' },
  { key: 'kpi',                header: 'ตัวชี้วัด (kpi) หลังการพัฒนา' },
  { key: 'deliveryType',       header: 'ประเภทการส่งอบรม' },
  { key: 'learningFormat',     header: 'รูปแบบการเรียนรู้และการพัฒนา' },
  { key: 'internalInstructor', header: 'วิทยากรภายใน กฟผ. (ชื่อ/หน่วยงาน)' },
  { key: 'externalInstructor', header: 'วิทยากรภายนอก (ชื่อ - เบอร์ติดต่อสถาบันผู้จัดอบรม)' },
  { key: 'overseasLocation',   header: 'สถานที่จัดอบรมต่างประเทศ' },
  { key: 'days',               header: 'จำนวนวันอบรม (วัน)', numeric: true },
  { key: 'participants',       header: 'จำนวนผู้เข้าอบรม (คน)', numeric: true },
  { key: 'startDate',          header: 'วันเริ่มต้นการอบรม' },
  { key: 'endDate',            header: 'วันสิ้นสุดการอบรม' },
  { key: 'coordinator',        header: 'ผู้ประสานงานหลักสูตร (ผู้ให้ข้อมูล)' },
  { key: 'budgetTotal',        header: 'งบประมาณรวมทั้งหมด', numeric: true },
  { key: 'budgetOutsource',    header: 'ค่าจ้างเหมาบริการทั้งหลักสูตร/ค่าวิทยากรภายนอก', numeric: true },
  { key: 'remark',             header: 'หมายเหตุ' },
  { key: 'creatorName',        header: 'ผู้สร้างหลักสูตร' },
  { key: 'creatorUnit',        header: 'หน่วยงานผู้สร้างหลักสูตร' },
  { key: 'targetGroupNamesRaw',header: 'ชื่อกลุ่มเป้าหมาย' },
];

const FINAL_TARGET_NAME_FIELDS = [
  { key: 'courseId',   header: 'ID' },
  { key: 'employeeId', header: 'หมายเลขประจำตัว' },
  { key: 'fullName',   header: 'ชื่อ-สกุล' },
  { key: 'position',   header: 'ตำแหน่ง' },
  { key: 'unit',       header: 'หน่วยงาน' },
];

const FINAL_TARGET_UNIT_FIELDS = [
  { key: 'courseId',     header: 'ID' },
  { key: 'lineDeputy',   header: 'สายรอง' },
  { key: 'assistant',    header: 'ผู้ช่วย' },
  { key: 'deptName',     header: 'ฝ่าย' },
  { key: 'divisionName', header: 'กอง' },
  { key: 'remark',       header: 'หมายเหตุ' },
];

const FINAL_BUDGET_FIELDS = [
  { key: 'courseId',       header: 'ID' },
  { key: 'level',          header: 'ระดับ' },
  { key: 'days',           header: 'จำนวนวัน', numeric: true },
  { key: 'perDiem',        header: 'ค่าเบี้ยเลี้ยง', numeric: true },
  { key: 'participants',   header: 'จำนวนผู้เข้าอบรม', numeric: true },
  { key: 'accommodation',  header: 'ค่าที่พัก', numeric: true },
  { key: 'transport',      header: 'ค่าพาหนะ', numeric: true },
  { key: 'airfare',        header: 'ค่าบัตรโดยสารเครื่องบินไป-กลับ', numeric: true },
  { key: 'passportFee',    header: 'ค่าหนังสือเดินทาง', numeric: true },
  { key: 'visaFee',        header: 'ค่าวีซ่า', numeric: true },
  { key: 'travelInsurance',header: 'ค่าประกันเดินทาง', numeric: true },
  { key: 'commsCost',      header: 'ค่าใช้จ่ายในการติดต่อสื่อสาร', numeric: true },
  { key: 'registrationFee',header: 'ค่าลงทะเบียนรายคน', numeric: true },
  { key: 'perHeadSummary', header: 'สรุปค่าใช้จ่ายต่อหัว', numeric: true },
  { key: 'total',          header: 'รวม', numeric: true },
];

/** Builds a { trimmedHeader: field } lookup, same technique as importer.js's HEADER_TO_KEY. */
function buildHeaderMap(fields) {
  const map = {};
  fields.forEach((f) => { map[f.header.trim()] = f; });
  return map;
}

/** Maps one sheet_to_json row to a record using a field/header list — courses get their `id` from the 'ID' column, child sheets keep it as `courseId` (one of the mapped fields). */
function mapFinalRow(row, headerMap, idKey) {
  const rec = {};
  Object.keys(row).forEach((rawHeader) => {
    const header = String(rawHeader).trim();
    const field = headerMap[header];
    if (!field) return;
    const val = row[rawHeader];
    if (field.numeric) rec[field.key] = toNumber(val);
    else if (field.key === 'startDate' || field.key === 'endDate') rec[field.key] = toDateLabel(val);
    else rec[field.key] = (val === undefined || val === null) ? '' : String(val).trim();
  });
  if (idKey && !rec[idKey]) rec[idKey] = '';
  return rec;
}

function sheetRows(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

/**
 * อ่านไฟล์ "ข้อมูลไฟนอล" (Excel 4 ชีท) แล้วคืนค่า
 * { courses, targetsByName, targetsByUnit, budget } ผ่าน callback(err, result)
 */
function importFinalDataFile(file, callback) {
  if (typeof XLSX === 'undefined') {
    callback(new Error('ไม่สามารถโหลดตัวอ่านไฟล์ Excel ได้ (ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อโหลดไลบรารีครั้งแรก) กรุณาลองใหม่อีกครั้ง'));
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => callback(new Error('อ่านไฟล์ไม่สำเร็จ'));
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });

      const missing = Object.values(FINAL_SHEET_NAMES).filter((name) => wb.SheetNames.indexOf(name) === -1);
      if (missing.length) {
        callback(new Error('ไฟล์นี้ไม่ใช่ไฟล์ Approved Data — ไม่พบชีท: ' + missing.join(', ')));
        return;
      }

      const courseMap = buildHeaderMap(FINAL_COURSE_FIELDS);
      const courses = sheetRows(wb, FINAL_SHEET_NAMES.courses).map((row) => {
        const rec = mapFinalRow(row, courseMap);
        rec.id = String(row['ID'] === undefined || row['ID'] === null ? '' : row['ID']).trim();
        return rec;
      });
      const missingId = courses.findIndex((r) => !r.id || !r.nameTh);
      if (missingId !== -1) {
        callback(new Error(`ชีท "${FINAL_SHEET_NAMES.courses}" แถวที่ ${missingId + 2} ไม่มีรหัส (ID) หรือชื่อหลักสูตร`));
        return;
      }

      const targetNameMap = buildHeaderMap(FINAL_TARGET_NAME_FIELDS);
      const targetsByName = sheetRows(wb, FINAL_SHEET_NAMES.targetsByName)
        .map((row) => mapFinalRow(row, targetNameMap, 'courseId'))
        .filter((r) => r.courseId);

      const targetUnitMap = buildHeaderMap(FINAL_TARGET_UNIT_FIELDS);
      const targetsByUnit = sheetRows(wb, FINAL_SHEET_NAMES.targetsByUnit)
        .map((row) => mapFinalRow(row, targetUnitMap, 'courseId'))
        .filter((r) => r.courseId);

      const budgetMap = buildHeaderMap(FINAL_BUDGET_FIELDS);
      const budget = sheetRows(wb, FINAL_SHEET_NAMES.budget)
        .map((row) => mapFinalRow(row, budgetMap, 'courseId'))
        .filter((r) => r.courseId);

      if (!courses.length) {
        callback(new Error(`ไม่พบข้อมูลในชีท "${FINAL_SHEET_NAMES.courses}"`));
        return;
      }

      callback(null, { courses, targetsByName, targetsByUnit, budget });
    } catch (err) {
      callback(new Error('รูปแบบไฟล์ไม่ถูกต้อง หรือไม่สามารถอ่านได้ (' + err.message + ')'));
    }
  };
  reader.readAsArrayBuffer(file);
}
