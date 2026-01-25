import PDFDocument from "pdfkit";
import { format, getDaysInMonth, getDay } from "date-fns";
import { DailyReport, Project, Contract, Company, UserProfile } from "@shared/schema";

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Calculate actual holiday dates that fall on specific weekdays (e.g., 3rd Monday)
function getHolidayRemarks(month: number, year: number): Record<string, string> {
  const holidays: Record<string, string> = {
    '01-01': "New Year's Day",
    '07-04': "Independence Day",
    '11-11': "Veterans Day",
    '12-25': "Christmas Day",
  };
  
  // MLK Day - 3rd Monday of January
  if (month === 1) {
    const mlkDay = getNthWeekdayOfMonth(year, 0, 1, 3); // 3rd Monday (1) of January (0)
    holidays[format(mlkDay, 'MM-dd')] = "MLK Day";
  }
  
  // Presidents Day - 3rd Monday of February
  if (month === 2) {
    const presidentsDay = getNthWeekdayOfMonth(year, 1, 1, 3);
    holidays[format(presidentsDay, 'MM-dd')] = "Presidents Day";
  }
  
  // Memorial Day - Last Monday of May
  if (month === 5) {
    const memorialDay = getLastWeekdayOfMonth(year, 4, 1);
    holidays[format(memorialDay, 'MM-dd')] = "Memorial Day";
  }
  
  // Labor Day - 1st Monday of September
  if (month === 9) {
    const laborDay = getNthWeekdayOfMonth(year, 8, 1, 1);
    holidays[format(laborDay, 'MM-dd')] = "Labor Day";
  }
  
  // Thanksgiving - 4th Thursday of November
  if (month === 11) {
    const thanksgiving = getNthWeekdayOfMonth(year, 10, 4, 4);
    holidays[format(thanksgiving, 'MM-dd')] = "Thanksgiving Day";
  }
  
  return holidays;
}

// Get nth occurrence of a weekday in a month (e.g., 3rd Monday)
function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  let dayOffset = weekday - firstWeekday;
  if (dayOffset < 0) dayOffset += 7;
  return new Date(year, month, 1 + dayOffset + (n - 1) * 7);
}

// Get last occurrence of a weekday in a month (e.g., last Monday)
function getLastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const lastWeekday = lastDay.getDay();
  let dayOffset = lastWeekday - weekday;
  if (dayOffset < 0) dayOffset += 7;
  return new Date(year, month + 1, -dayOffset);
}

interface TimesheetData {
  companyName: string;
  companyLogoBuffer?: Buffer;
  inspectorName: string;
  districtName: string;
  month: number;
  year: number;
  projects: {
    projectName: string;
    dsaNumber?: string;
    fileNumber?: string;
    regularRate?: number;
    overtimeRate?: number;
    premiumRate?: number;
    dailyHours: Record<number, { reg: number; ot: number; prm: number }>;
  }[];
  estPercentComplete?: string;
  estCompletionDate?: string;
}

