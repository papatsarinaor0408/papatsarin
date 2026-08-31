/**
 * นำเข้าไฟล์ "Approved Data" — ไฟล์ Excel ที่ส่งออกจากระบบกลาง อศค. หลังจาก
 * คีย์หลักสูตรเข้าระบบใหม่แล้ว (มีรหัสจริง เช่น TN-0313) คนละรูปแบบกับไฟล์
 * นำเข้าหลักที่ใช้ importer.js/schema.js — จึงแยกตัวอ่านเป็นไฟล์นี้ต่างหาก
 * ทำงานฝั่งเบราว์เซอร์ทั้งหมดเหมือนกัน. อ่านเฉพาะชีทแรก "หลักสูตร" — ชีทอื่น
 * ในไฟล์ (ถ้ามี) จะไม่ถูกใช้ เพราะรายชื่อกลุ่มเป้าหมายที่ควบรวมแล้วอยู่ใน
 * คอลัมน์ "ชื่อกลุ่มเป้าหมาย" ของชีทนี้อยู่แล้ว
 */

const FINAL_COURSE_SHEET_NAME = 'หลักสูตร';

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
  { key: 'targetSection',      header: 'แผนกกลุ่มเป้าหมาย' },
  { key: 'targetDivision',     header: 'กองกลุ่มเป้าหมาย' },
];

/** Builds a { trimmedHeader: field } lookup, same technique as importer.js's HEADER_TO_KEY. */
function buildHeaderMap(fields) {
  const map = {};
  fields.forEach((f) => { map[f.header.trim()] = f; });
  return map;
}

function mapFinalRow(row, headerMap) {
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
  return rec;
}

/**
 * อ่านไฟล์ "Approved Data" (ใช้เฉพาะชีท "หลักสูตร") แล้วคืนค่า { courses }
 * ผ่าน callback(err, result)
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

      const ws = wb.Sheets[FINAL_COURSE_SHEET_NAME];
      if (!ws) {
        callback(new Error(`ไฟล์นี้ไม่ใช่ไฟล์ Approved Data — ไม่พบชีท "${FINAL_COURSE_SHEET_NAME}"`));
        return;
      }
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) {
        callback(new Error(`ไม่พบข้อมูลในชีท "${FINAL_COURSE_SHEET_NAME}"`));
        return;
      }

      const courseMap = buildHeaderMap(FINAL_COURSE_FIELDS);
      const courses = rows.map((row) => {
        const rec = mapFinalRow(row, courseMap);
        rec.id = String(row['ID'] === undefined || row['ID'] === null ? '' : row['ID']).trim();
        return rec;
      });
      const missingId = courses.findIndex((r) => !r.id || !r.nameTh);
      if (missingId !== -1) {
        callback(new Error(`ชีท "${FINAL_COURSE_SHEET_NAME}" แถวที่ ${missingId + 2} ไม่มีรหัส (ID) หรือชื่อหลักสูตร`));
        return;
      }

      callback(null, { courses });
    } catch (err) {
      callback(new Error('รูปแบบไฟล์ไม่ถูกต้อง หรือไม่สามารถอ่านได้ (' + err.message + ')'));
    }
  };
  reader.readAsArrayBuffer(file);
}
