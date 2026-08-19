/**
 * ข้อมูลตัวอย่าง (สมมติทั้งหมด) — แสดงให้เห็นรูปแบบแดชบอร์ดก่อนนำเข้าไฟล์จริง
 * ไม่ใช่ข้อมูลของหน่วยงานใดหน่วยงานหนึ่ง ชื่อหน่วยงาน/บุคคลเป็นชื่อสมมติทั้งสิ้น
 */
const SAMPLE_ORG = [
  { deptName: 'ฝ่ายผลิตและบำรุงรักษา', divisionName: 'กองบำรุงรักษาเครื่องกล 1', sectionName: 'แผนกซ่อมบำรุงเครื่องจักร' },
  { deptName: 'ฝ่ายผลิตและบำรุงรักษา', divisionName: 'กองบำรุงรักษาเครื่องกล 2', sectionName: 'แผนกซ่อมบำรุงไฟฟ้า' },
  { deptName: 'ฝ่ายผลิตและบำรุงรักษา', divisionName: 'กองวิศวกรรมระบบผลิต', sectionName: 'แผนกวิศวกรรมกระบวนการ' },
  { deptName: 'ฝ่ายทรัพยากรบุคคล', divisionName: 'กองพัฒนาบุคลากร', sectionName: 'แผนกฝึกอบรม' },
  { deptName: 'ฝ่ายทรัพยากรบุคคล', divisionName: 'กองสรรหาและบรรจุ', sectionName: 'แผนกสรรหา' },
  { deptName: 'ฝ่ายเทคโนโลยีสารสนเทศ', divisionName: 'กองระบบงานสารสนเทศ', sectionName: 'แผนกพัฒนาระบบ' },
  { deptName: 'ฝ่ายเทคโนโลยีสารสนเทศ', divisionName: 'กองโครงสร้างพื้นฐานดิจิทัล', sectionName: 'แผนกเครือข่ายและความมั่นคงปลอดภัย' },
];

