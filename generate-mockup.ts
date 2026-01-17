import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
const outputPath = path.join(process.cwd(), 'storage', 'reports', 'mockup-inspection-report.pdf');

// Ensure directory exists
const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

const pageWidth = doc.page.width - 80;
const startX = 40;

// Company header in top right
const logoPath = path.join(process.cwd(), 'storage/logos/bd36412d-b242-4490-85ba-2912fe698433.png');
if (fs.existsSync(logoPath)) {
  doc.image(logoPath, startX, 20, { width: 100, height: 50, fit: [100, 50] });
}

// Company info on right
doc.fontSize(11).font('Helvetica-Bold').text('KNOWLAND CONSTRUCTION', 340, 25, { width: 220, align: 'right' });
doc.fontSize(9).font('Helvetica').text('SERVICES', 340, 38, { width: 220, align: 'right' });
doc.fontSize(8).text('1458 E 33rd St', 340, 52, { width: 220, align: 'right' });
doc.fontSize(8).text('Signal Hill, CA 90755', 340, 62, { width: 220, align: 'right' });
doc.fontSize(8).text('(916) 245-8642', 340, 76, { width: 220, align: 'right' });
doc.fontSize(8).text('info@knowlandinc.com', 340, 86, { width: 220, align: 'right' });

// Form header grid
doc.y = 105;
const gridTop = doc.y;

// Draw the form fields grid
doc.strokeColor('#000').lineWidth(0.5);

// DCN # box
doc.rect(350, gridTop, 100, 28).stroke();
doc.fontSize(7).font('Helvetica').text('DCN #', 352, gridTop + 2);
doc.fontSize(9).font('Helvetica-Bold').text('171750-D25', 352, gridTop + 12);

// Report No. box
doc.rect(450, gridTop, 112, 28).stroke();
doc.fontSize(7).font('Helvetica').text('Report No.', 452, gridTop + 2);
doc.fontSize(9).font('Helvetica-Bold').text('1', 520, gridTop + 12);

// Row 2: DSA File No., DSA App No.
doc.rect(350, gridTop + 28, 100, 28).stroke();
doc.fontSize(7).text('DSA File No.', 352, gridTop + 30);
doc.fontSize(9).font('Helvetica-Bold').text('24-H01', 352, gridTop + 42);

doc.rect(450, gridTop + 28, 112, 28).stroke();
doc.fontSize(7).font('Helvetica').text('DSA App No.', 452, gridTop + 30);
doc.fontSize(9).font('Helvetica-Bold').text('03-123456', 480, gridTop + 42);

// SPECIAL INSPECTION REPORT title
doc.fontSize(14).font('Helvetica-Bold').text('SPECIAL INSPECTION REPORT', startX, gridTop + 20, { width: 280 });

// Row 3: Job No., Date, Time
doc.rect(350, gridTop + 56, 60, 24).stroke();
doc.fontSize(7).font('Helvetica').text('Job No.', 352, gridTop + 58);
doc.fontSize(9).font('Helvetica-Bold').text('25-001', 352, gridTop + 68);

doc.rect(410, gridTop + 56, 70, 24).stroke();
doc.fontSize(7).font('Helvetica').text('Date', 412, gridTop + 58);
doc.fontSize(9).font('Helvetica-Bold').text('01/17/26', 412, gridTop + 68);

doc.rect(480, gridTop + 56, 82, 24).stroke();
doc.fontSize(7).font('Helvetica').text('Time', 482, gridTop + 58);
doc.fontSize(9).font('Helvetica-Bold').text('8:00 AM', 482, gridTop + 68);

// DSA notice
doc.y = gridTop + 85;
doc.fontSize(7).font('Helvetica-Oblique').fillColor('#333')
  .text('This form is for use on DSA projects only. Special Inspection Reports must be distributed to parties listed below within 14 days of inspection.', startX, doc.y, { width: pageWidth });
doc.fillColor('#000');

