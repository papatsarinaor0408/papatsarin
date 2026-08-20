/**
 * นำเข้าไฟล์ Excel/CSV จริงของหน่วยงาน — ทำงานฝั่งเบราว์เซอร์ทั้งหมด
 * ไม่มีการส่งไฟล์ออกไปนอกเครื่อง/เซิร์ฟเวอร์ใดๆ ทั้งสิ้น
 */

const HEADER_TO_KEY = {};
FIELDS.forEach((f) => { HEADER_TO_KEY[f.header.trim()] = f; });

function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function toDateLabel(v) {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v)) {
    return v.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return String(v);
}

/**
 * เติมชื่อหน่วยงาน ฝ่าย/กอง/แผนก ที่ขาดหายด้วยหน่วยงานที่เจาะจงกว่าซึ่งมีข้อมูลอยู่แล้ว
 * (เช่น ไม่มี "กอง" ให้ใช้ "แผนก" แทน, ไม่มี "แผนก" ให้ใช้ "กอง"/"ฝ่าย" แทน)
 * แทนที่จะโชว์ "ไม่ระบุ" เฉยๆ — ทำงานได้แบบ idempotent จึงเรียกซ้ำได้ปลอดภัย
 * (ใช้ normalize ข้อมูลที่นำเข้าไว้ก่อนหน้าซึ่งอาจยังเป็น "ไม่ระบุ" ค้างจากโค้ดเวอร์ชันเก่า)
 */
function normalizeOrgHierarchy(rec) {
  const clean = (v) => (v && v !== 'ไม่ระบุ') ? v : '';
  let dept = clean(rec.deptName);
  let division = clean(rec.divisionName);
  let section = clean(rec.sectionName);

  if (!division) division = section || dept;
  if (!section) section = division || dept;

  rec.deptName = dept || 'ไม่ระบุ';
  rec.divisionName = division || 'ไม่ระบุ';
  rec.sectionName = section || 'ไม่ระบุ';
  return rec;
}

function mapRowToRecord(row, index) {
  const rec = {
    id: 'IMP-' + String(index + 1).padStart(4, '0'),
    reviewStatus: 'pending',
    reviewNote: '',
    reviewedBy: '',
    reviewedDate: '',
  };
  Object.keys(row).forEach((rawHeader) => {
    const header = String(rawHeader).trim();
    const field = HEADER_TO_KEY[header];
    if (!field) return;
    const val = row[rawHeader];
    if (field.numeric) rec[field.key] = toNumber(val);
    else if (field.key === 'startDate' || field.key === 'endDate') rec[field.key] = toDateLabel(val);
    else rec[field.key] = (val === undefined || val === null) ? '' : String(val).trim();
  });
  normalizeOrgHierarchy(rec);

  // ค่าที่จำเป็นแต่ไม่มีในไฟล์ ให้ค่าเริ่มต้นว่าง เพื่อกันหน้าจอพัง
  ['nameTh', 'courseType', 'inputFactor'].forEach((k) => {
    if (!rec[k]) rec[k] = k === 'nameTh' ? '(ไม่ระบุชื่อหลักสูตร)' : 'ไม่ระบุ';
  });
  return rec;
}

/**
 * อ่านไฟล์ที่ผู้ใช้เลือก (xlsx/xls/csv) แล้วคืนค่าเป็น { records, sheetName, rowCount }
 * ผ่าน callback(err, result)
 */
function importPlanFile(file, callback) {
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
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) {
        callback(new Error('ไม่พบข้อมูลในไฟล์ที่เลือก'));
        return;
      }
      const records = rows.map(mapRowToRecord);
      callback(null, { records, sheetName, rowCount: records.length });
    } catch (err) {
      callback(new Error('รูปแบบไฟล์ไม่ถูกต้อง หรือไม่สามารถอ่านได้ (' + err.message + ')'));
    }
  };
  reader.readAsArrayBuffer(file);
}