const SAMPLE_COURSE_TYPES = ['หลักสูตรกลางของหน่วยงานกลาง', 'หลักสูตรเสนอเพิ่มเติมตาม Training Needs'];
const SAMPLE_INPUT_FACTORS = [
  'ด้านความปลอดภัย กฎหมาย และการกำกับดูแล',
  'ด้านเทคนิคเฉพาะทาง',
  'มาตรฐานอาชีพ (CB)',
  'ความจำเป็นของหน่วยงาน',
  'ยุทธศาสตร์องค์กร',
  'แผนแม่บทองค์กร',
];
const SAMPLE_TITLES = [
  'การบำรุงรักษาเชิงป้องกันสำหรับเครื่องจักรกลหมุน', 'ความปลอดภัยในการทำงานเกี่ยวกับไฟฟ้าแรงสูง',
  'มาตรฐานอาชีพช่างเทคนิคระบบผลิตไฟฟ้า', 'การวิเคราะห์ความเสี่ยงกระบวนการผลิต',
  'ผู้จัดการด้านสิ่งแวดล้อมและความยั่งยืน', 'เทคนิคการบริหารโครงการฝึกอบรม',
  'การสรรหาและคัดเลือกบุคลากรเชิงสมรรถนะ', 'การออกแบบเส้นทางความก้าวหน้าในสายอาชีพ',
  'การพัฒนาระบบสารสนเทศเพื่อการบริหารงาน', 'ความมั่นคงปลอดภัยไซเบอร์สำหรับระบบควบคุมอุตสาหกรรม',
  'สถาปัตยกรรมโครงสร้างพื้นฐานคลาวด์', 'การวิเคราะห์ข้อมูลขนาดใหญ่เพื่อการตัดสินใจ',
  'ผู้ตรวจประเมินระบบบริหารคุณภาพ ISO 9001', 'เทคนิคการเจรจาต่อรองในงานจัดซื้อจัดจ้าง',
  'การบริหารความต่อเนื่องทางธุรกิจ (BCM)', 'หัวหน้างานยุคใหม่กับการบริหารทีมข้ามสายงาน',
  'การประยุกต์ใช้ปัญญาประดิษฐ์ในงานบำรุงรักษา', 'กฎหมายแรงงานที่หัวหน้างานต้องรู้',
  'เทคนิคการตรวจสอบระบบไฟฟ้ากำลัง', 'การบริหารคลังพัสดุและอะไหล่วิกฤต',
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSampleRecords() {
  const rnd = mulberry32(20270819);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const reviewPlan = ['pending', 'pending', 'pending', 'pending', 'approved', 'approved', 'approved', 'revise', 'rejected'];
  const priorities = ['รออนุมัติ', 'ร่าง'];
  const reviewers = ['ผู้บริหาร ก', 'ผู้บริหาร ข'];
  const records = [];
  SAMPLE_TITLES.forEach((title, i) => {
    const org = SAMPLE_ORG[Math.floor(rnd() * SAMPLE_ORG.length)];
    const courseType = SAMPLE_COURSE_TYPES[i % SAMPLE_COURSE_TYPES.length === 0 && rnd() > 0.7 ? 1 : (rnd() > 0.7 ? 1 : 0)];
    const status = pick(reviewPlan);
    const budget = rnd() > 0.55 ? Math.round((5000 + rnd() * 280000) / 500) * 500 : 0;
    const participants = Math.round(1 + rnd() * rnd() * 60);
    const days = rnd() > 0.6 ? Math.round((0.5 + rnd() * 4) * 2) / 2 : null;
    const rec = {
      id: 'SMP-' + String(i + 1).padStart(3, '0'),
      nameTh: title,
      nameEn: '',
      sourceStatus: pick(priorities),
      respondsTo: 'หน่วยงานตามสายรอง',
      courseType,
      inputFactor: pick(SAMPLE_INPUT_FACTORS),
      deptName: org.deptName,
      divisionName: org.divisionName,
      sectionName: org.sectionName,
      rationale: 'เพื่อเสริมสร้างความรู้และทักษะที่จำเป็นต่อการปฏิบัติงานให้สอดคล้องกับมาตรฐานและเป้าหมายของหน่วยงาน',
      objective: 'เพื่อให้ผู้เข้าอบรมมีความรู้ความเข้าใจและสามารถนำไปประยุกต์ใช้ในการปฏิบัติงานได้อย่างถูกต้อง',
      outcome: 'บุคลากรมีสมรรถนะเพิ่มขึ้นตามเกณฑ์ที่กำหนด และสามารถลดความเสี่ยง/ข้อผิดพลาดในการปฏิบัติงาน',
      kpi: 'ผลประเมินหลังอบรม ≥ 80% และนำไปใช้ปฏิบัติงานจริงภายใน 3 เดือน',
      deliveryType: pick(['จัดอบรมภายในหน่วยงาน', 'ส่งอบรมภายนอก - ในประเทศ', 'ส่งอบรมภายนอก - ต่างประเทศ', '']),
      learningFormat: pick(['ห้องเรียน/Classroom', 'อบรมเชิงปฏิบัติการ/Workshop', 'E-learning', 'ประชุม/สัมมนา']),
      days,
      participants,
      startDate: null,
      endDate: null,
      coordinator: pick(['สมชาย ใจดี', 'วรรณา ศรีสุข', 'ประยุทธ วงศ์ทอง', 'อรพินท์ พลอยงาม']),
      budgetTotal: budget,
      budgetOutsource: budget ? Math.round(budget * 0.6) : 0,
      remark: '',
      creatorName: pick(['สมชาย ใจดี', 'วรรณา ศรีสุข', 'ประยุทธ วงศ์ทอง', 'อรพินท์ พลอยงาม']),
      creatorPosition: pick(['วิศวกร', 'นักทรัพยากรบุคคล', 'ช่างเทคนิค', 'นักวิเคราะห์ระบบงาน']),
      targetGroupNames: 'พนักงานในสังกัด ' + org.sectionName,
      targetPositions: pick(['ช.4-6', 'วศ.6-8', 'นทบ.5-7']),
      reviewStatus: status,
      reviewNote: status === 'revise' ? 'ขอให้ทบทวนกลุ่มเป้าหมายและงบประมาณให้สอดคล้องกับแผนงานหลัก' :
                  status === 'rejected' ? 'ซ้ำซ้อนกับหลักสูตรที่มีอยู่แล้วในแผนกลาง' : '',
      reviewedBy: status !== 'pending' ? pick(reviewers) : '',
      reviewedDate: status !== 'pending' ? '2569-08-1' + (i % 9) : '',
    };
    records.push(rec);
  });
  return records;
}