export async function generateTimesheetPdf(data: TimesheetData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Portrait orientation to match template
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'portrait',
      margin: 20,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 40;
    const startX = 20;
    const daysInMonth = getDaysInMonth(new Date(data.year, data.month - 1));

    // Ensure we always have 5 project columns (pad with empty if needed)
    const projectCount = 5;
    const projects = [...data.projects.slice(0, 5)];
    while (projects.length < 5) {
      projects.push({ projectName: '', dailyHours: {} });
    }

    // Column widths for portrait layout
    const dateColWidth = 72;
    const remarksColWidth = 75;
    const projectAreaWidth = pageWidth - dateColWidth - remarksColWidth;
    const projectColWidth = projectAreaWidth / projectCount;
    const hourColWidth = projectColWidth / 3;

    // Row heights - slightly smaller for portrait to fit all 31 days
    const headerRow1Height = 11;
    const headerRow2Height = 11;
    const headerRow3Height = 11;
    const subHeaderHeight = 11;
    const rowHeight = 11;
    
    // Colors and line widths
    const sectionBorderColor = '#000000';
    const thinLineWidth = 0.5;
    const thickLineWidth = 1.5;

    doc.strokeColor(sectionBorderColor).lineWidth(thinLineWidth);

    // ============ HEADER SECTION ============
    let y = 20;
    
    // Company logo in top right corner (if provided)
    const logoWidth = 60;
    const logoHeight = 40;
    const logoX = startX + pageWidth - logoWidth;
    const logoY = y;
    
    if (data.companyLogoBuffer) {
      try {
        doc.image(data.companyLogoBuffer, logoX, logoY, { 
          fit: [logoWidth, logoHeight],
          align: 'right',
          valign: 'center'
        });
      } catch (e) {
        // Logo failed to load, continue without it
      }
    }
    
    // Title row
    doc.fillColor('#000000');
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Time Sheet for:', startX + 5, y);
    doc.font('Helvetica');
    doc.text(data.companyName, startX + 90, y);
    
    const monthName = format(new Date(data.year, data.month - 1), 'MMMM-yyyy');
    doc.font('Helvetica-Bold');
    // Position month to left of logo area
    doc.text(monthName, logoX - 90, y, { width: 85, align: 'right' });

    y += 16;
    
    // Project Inspector row
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Project Inspector:', startX + 5, y);
    doc.font('Helvetica');
    doc.text(data.inspectorName, startX + 100, y);

    y += 13;
    
    // District row  
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('District:', startX + 5, y);
    doc.font('Helvetica');
    doc.text(data.districtName || '', startX + 55, y);

    // Ensure y is positioned below logo if logo is taller than text
    y = Math.max(y + 16, logoY + logoHeight + 8);

    // ============ TABLE HEADER ============
    const tableStartY = y;
    const totalHeaderHeight = headerRow1Height + headerRow2Height + headerRow3Height + subHeaderHeight;

    // Draw thick outer border around header
    doc.lineWidth(thickLineWidth);
    doc.rect(startX, y, pageWidth, totalHeaderHeight).stroke();
    doc.lineWidth(thinLineWidth);

    // Left column header - spans 4 rows with labels
    doc.rect(startX, y, dateColWidth, totalHeaderHeight).stroke();
    
    // Row 1: Project Name label
    doc.rect(startX, y, dateColWidth, headerRow1Height).stroke();
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('Project Name', startX + 3, y + 2.5, { width: dateColWidth - 6 });
    
    // Row 2: DSA A# label
    doc.rect(startX, y + headerRow1Height, dateColWidth, headerRow2Height).stroke();
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('DSA A#', startX + 3, y + headerRow1Height + 2.5, { width: dateColWidth - 6 });
    
    // Row 3: File # label
    doc.rect(startX, y + headerRow1Height + headerRow2Height, dateColWidth, headerRow3Height).stroke();
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('File #', startX + 3, y + headerRow1Height + headerRow2Height + 2.5, { width: dateColWidth - 6 });
    
    // Row 4: Empty for date column (REG OT PRM sub-headers in project columns)
    doc.rect(startX, y + headerRow1Height + headerRow2Height + headerRow3Height, dateColWidth, subHeaderHeight).stroke();

    // Project columns header
    let colX = startX + dateColWidth;
    projects.forEach((project, idx) => {
      // Full project header cell - thick vertical line between projects
      doc.lineWidth(thickLineWidth);
      doc.moveTo(colX, y).lineTo(colX, y + totalHeaderHeight).stroke();
      doc.lineWidth(thinLineWidth);
      doc.rect(colX, y, projectColWidth, totalHeaderHeight).stroke();
      
      // Project Name row
      doc.rect(colX, y, projectColWidth, headerRow1Height).stroke();
      doc.fontSize(6).font('Helvetica-Bold');
      const projName = project.projectName || '';
      doc.text(projName, colX + 2, y + 2.5, { width: projectColWidth - 4, align: 'center' });
      
      // DSA A# row
      doc.rect(colX, y + headerRow1Height, projectColWidth, headerRow2Height).stroke();
      doc.fontSize(6).font('Helvetica');
      if (project.dsaNumber) {
        doc.text(project.dsaNumber, colX + 2, y + headerRow1Height + 2.5, { width: projectColWidth - 4, align: 'center' });
      }
      
      // File # row
      doc.rect(colX, y + headerRow1Height + headerRow2Height, projectColWidth, headerRow3Height).stroke();
      if (project.fileNumber) {
        doc.text(project.fileNumber, colX + 2, y + headerRow1Height + headerRow2Height + 2.5, { width: projectColWidth - 4, align: 'center' });
      }
      
      // REG OT PRM sub-header row - with individual cells
      const subY = y + headerRow1Height + headerRow2Height + headerRow3Height;
      doc.rect(colX, subY, hourColWidth, subHeaderHeight).stroke();
      doc.rect(colX + hourColWidth, subY, hourColWidth, subHeaderHeight).stroke();
      doc.rect(colX + hourColWidth * 2, subY, hourColWidth, subHeaderHeight).stroke();
      
      doc.fontSize(6).font('Helvetica-Bold');
      doc.text('REG', colX, subY + 2.5, { width: hourColWidth, align: 'center' });
      doc.text('OT', colX + hourColWidth, subY + 2.5, { width: hourColWidth, align: 'center' });
      doc.text('PRM', colX + hourColWidth * 2, subY + 2.5, { width: hourColWidth, align: 'center' });

      colX += projectColWidth;
    });

    // Remarks column header - thick left border
    doc.lineWidth(thickLineWidth);
    doc.moveTo(colX, y).lineTo(colX, y + totalHeaderHeight).stroke();
    doc.lineWidth(thinLineWidth);
    doc.rect(colX, y, remarksColWidth, totalHeaderHeight).stroke();
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('REMARKS', colX + 3, y + totalHeaderHeight / 2 - 4, { width: remarksColWidth - 6, align: 'center' });

    y += totalHeaderHeight;

    // ============ DAY ROWS ============
    let period1Totals = projects.map(() => ({ reg: 0, ot: 0, prm: 0 }));
    let period2Totals = projects.map(() => ({ reg: 0, ot: 0, prm: 0 }));
    
    // Get holiday remarks for this month
    const holidayRemarks = getHolidayRemarks(data.month, data.year);

    // Helper function to draw a row with thick project separators
    const drawRowWithThickSeparators = (yPos: number, height: number) => {
      // Draw thick vertical lines between major sections
      doc.lineWidth(thickLineWidth);
      doc.moveTo(startX, yPos).lineTo(startX, yPos + height).stroke(); // Left edge
      doc.moveTo(startX + dateColWidth, yPos).lineTo(startX + dateColWidth, yPos + height).stroke(); // After date
      for (let i = 1; i <= projectCount; i++) {
        doc.moveTo(startX + dateColWidth + projectColWidth * i, yPos)
           .lineTo(startX + dateColWidth + projectColWidth * i, yPos + height).stroke();
      }
      doc.moveTo(startX + pageWidth, yPos).lineTo(startX + pageWidth, yPos + height).stroke(); // Right edge
      doc.lineWidth(thinLineWidth);
    };

    // Always render 31 rows to match the template exactly
    for (let day = 1; day <= 31; day++) {
      const date = new Date(data.year, data.month - 1, day);
      const isValidDay = day <= daysInMonth;
      const dayOfWeek = isValidDay ? getDay(date) : 0;
      const dayName = isValidDay ? DAY_NAMES[dayOfWeek] : '';
      const dateStr = isValidDay ? format(date, 'MM/dd') : '';
      const holidayKey = isValidDay ? format(date, 'MM-dd') : '';
      const holiday = holidayRemarks[holidayKey] || '';

      // Date column with thick left border
      doc.lineWidth(thickLineWidth);
      doc.moveTo(startX, y).lineTo(startX, y + rowHeight).stroke();
      doc.lineWidth(thinLineWidth);
      doc.rect(startX, y, dateColWidth, rowHeight).stroke();
      doc.fontSize(6).font('Helvetica');
      if (isValidDay) {
        doc.text(`${dayName}, ${dateStr}`, startX + 3, y + 2.5, { width: dateColWidth - 6 });
      }

      // Project hour columns - each with 3 sub-cells and thick column separators
      colX = startX + dateColWidth;
      projects.forEach((project, idx) => {
        // Thick line at start of each project column
        doc.lineWidth(thickLineWidth);
        doc.moveTo(colX, y).lineTo(colX, y + rowHeight).stroke();
        doc.lineWidth(thinLineWidth);
        
        // Draw 3 sub-cells for REG, OT, PRM
        doc.rect(colX, y, hourColWidth, rowHeight).stroke();
        doc.rect(colX + hourColWidth, y, hourColWidth, rowHeight).stroke();
        doc.rect(colX + hourColWidth * 2, y, hourColWidth, rowHeight).stroke();
        
        if (isValidDay) {
          const hours = project.dailyHours[day] || { reg: 0, ot: 0, prm: 0 };
          doc.fontSize(6).font('Helvetica');
          
          if (hours.reg > 0) {
            doc.text(hours.reg.toFixed(1), colX, y + 2.5, { width: hourColWidth, align: 'center' });
          }
          if (hours.ot > 0) {
            doc.text(hours.ot.toFixed(1), colX + hourColWidth, y + 2.5, { width: hourColWidth, align: 'center' });
          }
          if (hours.prm > 0) {
            doc.text(hours.prm.toFixed(1), colX + hourColWidth * 2, y + 2.5, { width: hourColWidth, align: 'center' });
          }

          // Accumulate totals only for valid days
          if (day <= 15) {
            period1Totals[idx].reg += hours.reg;
            period1Totals[idx].ot += hours.ot;
            period1Totals[idx].prm += hours.prm;
          } else {
            period2Totals[idx].reg += hours.reg;
            period2Totals[idx].ot += hours.ot;
            period2Totals[idx].prm += hours.prm;
          }
        }

        colX += projectColWidth;
      });

      // Remarks column with thick left border
      doc.lineWidth(thickLineWidth);
      doc.moveTo(colX, y).lineTo(colX, y + rowHeight).stroke();
      doc.moveTo(startX + pageWidth, y).lineTo(startX + pageWidth, y + rowHeight).stroke(); // Right edge
      doc.lineWidth(thinLineWidth);
      doc.rect(colX, y, remarksColWidth, rowHeight).stroke();
      if (isValidDay && holiday) {
        doc.fontSize(6).font('Helvetica');
        doc.text(holiday, colX + 3, y + 2.5, { width: remarksColWidth - 6 });
      }

      y += rowHeight;

      // After day 15, draw Period 1 totals with yellow background
      if (day === 15) {
        // Thick line above Period 1 totals
        doc.lineWidth(thickLineWidth);
        doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
        doc.lineWidth(thinLineWidth);
        
        ['Period 1 Regular', 'Period 1 OT', 'Period 1 Premium'].forEach((label, rowIdx) => {
          // Thick left border
          doc.lineWidth(thickLineWidth);
          doc.moveTo(startX, y).lineTo(startX, y + rowHeight).stroke();
          doc.lineWidth(thinLineWidth);
          doc.rect(startX, y, dateColWidth, rowHeight).stroke();
          doc.fontSize(6).font('Helvetica-Bold');
          doc.text(label, startX + 3, y + 2.5, { width: dateColWidth - 6 });

          colX = startX + dateColWidth;
          let rowTotal = 0;
          projects.forEach((_, idx) => {
            // Thick line at project column boundary
            doc.lineWidth(thickLineWidth);
            doc.moveTo(colX, y).lineTo(colX, y + rowHeight).stroke();
            doc.lineWidth(thinLineWidth);
            
            doc.rect(colX, y, hourColWidth, rowHeight).stroke();
            doc.rect(colX + hourColWidth, y, hourColWidth, rowHeight).stroke();
            doc.rect(colX + hourColWidth * 2, y, hourColWidth, rowHeight).stroke();
            
            const val = rowIdx === 0 ? period1Totals[idx].reg : rowIdx === 1 ? period1Totals[idx].ot : period1Totals[idx].prm;
            rowTotal += val;
            doc.fontSize(6).font('Helvetica');
            doc.text(val.toFixed(1), colX, y + 2.5, { width: projectColWidth, align: 'center' });
            colX += projectColWidth;
          });

          // Total in remarks with label on left, value on right
          doc.lineWidth(thickLineWidth);
          doc.moveTo(colX, y).lineTo(colX, y + rowHeight).stroke();
          doc.moveTo(startX + pageWidth, y).lineTo(startX + pageWidth, y + rowHeight).stroke();
          doc.lineWidth(thinLineWidth);
          doc.rect(colX, y, remarksColWidth, rowHeight).stroke();
          const totalLabel = rowIdx === 0 ? 'Total Regular' : rowIdx === 1 ? 'Total OT' : 'Total Premium';
          doc.fontSize(6).font('Helvetica-Bold');
          doc.text(totalLabel, colX + 3, y + 2.5, { width: remarksColWidth / 2 - 3 });
          doc.text(rowTotal.toFixed(1), colX + remarksColWidth / 2, y + 2.5, { width: remarksColWidth / 2 - 6, align: 'right' });

          y += rowHeight;
        });
        
        // Thick line after Period 1 totals
        doc.lineWidth(thickLineWidth);
        doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
        doc.lineWidth(thinLineWidth);
      }
    }

    // ============ PERIOD 2 TOTALS ============
    // Thick line above Period 2 totals
    doc.lineWidth(thickLineWidth);
    doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
    doc.lineWidth(thinLineWidth);
    
    ['Period 2 Regular', 'Period 2 Overtime', 'Period 2 Premium'].forEach((label, rowIdx) => {
      // Thick left border
      doc.lineWidth(thickLineWidth);
      doc.moveTo(startX, y).lineTo(startX, y + rowHeight).stroke();
      doc.lineWidth(thinLineWidth);
      doc.rect(startX, y, dateColWidth, rowHeight).stroke();
      doc.fontSize(6).font('Helvetica-Bold');
      doc.text(label, startX + 3, y + 2.5, { width: dateColWidth - 6 });

      colX = startX + dateColWidth;
      let rowTotal = 0;
      projects.forEach((_, idx) => {
        // Thick line at project column boundary
        doc.lineWidth(thickLineWidth);
        doc.moveTo(colX, y).lineTo(colX, y + rowHeight).stroke();
        doc.lineWidth(thinLineWidth);
        
        doc.rect(colX, y, hourColWidth, rowHeight).stroke();
        doc.rect(colX + hourColWidth, y, hourColWidth, rowHeight).stroke();
        doc.rect(colX + hourColWidth * 2, y, hourColWidth, rowHeight).stroke();
        
        const val = rowIdx === 0 ? period2Totals[idx].reg : rowIdx === 1 ? period2Totals[idx].ot : period2Totals[idx].prm;
        rowTotal += val;
        doc.fontSize(6).font('Helvetica');
        doc.text(val.toFixed(1), colX, y + 2.5, { width: projectColWidth, align: 'center' });
        colX += projectColWidth;
      });

      doc.lineWidth(thickLineWidth);
      doc.moveTo(colX, y).lineTo(colX, y + rowHeight).stroke();
      doc.moveTo(startX + pageWidth, y).lineTo(startX + pageWidth, y + rowHeight).stroke();
      doc.lineWidth(thinLineWidth);
      
      doc.rect(colX, y, remarksColWidth, rowHeight).stroke();
      const totalLabel = rowIdx === 0 ? 'Total Regular' : rowIdx === 1 ? 'Total Overtime' : 'Total Premium';
      doc.fontSize(6).font('Helvetica-Bold');
      doc.text(totalLabel, colX + 3, y + 2.5, { width: remarksColWidth / 2 - 3 });
      doc.text(rowTotal.toFixed(1), colX + remarksColWidth / 2, y + 2.5, { width: remarksColWidth / 2 - 6, align: 'right' });

      y += rowHeight;
    });

    // ============ MONTH TOTALS ============
    // Thick line above Month totals
    doc.lineWidth(thickLineWidth);
    doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
    doc.lineWidth(thinLineWidth);
    
    ['Month Regular', 'Month Overtime', 'Month Premium'].forEach((label, rowIdx) => {
      // Thick left border
      doc.lineWidth(thickLineWidth);
      doc.moveTo(startX, y).lineTo(startX, y + rowHeight).stroke();
      doc.lineWidth(thinLineWidth);
      doc.rect(startX, y, dateColWidth, rowHeight).stroke();
      doc.fontSize(6).font('Helvetica-Bold');
      doc.text(label, startX + 3, y + 2.5, { width: dateColWidth - 6 });

      colX = startX + dateColWidth;
      let rowTotal = 0;
      projects.forEach((_, idx) => {
        doc.lineWidth(thickLineWidth);
        doc.moveTo(colX, y).lineTo(colX, y + rowHeight).stroke();
        doc.lineWidth(thinLineWidth);
        
        doc.rect(colX, y, hourColWidth, rowHeight).stroke();
        doc.rect(colX + hourColWidth, y, hourColWidth, rowHeight).stroke();
        doc.rect(colX + hourColWidth * 2, y, hourColWidth, rowHeight).stroke();
        
        const p1 = rowIdx === 0 ? period1Totals[idx].reg : rowIdx === 1 ? period1Totals[idx].ot : period1Totals[idx].prm;
        const p2 = rowIdx === 0 ? period2Totals[idx].reg : rowIdx === 1 ? period2Totals[idx].ot : period2Totals[idx].prm;
        const val = p1 + p2;
        rowTotal += val;
        doc.fontSize(6).font('Helvetica');
        doc.text(val.toFixed(1), colX, y + 2.5, { width: projectColWidth, align: 'center' });
        colX += projectColWidth;
      });

      doc.lineWidth(thickLineWidth);
      doc.moveTo(colX, y).lineTo(colX, y + rowHeight).stroke();
      doc.moveTo(startX + pageWidth, y).lineTo(startX + pageWidth, y + rowHeight).stroke();
      doc.lineWidth(thinLineWidth);
      
      doc.rect(colX, y, remarksColWidth, rowHeight).stroke();
      const totalLabel = rowIdx === 0 ? 'Total Regular' : rowIdx === 1 ? 'Total Overtime' : 'Total Premium';
      doc.fontSize(6).font('Helvetica-Bold');
      doc.text(totalLabel, colX + 3, y + 2.5, { width: remarksColWidth / 2 - 3 });
      doc.text(rowTotal.toFixed(1), colX + remarksColWidth / 2, y + 2.5, { width: remarksColWidth / 2 - 6, align: 'right' });

      y += rowHeight;
    });

    // ============ PROJECT TOTAL ROW ============
    // Thick line above Project Total
    doc.lineWidth(thickLineWidth);
    doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
    // Thick left border
    doc.moveTo(startX, y).lineTo(startX, y + rowHeight).stroke();
    doc.lineWidth(thinLineWidth);
    
    doc.rect(startX, y, dateColWidth, rowHeight).stroke();
    doc.fontSize(6).font('Helvetica-Bold');
    doc.text('Project Total', startX + 3, y + 2.5, { width: dateColWidth - 6 });

    colX = startX + dateColWidth;
    let grandTotal = 0;
    projects.forEach((_, idx) => {
      doc.lineWidth(thickLineWidth);
      doc.moveTo(colX, y).lineTo(colX, y + rowHeight).stroke();
      doc.lineWidth(thinLineWidth);
      
      doc.rect(colX, y, hourColWidth, rowHeight).stroke();
      doc.rect(colX + hourColWidth, y, hourColWidth, rowHeight).stroke();
      doc.rect(colX + hourColWidth * 2, y, hourColWidth, rowHeight).stroke();
      
      const total = period1Totals[idx].reg + period1Totals[idx].ot + period1Totals[idx].prm +
                   period2Totals[idx].reg + period2Totals[idx].ot + period2Totals[idx].prm;
      grandTotal += total;
      doc.fontSize(6).font('Helvetica-Bold');
      doc.text(total.toFixed(1), colX, y + 2.5, { width: projectColWidth, align: 'center' });
      colX += projectColWidth;
    });
    
    doc.lineWidth(thickLineWidth);
    doc.moveTo(colX, y).lineTo(colX, y + rowHeight).stroke();
    doc.moveTo(startX + pageWidth, y).lineTo(startX + pageWidth, y + rowHeight).stroke();
    doc.lineWidth(thinLineWidth);
    
    doc.rect(colX, y, remarksColWidth, rowHeight).stroke();
    doc.fontSize(6).font('Helvetica-Bold');
    doc.text(grandTotal.toFixed(1), colX + remarksColWidth - 30, y + 2.5, { width: 25, align: 'right' });
    y += rowHeight;

    // ============ % REG/HOL ROW ============
    // Thick left border
    doc.lineWidth(thickLineWidth);
    doc.moveTo(startX, y).lineTo(startX, y + rowHeight).stroke();
    doc.lineWidth(thinLineWidth);
    doc.rect(startX, y, dateColWidth, rowHeight).stroke();
    doc.fontSize(6).font('Helvetica-Bold');
    doc.text('% Reg/Hol', startX + 3, y + 2.5, { width: dateColWidth - 6 });

    colX = startX + dateColWidth;
    projects.forEach((_, idx) => {
      doc.lineWidth(thickLineWidth);
      doc.moveTo(colX, y).lineTo(colX, y + rowHeight).stroke();
      doc.lineWidth(thinLineWidth);
      
      doc.rect(colX, y, hourColWidth, rowHeight).stroke();
      doc.rect(colX + hourColWidth, y, hourColWidth, rowHeight).stroke();
      doc.rect(colX + hourColWidth * 2, y, hourColWidth, rowHeight).stroke();
      
      const total = period1Totals[idx].reg + period1Totals[idx].ot + period1Totals[idx].prm +
                   period2Totals[idx].reg + period2Totals[idx].ot + period2Totals[idx].prm;
      const pct = grandTotal > 0 ? (total / grandTotal * 100) : 0;
      doc.fontSize(6).font('Helvetica-Bold');
      doc.text(pct.toFixed(1) + '%', colX, y + 2.5, { width: projectColWidth, align: 'center' });
      colX += projectColWidth;
    });
    
    doc.lineWidth(thickLineWidth);
    doc.moveTo(colX, y).lineTo(colX, y + rowHeight).stroke();
    doc.moveTo(startX + pageWidth, y).lineTo(startX + pageWidth, y + rowHeight).stroke();
    doc.lineWidth(thinLineWidth);
    
    doc.rect(colX, y, remarksColWidth, rowHeight).stroke();
    doc.fontSize(6).font('Helvetica-Bold');
    doc.text(grandTotal > 0 ? '100.0%' : '0.0%', colX + remarksColWidth - 30, y + 2.5, { width: 25, align: 'right' });
    y += rowHeight;

    // ============ TOTALS SUMMARY ROW ============
    // Thick line above summary
    doc.lineWidth(thickLineWidth);
    doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
    // Thick left border
    doc.moveTo(startX, y).lineTo(startX, y + rowHeight).stroke();
    doc.lineWidth(thinLineWidth);
    
    const totalReg = period1Totals.reduce((s, t) => s + t.reg, 0) + period2Totals.reduce((s, t) => s + t.reg, 0);
    const totalOT = period1Totals.reduce((s, t) => s + t.ot, 0) + period2Totals.reduce((s, t) => s + t.ot, 0);
    const totalPrm = period1Totals.reduce((s, t) => s + t.prm, 0) + period2Totals.reduce((s, t) => s + t.prm, 0);

    // Summary row with cells
    doc.rect(startX, y, dateColWidth, rowHeight).stroke();
    doc.fontSize(6).font('Helvetica-Bold');
    doc.text('Total REG + PRM', startX + 3, y + 2.5, { width: dateColWidth - 6 });
    
    // First project col area for REG+PRM value
    doc.lineWidth(thickLineWidth);
    doc.moveTo(startX + dateColWidth, y).lineTo(startX + dateColWidth, y + rowHeight).stroke();
    doc.lineWidth(thinLineWidth);
    doc.rect(startX + dateColWidth, y, projectColWidth, rowHeight).stroke();
    doc.fontSize(6).font('Helvetica-Bold');
    doc.text((totalReg + totalPrm).toFixed(1), startX + dateColWidth, y + 2.5, { width: projectColWidth, align: 'center' });
    
    // Second col for "Total OT" label
    doc.lineWidth(thickLineWidth);
    doc.moveTo(startX + dateColWidth + projectColWidth, y).lineTo(startX + dateColWidth + projectColWidth, y + rowHeight).stroke();
    doc.lineWidth(thinLineWidth);
    doc.rect(startX + dateColWidth + projectColWidth, y, projectColWidth, rowHeight).stroke();
    doc.fontSize(6).font('Helvetica-Bold');
    doc.text('Total OT', startX + dateColWidth + projectColWidth + 3, y + 2.5, { width: projectColWidth - 6 });
    
    // Third col for OT value
    doc.lineWidth(thickLineWidth);
    doc.moveTo(startX + dateColWidth + projectColWidth * 2, y).lineTo(startX + dateColWidth + projectColWidth * 2, y + rowHeight).stroke();
    doc.lineWidth(thinLineWidth);
    doc.rect(startX + dateColWidth + projectColWidth * 2, y, projectColWidth, rowHeight).stroke();
    doc.fontSize(6).font('Helvetica-Bold');
    doc.text(totalOT.toFixed(1), startX + dateColWidth + projectColWidth * 2, y + 2.5, { width: projectColWidth, align: 'center' });
    
    // Fourth col empty
    doc.lineWidth(thickLineWidth);
    doc.moveTo(startX + dateColWidth + projectColWidth * 3, y).lineTo(startX + dateColWidth + projectColWidth * 3, y + rowHeight).stroke();
    doc.lineWidth(thinLineWidth);
    doc.rect(startX + dateColWidth + projectColWidth * 3, y, projectColWidth, rowHeight).stroke();
    
    // Fifth col for Grand Total label
    doc.lineWidth(thickLineWidth);
    doc.moveTo(startX + dateColWidth + projectColWidth * 4, y).lineTo(startX + dateColWidth + projectColWidth * 4, y + rowHeight).stroke();
    doc.lineWidth(thinLineWidth);
    doc.rect(startX + dateColWidth + projectColWidth * 4, y, projectColWidth, rowHeight).stroke();
    doc.fontSize(6).font('Helvetica-Bold');
    doc.text('Grand Total', startX + dateColWidth + projectColWidth * 4 + 3, y + 2.5, { width: projectColWidth - 6 });
    
    // Remarks col for grand total value
    doc.lineWidth(thickLineWidth);
    doc.moveTo(startX + dateColWidth + projectColWidth * 5, y).lineTo(startX + dateColWidth + projectColWidth * 5, y + rowHeight).stroke();
    doc.moveTo(startX + pageWidth, y).lineTo(startX + pageWidth, y + rowHeight).stroke();
    doc.lineWidth(thinLineWidth);
    doc.rect(startX + dateColWidth + projectColWidth * 5, y, remarksColWidth, rowHeight).stroke();
    doc.fontSize(6).font('Helvetica-Bold');
    doc.text(grandTotal.toFixed(1), startX + dateColWidth + projectColWidth * 5 + remarksColWidth - 30, y + 2.5, { width: 25, align: 'right' });
    y += rowHeight;
    
    // Thick bottom border
    doc.lineWidth(thickLineWidth);
    doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
    doc.lineWidth(thinLineWidth);

    // ============ FOOTER NOTE ============
    y += 8;
    doc.fontSize(7).font('Helvetica-Oblique');
    doc.text('One separate sheet required for each District. Some Districts require special Overtime sheet to be filled out for acceptance.', startX + 5, y);

    // ============ SIGNATURE SECTION ============
    y += 18;
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('District Rep. Approval', startX + 5, y);
    
    // Date field on right side
    doc.text('Date:', startX + pageWidth - 80, y);
    doc.moveTo(startX + pageWidth - 55, y + 10).lineTo(startX + pageWidth, y + 10).stroke();

    y += 20;
    doc.text('Signature:', startX + 25, y);
    doc.moveTo(startX + 85, y + 10).lineTo(startX + 250, y + 10).stroke();

    // ============ ESTIMATE FIELDS ============
    y += 28;
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Est. Percentage Complete:', startX + 5, y);
    doc.font('Helvetica');
    doc.text(data.estPercentComplete || '', startX + 150, y);
    
    y += 16;
    doc.font('Helvetica-Bold');
    doc.text('Est. Completion Date:', startX + 5, y);
    doc.font('Helvetica');
    doc.text(data.estCompletionDate || '', startX + 130, y);

    doc.end();
  });
}