// Type of Inspection section
doc.y += 18;
const inspectionY = doc.y;
doc.fontSize(8).font('Helvetica-Bold').text('TYPE OF', startX, inspectionY);
doc.text('INSPECTION', startX, inspectionY + 10);
doc.text('PERFORMED', startX, inspectionY + 20);

// Checkboxes for inspection types
const checkSize = 8;
const checkY = inspectionY;
const col1X = 100;
const col2X = 250;
const col3X = 410;

// Column 1
doc.rect(col1X, checkY, checkSize, checkSize).stroke();
doc.fontSize(8).font('Helvetica').text('Reinforced Concrete', col1X + 12, checkY);
doc.rect(col1X, checkY + 14, checkSize, checkSize).stroke();
doc.text('Prestressed Concrete', col1X + 12, checkY + 14);
doc.rect(col1X, checkY + 28, checkSize, checkSize).stroke();
doc.text('Reinforced Masonry', col1X + 12, checkY + 28);

// Column 2
doc.rect(col2X, checkY, checkSize, checkSize).fillAndStroke('#000', '#000');
doc.fontSize(8).font('Helvetica-Bold').text('Structural Steel', col2X + 12, checkY);
doc.font('Helvetica');
doc.rect(col2X, checkY + 14, checkSize, checkSize).stroke();
doc.text('Fire Proofing', col2X + 12, checkY + 14);
doc.rect(col2X, checkY + 28, checkSize, checkSize).stroke();
doc.text('Shotcrete', col2X + 12, checkY + 28);

// Column 3
doc.rect(col3X, checkY, checkSize, checkSize).stroke();
doc.text('Batch Plant', col3X + 12, checkY);
doc.rect(col3X, checkY + 14, checkSize, checkSize).stroke();
doc.text('Drilled in Anchors', col3X + 12, checkY + 14);
doc.rect(col3X, checkY + 28, checkSize, checkSize).stroke();
doc.text('Other ___________', col3X + 12, checkY + 28);

// Project details section
doc.y = inspectionY + 52;
const detailsY = doc.y;

// Project Address row
doc.strokeColor('#000').lineWidth(0.5);
doc.rect(startX, detailsY, 300, 20).stroke();
doc.fontSize(7).text('Project Address', startX + 2, detailsY + 2);
doc.fontSize(9).font('Helvetica-Bold').text('1234 Main Street', startX + 75, detailsY + 6);

doc.rect(startX + 300, detailsY, 232, 20).stroke();
doc.fontSize(7).font('Helvetica').text('City', startX + 302, detailsY + 2);
doc.fontSize(9).font('Helvetica-Bold').text('Signal Hill, CA 90755', startX + 330, detailsY + 6);

// Project Name row
doc.rect(startX, detailsY + 20, 300, 20).stroke();
doc.fontSize(7).font('Helvetica').text('Project Name', startX + 2, detailsY + 22);
doc.fontSize(9).font('Helvetica-Bold').text('Sample Construction Project', startX + 75, detailsY + 26);

doc.rect(startX + 300, detailsY + 20, 232, 20).stroke();
doc.fontSize(7).font('Helvetica').text("Special Inspector's Name", startX + 302, detailsY + 22);
doc.fontSize(9).font('Helvetica-Bold').text('Austin Knowland', startX + 410, detailsY + 26);

// Architect / Engineer row
doc.rect(startX, detailsY + 40, 266, 20).stroke();
doc.fontSize(7).font('Helvetica').text('Architect', startX + 2, detailsY + 42);
doc.fontSize(9).font('Helvetica-Bold').text('ABC Architects', startX + 50, detailsY + 46);

doc.rect(startX + 266, detailsY + 40, 266, 20).stroke();
doc.fontSize(7).font('Helvetica').text('Engineer', startX + 268, detailsY + 42);
doc.fontSize(9).font('Helvetica-Bold').text('XYZ Engineering', startX + 320, detailsY + 46);

// Tests Performed section
doc.y = detailsY + 72;
doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('Tests Performed', startX, doc.y);
doc.y += 14;

