/* ============================================================
   ระบบปฏิทินงาน Hotline PEA BPK Team Calendar
   ไฟล์ข้อมูลตัวอย่าง (Mock Data)
   หมายเหตุ: วันหยุดตามจันทรคติ (มาฆบูชา/วิสาขบูชา/อาสาฬหบูชา/เข้าพรรษา)
   เป็นวันที่โดยประมาณสำหรับสาธิตระบบ ควรตรวจสอบ/แก้ไขให้ตรงประกาศทางการก่อนใช้งานจริง
   ============================================================ */

/* ---------- วันหยุดราชการ/นักขัตฤกษ์ ปี พ.ศ. 2569 (ค.ศ. 2026) ---------- */
const HOLIDAYS = {
  "2026-01-01": "วันขึ้นปีใหม่",
  "2026-03-03": "วันมาฆบูชา",
  "2026-04-06": "วันจักรี",
  "2026-04-13": "วันสงกรานต์",
  "2026-04-14": "วันสงกรานต์",
  "2026-04-15": "วันสงกรานต์",
  "2026-05-04": "วันฉัตรมงคล",
  "2026-05-31": "วันวิสาขบูชา",
  "2026-07-28": "วันเฉลิมพระชนมพรรษา ร.10",
  "2026-07-29": "วันอาสาฬหบูชา",
  "2026-07-30": "วันเข้าพรรษา",
  "2026-08-12": "วันแม่แห่งชาติ",
  "2026-10-13": "วันคล้ายวันสวรรคต ร.9",
  "2026-10-23": "วันปิยมหาราช",
  "2026-12-05": "วันพ่อแห่งชาติ",
  "2026-12-10": "วันรัฐธรรมนูญ",
  "2026-12-31": "วันสิ้นปี"
};

/* ---------- ตัวเลือกสำหรับตัวกรอง/ฟอร์ม ---------- */
const JOB_TYPES = [
  "ปฏิบัติงาน Hotline (มีไฟ)",
  "บำรุงรักษาระบบไฟฟ้า",
  "ซ่อมแซมฉุกเฉิน",
  "ติดตั้งอุปกรณ์",
  "ตรวจสอบระบบ/PM",
  "ประสานงานหน่วยงานภายนอก"
];

const WORK_AREAS = [
  "บางปะกง",
  "ฉะเชิงเทรา",
  "ชลบุรี",
  "ระยอง",
  "สมุทรปราการ",
  "ปราจีนบุรี"
];

const TARGET_PEA_OFFICES = [
  "กฟฟ.บางปะกง",
  "กฟฟ.ฉะเชิงเทรา",
  "กฟฟ.พนัสนิคม",
  "กฟฟ.ศรีราชา",
  "กฟฟ.บางละมุง",
  "กฟฟ.บ้านโพธิ์",
  "กฟฟ.บางคล้า",
  "กฟฟ.พานทอง"
];

const VEHICLES = [
  "รถกระเช้า ทะเบียน 81-1234 ฉช.",
  "รถกระเช้า ทะเบียน 81-5566 ฉช.",
  "รถบรรทุก 6 ล้อ ทะเบียน 70-2233 ฉช.",
  "รถกระบะ ทะเบียน กข-9012 ฉช.",
  "รถตู้ ทะเบียน นค-3456 ฉช."
];

const TEAMS = {
  "ทีม A": ["นายสมชาย ใจดี (หัวหน้าทีม)", "นายวิชัย รักงาน", "นายประสิทธิ์ มั่นคง", "นายอนุชา ทองดี"],
  "ทีม B": ["นายกิตติ ศรีสุข (หัวหน้าทีม)", "นายธวัช บุญมา", "นายสุริยา แสงทอง"],
  "ทีม C": ["นายพิชัย รุ่งเรือง (หัวหน้าทีม)", "นายเอกชัย มีชัย", "นายบุญส่ง แก้วมณี", "นายชาญณรงค์ ยิ้มแย้ม"]
};