export function aggregateReportsToTimesheetData(
  reports: DailyReport[],
  projects: Project[],
  contracts: (Contract & { projects?: any[]; client?: any; attachments?: any[] })[],
  company: Company | null | undefined,
  inspectorProfile: UserProfile | null | undefined,
  month: number,
  year: number
): TimesheetData {
  const projectMap = new Map(projects.map(p => [p.id, p]));
  // Build map from project ID to contract (contracts can have multiple projects)
  const contractMap = new Map<string, typeof contracts[0]>();
  contracts.forEach(c => {
    if (c.projects) {
      c.projects.forEach((p: any) => {
        if (p.id) contractMap.set(p.id, c);
      });
    }
  });

  // Group reports by project
  const projectReports = new Map<string, DailyReport[]>();
  
  reports.forEach(report => {
    if (report.projectId) {
      const arr = projectReports.get(report.projectId) || [];
      arr.push(report);
      projectReports.set(report.projectId, arr);
    }
  });

  const timesheetProjects: TimesheetData['projects'] = [];

  projectReports.forEach((reports, projectId) => {
    const project = projectMap.get(projectId);
    const contract = contractMap.get(projectId);
    
    const dailyHours: Record<number, { reg: number; ot: number; prm: number }> = {};
    
    reports.forEach(report => {
      const reportDate = new Date(report.date);
      if (reportDate.getMonth() + 1 === month && reportDate.getFullYear() === year) {
        const day = reportDate.getDate();
        const reg = parseFloat(report.regularHours || '0') || 0;
        const ot = parseFloat(report.otHours || '0') || 0;
        
        if (!dailyHours[day]) {
          dailyHours[day] = { reg: 0, ot: 0, prm: 0 };
        }
        dailyHours[day].reg += reg;
        dailyHours[day].ot += ot;
      }
    });

    timesheetProjects.push({
      projectName: project?.name || 'Unknown Project',
      dsaNumber: project?.projectNumber,
      fileNumber: undefined,
      regularRate: contract?.regularRate ? parseFloat(contract.regularRate) : undefined,
      overtimeRate: contract?.overtimeRate ? parseFloat(contract.overtimeRate) : undefined,
      premiumRate: contract?.premiumRate ? parseFloat(contract.premiumRate) : undefined,
      dailyHours,
    });
  });

  const inspectorName = inspectorProfile 
    ? `${inspectorProfile.firstName || ''} ${inspectorProfile.lastName || ''}`.trim() 
    : 'Unknown Inspector';

  return {
    companyName: company?.name || 'Company',
    inspectorName,
    districtName: '',
    month,
    year,
    projects: timesheetProjects,
  };
}