// Tests table header
const testsY = doc.y;
doc.rect(startX, testsY, 130, 18).fillAndStroke('#e5e7eb', '#000');
doc.rect(startX + 130, testsY, 80, 18).fillAndStroke('#e5e7eb', '#000');
doc.rect(startX + 210, testsY, 100, 18).fillAndStroke('#e5e7eb', '#000');
doc.rect(startX + 310, testsY, 222, 18).fillAndStroke('#e5e7eb', '#000');

doc.fillColor('#000').fontSize(7).font('Helvetica-Bold');
doc.text('TYPE OF SAMPLE', startX + 5, testsY + 5);
doc.text('SLUMP', startX + 140, testsY + 5);
doc.text('QUANTITY IN SET', startX + 215, testsY + 5);
doc.text('ADDITIONAL REMARKS', startX + 320, testsY + 5);

// Empty test rows
for (let i = 0; i < 2; i++) {
  const rowY = testsY + 18 + (i * 16);
  doc.rect(startX, rowY, 130, 16).stroke();
  doc.rect(startX + 130, rowY, 80, 16).stroke();
  doc.rect(startX + 210, rowY, 100, 16).stroke();
  doc.rect(startX + 310, rowY, 222, 16).stroke();
}

// Inspection Summary section
doc.y = testsY + 55;
doc.fontSize(8).font('Helvetica-Bold').text('INSPECTION SUMMARY', startX, doc.y);
doc.fontSize(6).font('Helvetica').text(' - LOCATIONS OF WORK INSPECTED, TEST SAMPLES TAKEN, WORK REJECTED, JOB PROBLEMS, REMARKS', startX + 105, doc.y + 1);
doc.y += 12;

// Summary box
const summaryY = doc.y;
doc.rect(startX, summaryY, pageWidth, 135).stroke();

doc.fontSize(9).font('Helvetica').text(
  '(Sample Construction Project - Daily Inspection Report) IR # 001\n\n' +
  'Arrived on-site at 8:00 AM for visual inspection of the following work:\n\n' +
  'Material ID:\n' +
  '1). Structural Steel Connections - W12x26 beams\n' +
  '   Connection types: Bolted moment connections\n' +
  '   All connections inspected per approved drawings\n\n' +
  '2). Anchor Bolt Installation\n' +
  '   Verified embedment depth and spacing per specifications\n\n' +
  'Weather: Clear, 72°F    |    Work performed by: ABC Steel Contractors (8 workers)',
  startX + 10, summaryY + 8, { width: pageWidth - 20 }
);

// Quality Control Checklist
doc.y = summaryY + 145;
const qcY = doc.y;
doc.fontSize(7).font('Helvetica-Bold').text('QUALITY CONTROL', startX, qcY);
doc.text('CHECKLIST', startX, qcY + 9);

// QC checkboxes
const qcCol1 = 85;
const qcCol2 = 225;
const qcCol3 = 380;

doc.rect(qcCol1, qcY, checkSize, checkSize).fillAndStroke('#000', '#000');
doc.fontSize(7).font('Helvetica').text('DSA-5 FORM COMPLETED', qcCol1 + 12, qcY);
doc.rect(qcCol1, qcY + 11, checkSize, checkSize).fillAndStroke('#000', '#000');
doc.text('ON TIME TO JOB', qcCol1 + 12, qcY + 11);
doc.rect(qcCol1, qcY + 22, checkSize, checkSize).fillAndStroke('#000', '#000');
doc.text('CHECKED APPLICATION/FILE NO.', qcCol1 + 12, qcY + 22);

doc.rect(qcCol2, qcY, checkSize, checkSize).fillAndStroke('#000', '#000');
doc.text('REVIEWED APPROVED PLAN', qcCol2 + 12, qcY);
doc.rect(qcCol2, qcY + 11, checkSize, checkSize).fillAndStroke('#000', '#000');
doc.text('REVIEWED SPECIFICATIONS', qcCol2 + 12, qcY + 11);
doc.rect(qcCol2, qcY + 22, checkSize, checkSize).fillAndStroke('#000', '#000');
doc.text('REVIEWED PREVIOUS REPORTS', qcCol2 + 12, qcY + 22);

