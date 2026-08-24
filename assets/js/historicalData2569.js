/**
 * ข้อมูลอ้างอิงย้อนหลัง ปีงบประมาณ 2569 — Static, Read-only
 * ที่มา: training_plans_2569_claude_ready.json (แนบโดยผู้ใช้)
 * ตัดฟิลด์ให้เหลือเฉพาะที่จำเป็นสำหรับกราฟเปรียบเทียบ 2569-2570 และตาราง 3 คอลัมน์
 * (ชื่อหลักสูตร/งบประมาณ/หน่วยงานที่เสนอ) — ไม่ใช่ตารางฐานข้อมูล ไม่ผ่าน importer/admin_import_dataset
 * ใดๆ ทั้งสิ้น จึงไม่มีทางกระทบชุดข้อมูลปี 2570 ที่ใช้งานจริง
 * divisionGroup: ถ้า division_primary ต้นทางเป็น "-" (ส่วนกลางฝ่าย ไม่ผูกกับกองใดกองหนึ่ง)
 * จะใช้ department_current (ระดับแผนก) แทน ตามที่ผู้ใช้ยืนยัน — ไม่มีการเปลี่ยนชื่อหน่วยงานต้นทางอื่นใด
 */
const HISTORICAL_2569 = {
  "fiscalYear": 2569,
  "totalCount": 36,
  "records": [
    {
      "id": "FY2569-001",
      "courseName": "Basics of Corrosion and Materials Selection for Plant Engineers",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 39000
    },
    {
      "id": "FY2569-002",
      "courseName": "Boiler tube Failure Analysis",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 7200
    },
    {
      "id": "FY2569-003",
      "courseName": "Certified Infrared Thermographer Level I",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 37450
    },
    {
      "id": "FY2569-004",
      "courseName": "Citizen First Responder",
      "divisionGroup": "หรปก-ฟ.",
      "budgetBaht": 6000
    },
    {
      "id": "FY2569-005",
      "courseName": "Condition Based Maintenance (CBM)",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 6000
    },
    {
      "id": "FY2569-006",
      "courseName": "Dashboard Design with Power BI : Basic",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 0
    },
    {
      "id": "FY2569-007",
      "courseName": "Dashboard Design with Power BI : Intermediate - Advance",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 0
    },
    {
      "id": "FY2569-008",
      "courseName": "Effective Management for Innovation",
      "divisionGroup": "กบส-ห.",
      "budgetBaht": 50000
    },
    {
      "id": "FY2569-009",
      "courseName": "Failure Mode and Effect Analysis : FMEA (4th Edition)",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 33000
    },
    {
      "id": "FY2569-010",
      "courseName": "GE DCS Advance Maintenance & TA Level",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 246200
    },
    {
      "id": "FY2569-011",
      "courseName": "Home Defense Lv2",
      "divisionGroup": "หรปก-ฟ.",
      "budgetBaht": 3000
    },
    {
      "id": "FY2569-012",
      "courseName": "O-ELX20301; Excitation - EX2100e Generator Excitation Maintenance (Advanced)",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 224907.35
    },
    {
      "id": "FY2569-013",
      "courseName": "Ues of force",
      "divisionGroup": "หรปก-ฟ.",
      "budgetBaht": 5000
    },
    {
      "id": "FY2569-014",
      "courseName": "Gas Turbine - Maintenance for H-Class (Advanced)",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 280400
    },
    {
      "id": "FY2569-015",
      "courseName": "Welding Control ตาม ASME IX",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 11000
    },
    {
      "id": "FY2569-016",
      "courseName": "เทคนิคการตรวจสอบสลิงและอุปกรณ์ช่วยยก",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 16500
    },
    {
      "id": "FY2569-017",
      "courseName": "เทคนิคการสอบสวนทางวินัยและการลงโทษพนักงาน",
      "divisionGroup": "กบส-ห.",
      "budgetBaht": 9000
    },
    {
      "id": "FY2569-018",
      "courseName": "เสวนาด้านความปลอดภัย อาชีวอนามัย และสภาพแวดล้อมในการทำงาน",
      "divisionGroup": "หปอก-ฟ.",
      "budgetBaht": 25000
    },
    {
      "id": "FY2569-019",
      "courseName": "โรคจากการประกอบอาชีพและสิ่งแวดล้อม",
      "divisionGroup": "หปอก-ฟ.",
      "budgetBaht": 0
    },
    {
      "id": "FY2569-020",
      "courseName": "กลยุทธ์การควบคุมอุปกรณ์คลังอะไหล่และซ่อมบำรุงรักษา",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 17500
    },
    {
      "id": "FY2569-021",
      "courseName": "การใช้ AI เพื่องานบำรุงรักษา",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 6000
    },
    {
      "id": "FY2569-022",
      "courseName": "การจัดการกระบวนงานจ้างเหมา - การเขียน TOR การควบคุมงาน และ Case study",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 6000
    },
    {
      "id": "FY2569-023",
      "courseName": "การตรวจสอบและทดสอบระบบเครื่องสูบน้ำดับเพลิง (Fire Pump) (ภาคทฤษฎี และภาคปฏิบัติ)",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 16000
    },
    {
      "id": "FY2569-024",
      "courseName": "การบริหารงานซ่อมบำรุงแบบมืออาชีพ",
      "divisionGroup": "กบรก3-ฟ.",
      "budgetBaht": 38500
    },
    {
      "id": "FY2569-025",
      "courseName": "การประเมินอายุเครื่องกังหันไอน้ำ (Steam Turbine Remaining Life Assessment)",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 0
    },
    {
      "id": "FY2569-026",
      "courseName": "การประเมินอายุหม้อไอน้ำ(Boiler Remaining Life Assessment)",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 20000
    },
    {
      "id": "FY2569-027",
      "courseName": "การวางแผนเครื่องจักรกลเชิงป้องกัน",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 18000
    },
    {
      "id": "FY2569-028",
      "courseName": "การวิเคราะห์ความเสียหายจากการกัดกร่อน (Corrosion Failure Analysis Workshop)",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 15800
    },
    {
      "id": "FY2569-029",
      "courseName": "การวิเคราะห์ผลการทดสอบคุณภาพน้ำมันหล่อลื่นใช้งานแล้ว สำหรับการบำรุงรักษาเชิงป้องกัน",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 3000
    },
    {
      "id": "FY2569-030",
      "courseName": "ความเสียหายจากการเชื่อม: การวิเคราะห์ สาเหตุ และการตรวจสอบโดยไม่ทำลาย",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 7900
    },
    {
      "id": "FY2569-031",
      "courseName": "ความปลอดภัยในการทำงานกับเครื่องจักร เครื่องปั๊มโลหะ เครื่องเชื่อมไฟฟ้าให้กับผู้ปฏิบัติงาน",
      "divisionGroup": "กบรก1-ฟ.",
      "budgetBaht": 5000
    },
    {
      "id": "FY2569-032",
      "courseName": "จิตวิทยาในการบริหารและพัฒนาทรัพยากรบุคคล",
      "divisionGroup": "กบส-ห.",
      "budgetBaht": 11000
    },
    {
      "id": "FY2569-033",
      "courseName": "ระบบไฮดรอลิกขั้นสูง",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 28000
    },
    {
      "id": "FY2569-034",
      "courseName": "การประยุกต์ใช้หลักเศรษฐกิจหมุนเวียนในองค์กรตามแนวทางมาตรฐาน BS 8001 : 2017 และแนวทางการใช้หลักการเศรษฐกิจหมุนเวียนในองค์กร มตช. 2-2562",
      "divisionGroup": "หสลก-ฟ.",
      "budgetBaht": 19260
    },
    {
      "id": "FY2569-035",
      "courseName": "Bently Nevada 3500 Machinery Diagnostics Methodology",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 99750
    },
    {
      "id": "FY2569-036",
      "courseName": "Bently Nevada 3500 Operation & Maintenance",
      "divisionGroup": "กบรก2-ฟ.",
      "budgetBaht": 62000
    }
  ]
};