export interface InvoiceReportDetail {
  date: Date;
  inspectorName: string;
  regularHours: number;
  overtimeHours: number;
  premiumHours: number;
}

export interface InvoiceData {
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyLogoPath?: string;
  clientName?: string;
  clientAddress?: string;
  clientContactName?: string;
  projectName: string;
  projectNumber?: string;
  contractNumber?: string;
  purchaseOrderNumber?: string;
  purchaseOrderValue?: number;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date;
  month: number;
  year: number;
  regularHours: number;
  overtimeHours: number;
  premiumHours: number;
  regularRate: number;
  overtimeRate: number;
  premiumRate: number;
  notes?: string;
  reportDetails?: InvoiceReportDetail[];
}

export async function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 50,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100;
    const startX = 50;
    const rightColX = startX + pageWidth - 200;

    // ========== HEADER SECTION ==========
    // Company name and INVOICE title on same line, properly aligned
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#000');
    doc.text(data.companyName, startX, 45, { width: pageWidth - 150 });
    
    // INVOICE title - right aligned
    doc.fontSize(28).font('Helvetica-Bold').fillColor('#333');
    doc.text('INVOICE', rightColX, 45, { width: 200, align: 'right' });

    // Company contact info below company name
    let headerY = 75;
    doc.fontSize(9).font('Helvetica').fillColor('#444');
    if (data.companyAddress) {
      doc.text(data.companyAddress, startX, headerY);
      headerY = doc.y + 2;
    }
    if (data.companyPhone) {
      doc.text(data.companyPhone, startX, headerY);
      headerY = doc.y + 2;
    }
    if (data.companyEmail) {
      doc.text(data.companyEmail, startX, headerY);
      headerY = doc.y + 2;
    }

    // Invoice details box (right side, below INVOICE title)
    const invoiceBoxY = 80;
    const labelWidth = 80;
    const valueWidth = 110;
    
    doc.fontSize(9).font('Helvetica').fillColor('#000');
    doc.text('Invoice #:', rightColX, invoiceBoxY, { width: labelWidth });
    doc.font('Helvetica-Bold').text(data.invoiceNumber, rightColX + labelWidth, invoiceBoxY, { width: valueWidth, align: 'right' });
    
    doc.font('Helvetica').text('Date:', rightColX, invoiceBoxY + 14, { width: labelWidth });
    doc.font('Helvetica-Bold').text(format(data.invoiceDate, 'MMMM dd, yyyy'), rightColX + labelWidth, invoiceBoxY + 14, { width: valueWidth, align: 'right' });

    const monthName = format(new Date(data.year, data.month - 1), 'MMMM yyyy');
    doc.font('Helvetica').text('Period:', rightColX, invoiceBoxY + 28, { width: labelWidth });
    doc.font('Helvetica-Bold').text(monthName, rightColX + labelWidth, invoiceBoxY + 28, { width: valueWidth, align: 'right' });

    if (data.dueDate) {
      doc.font('Helvetica').text('Due Date:', rightColX, invoiceBoxY + 42, { width: labelWidth });
      doc.font('Helvetica-Bold').text(format(data.dueDate, 'MMMM dd, yyyy'), rightColX + labelWidth, invoiceBoxY + 42, { width: valueWidth, align: 'right' });
    }

    // ========== BILL TO / PROJECT SECTION ==========
    const sectionY = 140;
    const colWidth = (pageWidth - 20) / 2;

    // Bill To section (left)
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('BILL TO', startX, sectionY);
    doc.moveTo(startX, sectionY + 12).lineTo(startX + 50, sectionY + 12).strokeColor('#ccc').lineWidth(0.5).stroke();
    doc.fontSize(9).font('Helvetica').fillColor('#000');
    let billToY = sectionY + 18;
    if (data.clientName) {
      doc.font('Helvetica-Bold').text(data.clientName, startX, billToY);
      billToY = doc.y + 2;
    }
    if (data.clientContactName) {
      doc.font('Helvetica').text(`Attn: ${data.clientContactName}`, startX, billToY);
      billToY = doc.y + 2;
    }
    if (data.clientAddress) {
      doc.font('Helvetica').text(data.clientAddress, startX, billToY, { width: colWidth - 20 });
      billToY = doc.y + 2;
    }

    // Project section (right)
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('PROJECT DETAILS', startX + colWidth + 20, sectionY);
    doc.moveTo(startX + colWidth + 20, sectionY + 12).lineTo(startX + colWidth + 120, sectionY + 12).strokeColor('#ccc').lineWidth(0.5).stroke();
    let projY = sectionY + 18;
    doc.fontSize(9).font('Helvetica-Bold').text(data.projectName, startX + colWidth + 20, projY, { width: colWidth - 20 });
    projY = doc.y + 4;
    
    if (data.projectNumber) {
      doc.font('Helvetica').text('Project #: ', startX + colWidth + 20, projY, { continued: true });
      doc.font('Helvetica-Bold').text(data.projectNumber);
      projY = doc.y + 2;
    }
    if (data.contractNumber) {
      doc.font('Helvetica').text('Contract #: ', startX + colWidth + 20, projY, { continued: true });
      doc.font('Helvetica-Bold').text(data.contractNumber);
      projY = doc.y + 2;
    }
    if (data.purchaseOrderNumber) {
      doc.font('Helvetica').text('PO #: ', startX + colWidth + 20, projY, { continued: true });
      doc.font('Helvetica-Bold').text(data.purchaseOrderNumber);
      projY = doc.y + 2;
    }
    if (data.purchaseOrderValue) {
      doc.font('Helvetica').text('PO Value: ', startX + colWidth + 20, projY, { continued: true });
      doc.font('Helvetica-Bold').text('$' + data.purchaseOrderValue.toLocaleString('en-US', { minimumFractionDigits: 2 }));
      projY = doc.y + 2;
    }

    // ========== SUMMARY TABLE ==========
    let tableY = Math.max(billToY, projY) + 25;
    const summaryColWidths = [250, 90, 90, 80];
    const totalSummaryWidth = summaryColWidths.reduce((a, b) => a + b, 0);
    doc.lineWidth(0.5);

    // Summary header
    doc.rect(startX, tableY, totalSummaryWidth, 22).fillAndStroke('#2c3e50', '#2c3e50');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
    let colX = startX;
    ['Description', 'Hours', 'Rate', 'Amount'].forEach((header, i) => {
      const w = summaryColWidths[i];
      doc.text(header, colX + 8, tableY + 7, { width: w - 16, align: i > 0 ? 'right' : 'left' });
      colX += w;
    });

    // Summary line items
    const lineItems = [
      { desc: 'Regular Hours', hours: data.regularHours, rate: data.regularRate },
      { desc: 'Overtime Hours (1.5x)', hours: data.overtimeHours, rate: data.overtimeRate },
      { desc: 'Premium Hours (2x)', hours: data.premiumHours, rate: data.premiumRate },
    ].filter(item => item.hours > 0);

    let rowY = tableY + 22;
    let subtotal = 0;

    lineItems.forEach((item, idx) => {
      const amount = item.hours * item.rate;
      subtotal += amount;
      const bgColor = idx % 2 === 0 ? '#f8f9fa' : '#fff';
      
      doc.rect(startX, rowY, totalSummaryWidth, 20).fillAndStroke(bgColor, '#ddd');
      doc.fontSize(9).font('Helvetica').fillColor('#000');
      
      colX = startX;
      doc.text(item.desc, colX + 8, rowY + 6, { width: summaryColWidths[0] - 16 });
      colX += summaryColWidths[0];
      doc.text(item.hours.toFixed(2), colX + 8, rowY + 6, { width: summaryColWidths[1] - 16, align: 'right' });
      colX += summaryColWidths[1];
      doc.text('$' + item.rate.toFixed(2), colX + 8, rowY + 6, { width: summaryColWidths[2] - 16, align: 'right' });
      colX += summaryColWidths[2];
      doc.font('Helvetica-Bold').text('$' + amount.toFixed(2), colX + 8, rowY + 6, { width: summaryColWidths[3] - 16, align: 'right' });

      rowY += 20;
    });

    // Totals row
    doc.rect(startX, rowY, totalSummaryWidth, 24).fillAndStroke('#e8f4f8', '#2c3e50');
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#2c3e50');
    doc.text('TOTAL DUE:', startX + 8, rowY + 7, { width: summaryColWidths[0] + summaryColWidths[1] + summaryColWidths[2] - 16 });
    doc.text('$' + subtotal.toFixed(2), startX + summaryColWidths[0] + summaryColWidths[1] + summaryColWidths[2] + 8, rowY + 7, { width: summaryColWidths[3] - 16, align: 'right' });
    rowY += 24;

    // ========== DAILY BREAKDOWN TABLE (if report details provided) ==========
    if (data.reportDetails && data.reportDetails.length > 0) {
      rowY += 20;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text('DAILY BREAKDOWN BY INSPECTOR', startX, rowY);
      doc.moveTo(startX, rowY + 14).lineTo(startX + 220, rowY + 14).strokeColor('#ccc').lineWidth(0.5).stroke();
      rowY += 22;

      const detailColWidths = [85, 150, 70, 70, 70, 70];
      const totalDetailWidth = detailColWidths.reduce((a, b) => a + b, 0);

      // Detail header
      doc.rect(startX, rowY, totalDetailWidth, 20).fillAndStroke('#34495e', '#34495e');
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff');
      colX = startX;
      ['Date', 'Inspector', 'Regular', 'Overtime', 'Premium', 'Total'].forEach((header, i) => {
        const w = detailColWidths[i];
        doc.text(header, colX + 4, rowY + 6, { width: w - 8, align: i > 1 ? 'right' : 'left' });
        colX += w;
      });
      rowY += 20;

      // Sort report details by date
      const sortedDetails = [...data.reportDetails].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      sortedDetails.forEach((detail, idx) => {
        // Check if we need a new page
        if (rowY > doc.page.height - 80) {
          doc.addPage();
          rowY = 50;
        }

        const bgColor = idx % 2 === 0 ? '#f8f9fa' : '#fff';
        const totalHours = detail.regularHours + detail.overtimeHours + detail.premiumHours;
        
        doc.rect(startX, rowY, totalDetailWidth, 16).fillAndStroke(bgColor, '#ddd');
        doc.fontSize(8).font('Helvetica').fillColor('#000');
        
        colX = startX;
        doc.text(format(new Date(detail.date), 'MM/dd/yyyy'), colX + 4, rowY + 4, { width: detailColWidths[0] - 8 });
        colX += detailColWidths[0];
        doc.text(detail.inspectorName, colX + 4, rowY + 4, { width: detailColWidths[1] - 8 });
        colX += detailColWidths[1];
        doc.text(detail.regularHours > 0 ? detail.regularHours.toFixed(1) : '-', colX + 4, rowY + 4, { width: detailColWidths[2] - 8, align: 'right' });
        colX += detailColWidths[2];
        doc.text(detail.overtimeHours > 0 ? detail.overtimeHours.toFixed(1) : '-', colX + 4, rowY + 4, { width: detailColWidths[3] - 8, align: 'right' });
        colX += detailColWidths[3];
        doc.text(detail.premiumHours > 0 ? detail.premiumHours.toFixed(1) : '-', colX + 4, rowY + 4, { width: detailColWidths[4] - 8, align: 'right' });
        colX += detailColWidths[4];
        doc.font('Helvetica-Bold').text(totalHours.toFixed(1), colX + 4, rowY + 4, { width: detailColWidths[5] - 8, align: 'right' });

        rowY += 16;
      });
    }

    // Notes
    if (data.notes) {
      rowY += 20;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text('Notes:', startX, rowY);
      doc.fontSize(9).font('Helvetica').text(data.notes, startX, rowY + 14, { width: pageWidth });
    }

    // Footer
    doc.fontSize(8).font('Helvetica').fillColor('#888');
    doc.text('Thank you for your business!', startX, doc.page.height - 40, { width: pageWidth, align: 'center' });

    doc.end();
  });
}