doc.rect(qcCol3, qcY, checkSize, checkSize).stroke();
doc.text('TESTS PERFORMED PER SPECS', qcCol3 + 12, qcY);
doc.rect(qcCol3, qcY + 11, checkSize, checkSize).stroke();
doc.text('CORRECT NO. OF SAMPLES', qcCol3 + 12, qcY + 11);
doc.rect(qcCol3, qcY + 22, checkSize, checkSize).stroke();
doc.text('SAMPLES STORED SAFELY', qcCol3 + 12, qcY + 22);

// Compliance statements
doc.y = qcY + 40;
doc.fontSize(8).font('Helvetica').text('THE WORK INSPECTED', startX, doc.y);
doc.rect(startX + 100, doc.y - 2, checkSize, checkSize).fillAndStroke('#000', '#000');
doc.font('Helvetica-Bold').text('WAS', startX + 115, doc.y);
doc.font('Helvetica');
doc.rect(startX + 145, doc.y - 2, checkSize, checkSize).stroke();
doc.text('WAS NOT', startX + 158, doc.y);
doc.y += 10;
doc.text('IN ACCORDANCE WITH THE REQUIREMENTS OF THE DSA APPROVED DOCUMENTS', startX, doc.y);

// THE WORK INSPECTED MET row
doc.y += 18;
doc.fontSize(8).text('THE WORK INSPECTED', startX, doc.y);
doc.rect(startX + 100, doc.y - 2, checkSize, checkSize).fillAndStroke('#000', '#000');
doc.font('Helvetica-Bold').text('MET', startX + 115, doc.y);
doc.font('Helvetica');
doc.rect(startX + 145, doc.y - 2, checkSize, checkSize).stroke();
doc.text('DID NOT MEET', startX + 158, doc.y);
doc.y += 10;
doc.text('THE REQUIREMENTS OF THE DSA APPROVED DOCUMENTS', startX, doc.y);

// Signature section
doc.y += 20;
const sigY = doc.y;

// Time tracking boxes on right
doc.rect(350, sigY, 55, 26).stroke();
doc.fontSize(7).text('TIME IN', 352, sigY + 2);
doc.fontSize(9).font('Helvetica-Bold').text('8:00 AM', 352, sigY + 12);

doc.rect(405, sigY, 55, 26).stroke();
doc.fontSize(7).font('Helvetica').text('TIME OUT', 407, sigY + 2);
doc.fontSize(9).font('Helvetica-Bold').text('4:00 PM', 407, sigY + 12);

doc.rect(460, sigY, 45, 26).stroke();
doc.fontSize(7).font('Helvetica').text('REG HRS', 462, sigY + 2);
doc.fontSize(9).font('Helvetica-Bold').text('8', 475, sigY + 12);

doc.rect(505, sigY, 57, 26).stroke();
doc.fontSize(7).font('Helvetica').text('O.T. HRS', 507, sigY + 2);
doc.fontSize(9).font('Helvetica-Bold').text('0', 528, sigY + 12);

// Signature line
doc.fontSize(7).font('Helvetica').text('SIGNATURE OF SPECIAL INSPECTOR', startX, sigY + 28);
doc.moveTo(startX, sigY + 43).lineTo(startX + 200, sigY + 43).stroke();

// Footer
doc.y = doc.page.height - 32;
doc.fontSize(7).font('Helvetica').fillColor('#666')
  .text('CC: Architect, Engineer, Project Inspector, DSA Regional Office, School District', startX, doc.y);
doc.text('www.knowlandinc.com', 400, doc.y, { width: 160, align: 'right' });

doc.end();

writeStream.on('finish', () => {
  console.log('Mockup PDF generated at:', outputPath);
  console.log('Access at: /storage/reports/mockup-inspection-report.pdf');
});