const EQUIPMENT_POOL = [
  "ชุดเครื่องมือ Hotline (Hot Stick)",
  "ถุงมือยางกันไฟฟ้าแรงสูง",
  "หมวกนิรภัยฉนวนไฟฟ้า",
  "รองเท้ากันไฟฟ้าแรงสูง",
  "ชุดป้องกันอาร์คแฟลช (Arc Flash Suit)",
  "เชือกร้อยสายกราวด์ (Grounding Set)",
  "กรวยจราจร/ป้ายเตือน",
  "วิทยุสื่อสาร",
  "ชุดปฐมพยาบาล",
  "กล้องบันทึกภาพหน้างาน"
];

const STATUS_OPTIONS = ["วางแผน", "กำลังดำเนินการ", "เสร็จสิ้น", "ยกเลิก"];
const TRAVEL_ORDER_STATUS_OPTIONS = ["อนุมัติแล้ว", "รออนุมัติ", "ไม่ต้องขอคำสั่ง"];
const PRIORITY_OPTIONS = ["ตามแผน", "ด่วน"];

function eq(...items) { return items; }

/* ---------- รายการงาน (Mock Tasks) ปี 2569 (ค.ศ. 2026) ---------- */
const TASKS = [
  // ----- มกราคม -----
  { id: "T-260112", title: "PM หม้อแปลงจำหน่าย สายป้อน 22kV", date: "2026-01-12", departTime: "07:30", appointTime: "08:30", jobType: "ตรวจสอบระบบ/PM", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม A", vehicle: VEHICLES[2], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[2], EQUIPMENT_POOL[7]), equipmentOwner: "นายวิชัย รักงาน", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "เสร็จสิ้น", note: "" },
  { id: "T-260122", title: "ปฏิบัติงาน Hotline เปลี่ยนลูกถ้วยแขวนชำรุด", date: "2026-01-22", departTime: "06:30", appointTime: "08:00", jobType: "ปฏิบัติงาน Hotline (มีไฟ)", workArea: "ชลบุรี", targetPEA: "กฟฟ.ศรีราชา", areaStatus: "out", priority: "ตามแผน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 014/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม B", vehicle: VEHICLES[0], equipment: eq(EQUIPMENT_POOL[0], EQUIPMENT_POOL[1], EQUIPMENT_POOL[4], EQUIPMENT_POOL[5]), equipmentOwner: "นายธวัช บุญมา", coordinator: "นายประยุทธ ศรีวงศ์", coordinatorPhone: "081-234-5602", status: "เสร็จสิ้น", note: "ประสานปิดเส้นทางจราจรร่วมกับ กฟฟ.ศรีราชา" },

  // ----- กุมภาพันธ์ -----
  { id: "T-260210", title: "ซ่อมแซมฉุกเฉินสายไฟขาดหลังพายุฝน", date: "2026-02-10", departTime: "05:40", appointTime: "06:30", jobType: "ซ่อมแซมฉุกเฉิน", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ด่วน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม C", vehicle: VEHICLES[2], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[2], EQUIPMENT_POOL[3], EQUIPMENT_POOL[6]), equipmentOwner: "นายเอกชัย มีชัย", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "เสร็จสิ้น", note: "เร่งด่วนเนื่องจากกระทบผู้ใช้ไฟจำนวนมาก" },
  { id: "T-260218", title: "ติดตั้งเซอร์กิตเบรกเกอร์สายป้อนใหม่", date: "2026-02-18", departTime: "07:00", appointTime: "08:00", jobType: "ติดตั้งอุปกรณ์", workArea: "ระยอง", targetPEA: "กฟฟ.บางละมุง", areaStatus: "out", priority: "ตามแผน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 021/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม A", vehicle: VEHICLES[3], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[6], EQUIPMENT_POOL[7]), equipmentOwner: "นายอนุชา ทองดี", coordinator: "นางสาวรัชนี พูนผล", coordinatorPhone: "081-234-5603", status: "วางแผน", note: "" },

  // ----- มีนาคม -----
  { id: "T-260305", title: "ตรวจสอบระบบป้องกันฟ้าผ่าประจำไตรมาส", date: "2026-03-05", departTime: "08:00", appointTime: "09:00", jobType: "ตรวจสอบระบบ/PM", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม B", vehicle: VEHICLES[4], equipment: eq(EQUIPMENT_POOL[7], EQUIPMENT_POOL[9]), equipmentOwner: "นายสุริยา แสงทอง", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "เสร็จสิ้น", note: "" },
  { id: "T-260319", title: "ปฏิบัติงาน Hotline ย้ายจุดต่อสายเมนแรงสูง", date: "2026-03-19", departTime: "06:45", appointTime: "08:00", jobType: "ปฏิบัติงาน Hotline (มีไฟ)", workArea: "ฉะเชิงเทรา", targetPEA: "กฟฟ.บางคล้า", areaStatus: "out", priority: "ตามแผน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 033/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม C", vehicle: VEHICLES[1], equipment: eq(EQUIPMENT_POOL[0], EQUIPMENT_POOL[1], EQUIPMENT_POOL[4]), equipmentOwner: "นายบุญส่ง แก้วมณี", coordinator: "นายวิรัตน์ ชูเกียรติ", coordinatorPhone: "081-234-5604", status: "วางแผน", note: "" },

  // ----- เมษายน -----
  { id: "T-260402", title: "PM สายป้อนหลักก่อนเทศกาลสงกรานต์", date: "2026-04-02", departTime: "07:30", appointTime: "08:30", jobType: "ตรวจสอบระบบ/PM", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม A", vehicle: VEHICLES[2], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[2], EQUIPMENT_POOL[7]), equipmentOwner: "นายวิชัย รักงาน", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "วางแผน", note: "" },
  { id: "T-260421", title: "ซ่อมแซมเสาไฟฟ้าล้มหลังพายุฤดูร้อน", date: "2026-04-21", departTime: "05:30", appointTime: "06:30", jobType: "ซ่อมแซมฉุกเฉิน", workArea: "ชลบุรี", targetPEA: "กฟฟ.ศรีราชา", areaStatus: "out", priority: "ด่วน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 041/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม B", vehicle: VEHICLES[0], equipment: eq(EQUIPMENT_POOL[0], EQUIPMENT_POOL[1], EQUIPMENT_POOL[3], EQUIPMENT_POOL[6]), equipmentOwner: "นายธวัช บุญมา", coordinator: "นายประยุทธ ศรีวงศ์", coordinatorPhone: "081-234-5602", status: "เสร็จสิ้น", note: "" },
  { id: "T-260428", title: "ติดตั้งมิเตอร์อัจฉริยะโครงการนำร่อง", date: "2026-04-28", departTime: "08:00", appointTime: "09:00", jobType: "ติดตั้งอุปกรณ์", workArea: "สมุทรปราการ", targetPEA: "กฟฟ.พานทอง", areaStatus: "out", priority: "ตามแผน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 045/2569", travelOrderStatus: "รออนุมัติ", team: "ทีม C", vehicle: VEHICLES[3], equipment: eq(EQUIPMENT_POOL[6], EQUIPMENT_POOL[7], EQUIPMENT_POOL[9]), equipmentOwner: "นายชาญณรงค์ ยิ้มแย้ม", coordinator: "นางสาวรัชนี พูนผล", coordinatorPhone: "081-234-5603", status: "วางแผน", note: "รอผลอนุมัติคำสั่งเดินทางจากต้นสังกัด" },

  // ----- พฤษภาคม -----
  { id: "T-260508", title: "บำรุงรักษาหม้อแปลงไฟฟ้าประจำปี", date: "2026-05-08", departTime: "07:00", appointTime: "08:00", jobType: "บำรุงรักษาระบบไฟฟ้า", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม A", vehicle: VEHICLES[2], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[2], EQUIPMENT_POOL[7]), equipmentOwner: "นายประสิทธิ์ มั่นคง", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "เสร็จสิ้น", note: "" },
  { id: "T-260520", title: "ปฏิบัติงาน Hotline ปรับปรุงจุดต่อสายชำรุด", date: "2026-05-20", departTime: "06:30", appointTime: "07:30", jobType: "ปฏิบัติงาน Hotline (มีไฟ)", workArea: "ระยอง", targetPEA: "กฟฟ.บางละมุง", areaStatus: "out", priority: "ตามแผน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 052/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม B", vehicle: VEHICLES[0], equipment: eq(EQUIPMENT_POOL[0], EQUIPMENT_POOL[1], EQUIPMENT_POOL[4], EQUIPMENT_POOL[5]), equipmentOwner: "นายสุริยา แสงทอง", coordinator: "นางสาวรัชนี พูนผล", coordinatorPhone: "081-234-5603", status: "วางแผน", note: "" },

  // ----- มิถุนายน -----
  { id: "T-260609", title: "ตรวจสอบระบบกราวด์สถานีไฟฟ้าย่อย", date: "2026-06-09", departTime: "08:00", appointTime: "09:00", jobType: "ตรวจสอบระบบ/PM", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม C", vehicle: VEHICLES[4], equipment: eq(EQUIPMENT_POOL[5], EQUIPMENT_POOL[7]), equipmentOwner: "นายบุญส่ง แก้วมณี", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "เสร็จสิ้น", note: "" },
  { id: "T-260624", title: "ซ่อมแซมหม้อแปลงไฟฟ้าขัดข้อง", date: "2026-06-24", departTime: "06:00", appointTime: "07:00", jobType: "ซ่อมแซมฉุกเฉิน", workArea: "ฉะเชิงเทรา", targetPEA: "กฟฟ.บ้านโพธิ์", areaStatus: "out", priority: "ด่วน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 060/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม A", vehicle: VEHICLES[1], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[3], EQUIPMENT_POOL[6], EQUIPMENT_POOL[9]), equipmentOwner: "นายอนุชา ทองดี", coordinator: "นายวิรัตน์ ชูเกียรติ", coordinatorPhone: "081-234-5604", status: "เสร็จสิ้น", note: "" },

  // ----- กรกฎาคม -----
  { id: "T-260707", title: "PM สายป้อน 22kV ก่อนฤดูฝน", date: "2026-07-07", departTime: "07:30", appointTime: "08:30", jobType: "ตรวจสอบระบบ/PM", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม B", vehicle: VEHICLES[2], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[2], EQUIPMENT_POOL[7]), equipmentOwner: "นายกิตติ ศรีสุข", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "เสร็จสิ้น", note: "" },
  { id: "T-260716", title: "ปฏิบัติงาน Hotline เปลี่ยนสายเมนชำรุดจากพายุ", date: "2026-07-16", departTime: "06:00", appointTime: "07:00", jobType: "ปฏิบัติงาน Hotline (มีไฟ)", workArea: "ระยอง", targetPEA: "กฟฟ.บางละมุง", areaStatus: "out", priority: "ด่วน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 071/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม C", vehicle: VEHICLES[0], equipment: eq(EQUIPMENT_POOL[0], EQUIPMENT_POOL[1], EQUIPMENT_POOL[4], EQUIPMENT_POOL[5]), equipmentOwner: "นายชาญณรงค์ ยิ้มแย้ม", coordinator: "นางสาวรัชนี พูนผล", coordinatorPhone: "081-234-5603", status: "เสร็จสิ้น", note: "" },

  // ----- สิงหาคม -----
  { id: "T-260803", title: "บำรุงรักษาระบบไฟฟ้าอาคารสำนักงาน", date: "2026-08-03", departTime: "08:00", appointTime: "09:00", jobType: "บำรุงรักษาระบบไฟฟ้า", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม A", vehicle: VEHICLES[2], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[2], EQUIPMENT_POOL[7]), equipmentOwner: "นายวิชัย รักงาน", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "เสร็จสิ้น", note: "" },
  { id: "T-260806", title: "ติดตั้งหม้อแปลงทดแทนจุดขยายเขต", date: "2026-08-06", departTime: "07:00", appointTime: "08:00", jobType: "ติดตั้งอุปกรณ์", workArea: "ปราจีนบุรี", targetPEA: "กฟฟ.พนัสนิคม", areaStatus: "out", priority: "ตามแผน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 084/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม B", vehicle: VEHICLES[3], equipment: eq(EQUIPMENT_POOL[6], EQUIPMENT_POOL[7], EQUIPMENT_POOL[9]), equipmentOwner: "นายธวัช บุญมา", coordinator: "นายวิรัตน์ ชูเกียรติ", coordinatorPhone: "081-234-5604", status: "วางแผน", note: "" },
  { id: "T-260811", title: "ประสานงานเตรียมพื้นที่ก่อนวันหยุดวันแม่", date: "2026-08-11", departTime: "08:30", appointTime: "09:30", jobType: "ประสานงานหน่วยงานภายนอก", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม C", vehicle: VEHICLES[4], equipment: eq(EQUIPMENT_POOL[7]), equipmentOwner: "นายเอกชัย มีชัย", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "เสร็จสิ้น", note: "" },
  { id: "T-260819", title: "ซ่อมแซมฉุกเฉินไฟฟ้าดับเป็นวงกว้าง", date: "2026-08-19", departTime: "05:30", appointTime: "06:15", jobType: "ซ่อมแซมฉุกเฉิน", workArea: "ชลบุรี", targetPEA: "กฟฟ.ศรีราชา", areaStatus: "out", priority: "ด่วน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 089/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม A", vehicle: VEHICLES[0], equipment: eq(EQUIPMENT_POOL[0], EQUIPMENT_POOL[1], EQUIPMENT_POOL[3], EQUIPMENT_POOL[6]), equipmentOwner: "นายประสิทธิ์ มั่นคง", coordinator: "นายประยุทธ ศรีวงศ์", coordinatorPhone: "081-234-5602", status: "เสร็จสิ้น", note: "ไฟฟ้าดับกระทบ 3 ตำบล เร่งแก้ไขภายในวันเดียว" },
  { id: "T-260826", title: "ตรวจสอบระบบป้องกันสายส่งประจำเดือน", date: "2026-08-26", departTime: "08:00", appointTime: "09:00", jobType: "ตรวจสอบระบบ/PM", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม B", vehicle: VEHICLES[4], equipment: eq(EQUIPMENT_POOL[5], EQUIPMENT_POOL[7]), equipmentOwner: "นายสุริยา แสงทอง", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "วางแผน", note: "" },

  // ----- กันยายน (เดือนปัจจุบัน - ข้อมูลหนาแน่นเพื่อสาธิต) -----
  { id: "T-260901", title: "PM สายป้อนหลักโรงไฟฟ้าบางปะกง", date: "2026-09-01", departTime: "07:30", appointTime: "08:30", jobType: "ตรวจสอบระบบ/PM", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม A", vehicle: VEHICLES[2], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[2], EQUIPMENT_POOL[7]), equipmentOwner: "นายวิชัย รักงาน", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "เสร็จสิ้น", note: "" },
  { id: "T-260902A", title: "ปฏิบัติงาน Hotline ปรับปรุงจุดต่อสาย ถ.สุขุมวิท", date: "2026-09-02", departTime: "06:30", appointTime: "07:30", jobType: "ปฏิบัติงาน Hotline (มีไฟ)", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม B", vehicle: VEHICLES[0], equipment: eq(EQUIPMENT_POOL[0], EQUIPMENT_POOL[1], EQUIPMENT_POOL[2], EQUIPMENT_POOL[4]), equipmentOwner: "นายธวัช บุญมา", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "กำลังดำเนินการ", note: "งานตามแผนบำรุงรักษาประจำสัปดาห์" },
  { id: "T-260902B", title: "ตรวจสอบมิเตอร์และจุดต่อ กฟฟ.พนัสนิคม", date: "2026-09-02", departTime: "07:00", appointTime: "08:00", jobType: "ตรวจสอบระบบ/PM", workArea: "ฉะเชิงเทรา", targetPEA: "กฟฟ.พนัสนิคม", areaStatus: "out", priority: "ตามแผน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 092/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม C", vehicle: VEHICLES[3], equipment: eq(EQUIPMENT_POOL[6], EQUIPMENT_POOL[7], EQUIPMENT_POOL[9]), equipmentOwner: "นายบุญส่ง แก้วมณี", coordinator: "นายวิรัตน์ ชูเกียรติ", coordinatorPhone: "081-234-5604", status: "วางแผน", note: "" },
  { id: "T-260902C", title: "ซ่อมแซมฉุกเฉินหม้อแปลงกระโดด", date: "2026-09-02", departTime: "13:30", appointTime: "14:15", jobType: "ซ่อมแซมฉุกเฉิน", workArea: "ชลบุรี", targetPEA: "กฟฟ.ศรีราชา", areaStatus: "out", priority: "ด่วน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 093/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม A", vehicle: VEHICLES[1], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[3], EQUIPMENT_POOL[6]), equipmentOwner: "นายอนุชา ทองดี", coordinator: "นายประยุทธ ศรีวงศ์", coordinatorPhone: "081-234-5602", status: "กำลังดำเนินการ", note: "แจ้งเหตุด่วนจากศูนย์ควบคุม" },
  { id: "T-260904", title: "ติดตั้งเซนเซอร์ตรวจวัดโหลดสายป้อน", date: "2026-09-04", departTime: "08:00", appointTime: "09:00", jobType: "ติดตั้งอุปกรณ์", workArea: "สมุทรปราการ", targetPEA: "กฟฟ.พานทอง", areaStatus: "out", priority: "ตามแผน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 094/2569", travelOrderStatus: "รออนุมัติ", team: "ทีม B", vehicle: VEHICLES[3], equipment: eq(EQUIPMENT_POOL[6], EQUIPMENT_POOL[7], EQUIPMENT_POOL[9]), equipmentOwner: "นายกิตติ ศรีสุข", coordinator: "นางสาวรัชนี พูนผล", coordinatorPhone: "081-234-5603", status: "วางแผน", note: "" },
  { id: "T-260908", title: "บำรุงรักษาสายป้อนประจำสัปดาห์ที่ 2", date: "2026-09-08", departTime: "07:30", appointTime: "08:30", jobType: "บำรุงรักษาระบบไฟฟ้า", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม C", vehicle: VEHICLES[2], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[2], EQUIPMENT_POOL[7]), equipmentOwner: "นายเอกชัย มีชัย", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "วางแผน", note: "" },
  { id: "T-260910", title: "ปฏิบัติงาน Hotline ขยายเขตสายป้อนใหม่", date: "2026-09-10", departTime: "06:45", appointTime: "08:00", jobType: "ปฏิบัติงาน Hotline (มีไฟ)", workArea: "ระยอง", targetPEA: "กฟฟ.บางละมุง", areaStatus: "out", priority: "ตามแผน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 095/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม A", vehicle: VEHICLES[0], equipment: eq(EQUIPMENT_POOL[0], EQUIPMENT_POOL[1], EQUIPMENT_POOL[4], EQUIPMENT_POOL[5]), equipmentOwner: "นายวิชัย รักงาน", coordinator: "นางสาวรัชนี พูนผล", coordinatorPhone: "081-234-5603", status: "วางแผน", note: "" },
  { id: "T-260915", title: "ตรวจสอบระบบไฟฟ้าแสงสว่างถนนสายหลัก", date: "2026-09-15", departTime: "18:00", appointTime: "19:00", jobType: "ตรวจสอบระบบ/PM", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม B", vehicle: VEHICLES[4], equipment: eq(EQUIPMENT_POOL[7], EQUIPMENT_POOL[9]), equipmentOwner: "นายธวัช บุญมา", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "วางแผน", note: "ปฏิบัติงานช่วงกลางคืนเพื่อลดผลกระทบผู้ใช้ไฟ" },
  { id: "T-260918", title: "ประสานงานร่วมตรวจพื้นที่ก่อสร้างสายส่งใหม่", date: "2026-09-18", departTime: "08:30", appointTime: "09:30", jobType: "ประสานงานหน่วยงานภายนอก", workArea: "ฉะเชิงเทรา", targetPEA: "กฟฟ.บ้านโพธิ์", areaStatus: "out", priority: "ตามแผน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 096/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม C", vehicle: VEHICLES[4], equipment: eq(EQUIPMENT_POOL[6], EQUIPMENT_POOL[9]), equipmentOwner: "นายพิชัย รุ่งเรือง", coordinator: "นายวิรัตน์ ชูเกียรติ", coordinatorPhone: "081-234-5604", status: "วางแผน", note: "" },
  { id: "T-260922", title: "ซ่อมแซมฉุกเฉินเสาไฟฟ้าเอียงจากอุบัติเหตุ", date: "2026-09-22", departTime: "09:15", appointTime: "10:00", jobType: "ซ่อมแซมฉุกเฉิน", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ด่วน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม A", vehicle: VEHICLES[1], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[3], EQUIPMENT_POOL[6]), equipmentOwner: "นายประสิทธิ์ มั่นคง", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "วางแผน", note: "รถชนเสาไฟฟ้า ประสาน สภ.ท้องที่แล้ว" },
  { id: "T-260928", title: "PM หม้อแปลงจำหน่ายรอบเดือนกันยายน", date: "2026-09-28", departTime: "07:30", appointTime: "08:30", jobType: "ตรวจสอบระบบ/PM", workArea: "ชลบุรี", targetPEA: "กฟฟ.ศรีราชา", areaStatus: "out", priority: "ตามแผน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 097/2569", travelOrderStatus: "รออนุมัติ", team: "ทีม B", vehicle: VEHICLES[2], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[2], EQUIPMENT_POOL[7]), equipmentOwner: "นายสุริยา แสงทอง", coordinator: "นายประยุทธ ศรีวงศ์", coordinatorPhone: "081-234-5602", status: "วางแผน", note: "" },

  // ----- ตุลาคม -----
  { id: "T-261005", title: "บำรุงรักษาระบบไฟฟ้าประจำเดือน", date: "2026-10-05", departTime: "07:30", appointTime: "08:30", jobType: "บำรุงรักษาระบบไฟฟ้า", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม A", vehicle: VEHICLES[2], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[2], EQUIPMENT_POOL[7]), equipmentOwner: "นายวิชัย รักงาน", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "วางแผน", note: "" },
  { id: "T-261014", title: "ปฏิบัติงาน Hotline เปลี่ยนอุปกรณ์ตัดตอนอัตโนมัติ", date: "2026-10-14", departTime: "06:30", appointTime: "07:30", jobType: "ปฏิบัติงาน Hotline (มีไฟ)", workArea: "ระยอง", targetPEA: "กฟฟ.บางละมุง", areaStatus: "out", priority: "ตามแผน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 105/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม C", vehicle: VEHICLES[0], equipment: eq(EQUIPMENT_POOL[0], EQUIPMENT_POOL[1], EQUIPMENT_POOL[4], EQUIPMENT_POOL[5]), equipmentOwner: "นายพิชัย รุ่งเรือง", coordinator: "นางสาวรัชนี พูนผล", coordinatorPhone: "081-234-5603", status: "วางแผน", note: "" },
  { id: "T-261022", title: "เตรียมความพร้อมระบบไฟฟ้าก่อนวันปิยมหาราช", date: "2026-10-22", departTime: "08:00", appointTime: "09:00", jobType: "ตรวจสอบระบบ/PM", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม B", vehicle: VEHICLES[4], equipment: eq(EQUIPMENT_POOL[7]), equipmentOwner: "นายกิตติ ศรีสุข", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "วางแผน", note: "" },
  { id: "T-261029", title: "ซ่อมแซมฉุกเฉินไฟฟ้าดับจากต้นไม้ล้มทับสาย", date: "2026-10-29", departTime: "06:00", appointTime: "07:00", jobType: "ซ่อมแซมฉุกเฉิน", workArea: "ฉะเชิงเทรา", targetPEA: "กฟฟ.บ้านโพธิ์", areaStatus: "out", priority: "ด่วน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 110/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม A", vehicle: VEHICLES[1], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[3], EQUIPMENT_POOL[6], EQUIPMENT_POOL[9]), equipmentOwner: "นายอนุชา ทองดี", coordinator: "นายวิรัตน์ ชูเกียรติ", coordinatorPhone: "081-234-5604", status: "เสร็จสิ้น", note: "" },

  // ----- พฤศจิกายน -----
  { id: "T-261110", title: "ตรวจสอบระบบป้องกันสายส่งประจำเดือน", date: "2026-11-10", departTime: "08:00", appointTime: "09:00", jobType: "ตรวจสอบระบบ/PM", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม C", vehicle: VEHICLES[4], equipment: eq(EQUIPMENT_POOL[5], EQUIPMENT_POOL[7]), equipmentOwner: "นายบุญส่ง แก้วมณี", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "วางแผน", note: "" },
  { id: "T-261124", title: "ปฏิบัติงาน Hotline ปรับปรุงจุดต่อสายเมน", date: "2026-11-24", departTime: "06:45", appointTime: "08:00", jobType: "ปฏิบัติงาน Hotline (มีไฟ)", workArea: "สมุทรปราการ", targetPEA: "กฟฟ.พานทอง", areaStatus: "out", priority: "ตามแผน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 118/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม B", vehicle: VEHICLES[0], equipment: eq(EQUIPMENT_POOL[0], EQUIPMENT_POOL[1], EQUIPMENT_POOL[4]), equipmentOwner: "นายธวัช บุญมา", coordinator: "นางสาวรัชนี พูนผล", coordinatorPhone: "081-234-5603", status: "วางแผน", note: "" },

  // ----- ธันวาคม -----
  { id: "T-261204", title: "เตรียมความพร้อมระบบไฟฟ้าก่อนวันพ่อแห่งชาติ", date: "2026-12-04", departTime: "08:00", appointTime: "09:00", jobType: "ตรวจสอบระบบ/PM", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ตามแผน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม A", vehicle: VEHICLES[2], equipment: eq(EQUIPMENT_POOL[7]), equipmentOwner: "นายวิชัย รักงาน", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "วางแผน", note: "" },
  { id: "T-261215", title: "บำรุงรักษาสายป้อนก่อนสิ้นปี", date: "2026-12-15", departTime: "07:30", appointTime: "08:30", jobType: "บำรุงรักษาระบบไฟฟ้า", workArea: "ชลบุรี", targetPEA: "กฟฟ.ศรีราชา", areaStatus: "out", priority: "ตามแผน", travelOrder: true, travelOrderNo: "คส.นอกพื้นที่ 127/2569", travelOrderStatus: "อนุมัติแล้ว", team: "ทีม C", vehicle: VEHICLES[2], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[2], EQUIPMENT_POOL[7]), equipmentOwner: "นายพิชัย รุ่งเรือง", coordinator: "นายประยุทธ ศรีวงศ์", coordinatorPhone: "081-234-5602", status: "วางแผน", note: "" },
  { id: "T-261228", title: "ซ่อมแซมฉุกเฉินระบบไฟฟ้าก่อนปีใหม่", date: "2026-12-28", departTime: "07:00", appointTime: "08:00", jobType: "ซ่อมแซมฉุกเฉิน", workArea: "บางปะกง", targetPEA: "กฟฟ.บางปะกง", areaStatus: "in", priority: "ด่วน", travelOrder: false, travelOrderNo: "-", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "ทีม B", vehicle: VEHICLES[1], equipment: eq(EQUIPMENT_POOL[1], EQUIPMENT_POOL[3], EQUIPMENT_POOL[6]), equipmentOwner: "นายกิตติ ศรีสุข", coordinator: "นายสมพงษ์ เจริญสุข", coordinatorPhone: "081-234-5601", status: "วางแผน", note: "" }
];