// Inspector Invoice - for inspectors to bill their company for project work
export interface InspectorInvoiceData {
  // Inspector info (from party)
  inspectorName: string;
  inspectorAddress?: string;
  inspectorPhone?: string;
  inspectorEmail?: string;
  // Company info (bill to party)
  companyName: string;
  companyAddress?: string;
  // Project details
  projectName: string;
  projectNumber?: string;
  // Invoice details
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date;
  month: number;
  year: number;
  // Hours and rates (from project_members)
  regularHours: number;
  overtimeHours: number;
  premiumHours: number;
  regularRate: number;
  overtimeRate: number;
  premiumRate: number;
  notes?: string;
}

export async function generateInspectorInvoicePdf(data: InspectorInvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 50,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100;
    const startX = 50;

    // Header - Inspector info (From)
    doc.fontSize(16).font('Helvetica-Bold').text(data.inspectorName, startX, 50);
    doc.fontSize(9).font('Helvetica');
    if (data.inspectorAddress) {
      const addressLines = data.inspectorAddress.split('\n');
      addressLines.forEach(line => doc.text(line, startX, doc.y));
    }
    if (data.inspectorPhone) doc.text(data.inspectorPhone, startX, doc.y);
    if (data.inspectorEmail) doc.text(data.inspectorEmail, startX, doc.y);

    // Invoice title
    doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', pageWidth + 50, 50, { width: 100, align: 'right' });

    // Invoice details box (right side)
    const invoiceBoxY = 120;
    doc.fontSize(10).font('Helvetica');
    doc.text('Invoice #:', startX + pageWidth - 150, invoiceBoxY);
    doc.font('Helvetica-Bold').text(data.invoiceNumber, startX + pageWidth - 50, invoiceBoxY, { width: 100 });
    
    doc.font('Helvetica').text('Date:', startX + pageWidth - 150, invoiceBoxY + 15);
    doc.font('Helvetica-Bold').text(format(data.invoiceDate, 'MM/dd/yyyy'), startX + pageWidth - 50, invoiceBoxY + 15, { width: 100 });

    if (data.dueDate) {
      doc.font('Helvetica').text('Due Date:', startX + pageWidth - 150, invoiceBoxY + 30);
      doc.font('Helvetica-Bold').text(format(data.dueDate, 'MM/dd/yyyy'), startX + pageWidth - 50, invoiceBoxY + 30, { width: 100 });
    }

    // Bill To (Company)
    doc.fontSize(10).font('Helvetica-Bold').text('Bill To:', startX, invoiceBoxY);
    doc.fontSize(10).font('Helvetica');
    doc.text(data.companyName, startX, invoiceBoxY + 15);
    if (data.companyAddress) {
      const companyAddressLines = data.companyAddress.split('\n');
      companyAddressLines.forEach(line => doc.text(line, startX, doc.y));
    }

    // Project info
    const projectY = 200;
    doc.fontSize(10).font('Helvetica-Bold').text('Project:', startX, projectY);
    doc.font('Helvetica').text(data.projectName, startX + 50, projectY);
    if (data.projectNumber) {
      doc.font('Helvetica-Bold').text('Project #:', startX, projectY + 15);
      doc.font('Helvetica').text(data.projectNumber, startX + 60, projectY + 15);
    }

    const monthName = format(new Date(data.year, data.month - 1), 'MMMM yyyy');
    doc.font('Helvetica-Bold').text('Period:', startX, projectY + 30);
    doc.font('Helvetica').text(monthName, startX + 45, projectY + 30);

    // Line items table
    const tableY = 270;
    const colWidths = [200, 80, 80, 100];
    doc.lineWidth(1);

    // Header
    doc.rect(startX, tableY, pageWidth, 25).fillAndStroke('#f0f0f0', '#000');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
    let colX = startX;
    ['Description', 'Hours', 'Rate', 'Amount'].forEach((header, i) => {
      const w = colWidths[i];
      doc.text(header, colX + 5, tableY + 8, { width: w - 10, align: i > 0 ? 'right' : 'left' });
      colX += w;
    });

    // Line items
    const lineItems = [
      { desc: 'Regular Hours', hours: data.regularHours, rate: data.regularRate },
      { desc: 'Overtime Hours', hours: data.overtimeHours, rate: data.overtimeRate },
      { desc: 'Premium Hours', hours: data.premiumHours, rate: data.premiumRate },
    ].filter(item => item.hours > 0 && item.rate > 0);

    let rowY = tableY + 25;
    let subtotal = 0;

    lineItems.forEach(item => {
      const amount = item.hours * item.rate;
      subtotal += amount;

      doc.rect(startX, rowY, pageWidth, 20).stroke();
      doc.fontSize(9).font('Helvetica').fillColor('#000');
      
      colX = startX;
      doc.text(item.desc, colX + 5, rowY + 6, { width: colWidths[0] - 10 });
      colX += colWidths[0];
      doc.text(item.hours.toFixed(2), colX + 5, rowY + 6, { width: colWidths[1] - 10, align: 'right' });
      colX += colWidths[1];
      doc.text('$' + item.rate.toFixed(2), colX + 5, rowY + 6, { width: colWidths[2] - 10, align: 'right' });
      colX += colWidths[2];
      doc.text('$' + amount.toFixed(2), colX + 5, rowY + 6, { width: colWidths[3] - 10, align: 'right' });

      rowY += 20;
    });

    // If no line items with hours, show message
    if (lineItems.length === 0) {
      doc.rect(startX, rowY, pageWidth, 20).stroke();
      doc.fontSize(9).font('Helvetica').fillColor('#666');
      doc.text('No hours recorded for this period', startX + 5, rowY + 6, { width: pageWidth - 10, align: 'center' });
      rowY += 20;
    }

    // Totals
    rowY += 10;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000');
    doc.text('Subtotal:', startX + 280, rowY);
    doc.text('$' + subtotal.toFixed(2), startX + 360, rowY, { width: 100, align: 'right' });

    rowY += 20;
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Total Due:', startX + 280, rowY);
    doc.text('$' + subtotal.toFixed(2), startX + 360, rowY, { width: 100, align: 'right' });

    // Notes
    if (data.notes) {
      rowY += 40;
      doc.fontSize(9).font('Helvetica-Bold').text('Notes:', startX, rowY);
      doc.fontSize(9).font('Helvetica').text(data.notes, startX, rowY + 15, { width: pageWidth });
    }

    // Payment info section
    rowY += 60;
    doc.fontSize(9).font('Helvetica-Bold').text('Payment Information:', startX, rowY);
    doc.fontSize(9).font('Helvetica').text('Please remit payment within 30 days.', startX, rowY + 15);

    // Footer
    doc.fontSize(8).font('Helvetica').fillColor('#666');
    doc.text('Thank you for your business!', startX, doc.page.height - 50, { width: pageWidth, align: 'center' });

    doc.end();
  });
}
