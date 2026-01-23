import PDFDocument from "pdfkit";
import { format, getDaysInMonth, getDay } from "date-fns";
import { DailyReport, Project, Contract, Company, UserProfile } from "@shared/schema";

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOLIDAY_REMARKS: Record<string, string> = {
  '01-01': "New Year's Day",
  '01-15': "MLK Day", // Approximate - actually 3rd Monday
  '02-19': "Presidents Day", // Approximate
  '05-27': "Memorial Day", // Approximate
  '07-04': "Independence Day",
  '09-02': "Labor Day", // Approximate
  '11-11': "Veterans Day",
  '11-28': "Thanksgiving Day", // Approximate
  '12-25': "Christmas Day",
};

interface TimesheetData {
  companyName: string;
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
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margin: 15,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 30;
    const startX = 15;
    const daysInMonth = getDaysInMonth(new Date(data.year, data.month - 1));

    // Header
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Time Sheet for:', startX, 15);
    doc.text(data.companyName, startX + 80, 15);
    
    const monthName = format(new Date(data.year, data.month - 1), 'MMMM-yyyy');
    doc.text(monthName, pageWidth - 80, 15, { width: 80, align: 'right' });

    doc.fontSize(8).font('Helvetica');
    doc.text('Project Inspector:', startX, 30);
    doc.text(data.inspectorName, startX + 80, 30);
    doc.text('District:', startX, 42);
    doc.text(data.districtName || '', startX + 80, 42);

    // Calculate column widths
    const dateColWidth = 75;
    const projectCount = Math.min(data.projects.length, 5);
    const remarksColWidth = 100;
    const projectColWidth = (pageWidth - dateColWidth - remarksColWidth) / Math.max(projectCount, 1);
    const hourColWidth = projectColWidth / 3;

    // Table header row
    let tableY = 58;
    const headerHeight = 35;
    const rowHeight = 11;

    doc.strokeColor('#000').lineWidth(0.5);

    // Project headers
    doc.rect(startX, tableY, dateColWidth, headerHeight).stroke();
    doc.fontSize(6).font('Helvetica-Bold');
    doc.text('Project Name', startX + 2, tableY + 3, { width: dateColWidth - 4 });

    let colX = startX + dateColWidth;
    data.projects.slice(0, 5).forEach((project, idx) => {
      doc.rect(colX, tableY, projectColWidth, headerHeight).stroke();
      doc.fontSize(5.5).font('Helvetica');
      doc.text(project.projectName || '', colX + 2, tableY + 2, { width: projectColWidth - 4 });
      if (project.dsaNumber) {
        doc.text(`DSA A#: ${project.dsaNumber}`, colX + 2, tableY + 12, { width: projectColWidth - 4 });
      }
      if (project.fileNumber) {
        doc.text(`File #: ${project.fileNumber}`, colX + 2, tableY + 20, { width: projectColWidth - 4 });
      }

      // Sub-header: REG OT PRM
      doc.fontSize(5).font('Helvetica-Bold');
      const subY = tableY + headerHeight - 10;
      doc.text('REG', colX + 2, subY, { width: hourColWidth - 2, align: 'center' });
      doc.text('OT', colX + hourColWidth, subY, { width: hourColWidth, align: 'center' });
      doc.text('PRM', colX + hourColWidth * 2, subY, { width: hourColWidth - 2, align: 'center' });

      colX += projectColWidth;
    });

    // Remarks column
    doc.rect(colX, tableY, remarksColWidth, headerHeight).stroke();
    doc.fontSize(6).font('Helvetica-Bold');
    doc.text('REMARKS', colX + 2, tableY + 15);

    tableY += headerHeight;

    // Period tracking
    let period1Totals = data.projects.map(() => ({ reg: 0, ot: 0, prm: 0 }));
    let period2Totals = data.projects.map(() => ({ reg: 0, ot: 0, prm: 0 }));

    // Draw day rows
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(data.year, data.month - 1, day);
      const dayOfWeek = getDay(date);
      const dayName = DAY_NAMES[dayOfWeek];
      const dateStr = format(date, 'MM/dd');
      const holidayKey = format(date, 'MM-dd');
      const holiday = HOLIDAY_REMARKS[holidayKey] || '';

      // Date column
      doc.rect(startX, tableY, dateColWidth, rowHeight).stroke();
      doc.fontSize(6).font('Helvetica');
      doc.text(`${dayName}, ${dateStr}`, startX + 2, tableY + 3, { width: dateColWidth - 4 });

      // Project hour columns
      colX = startX + dateColWidth;
      data.projects.slice(0, 5).forEach((project, idx) => {
        doc.rect(colX, tableY, projectColWidth, rowHeight).stroke();
        
        const hours = project.dailyHours[day] || { reg: 0, ot: 0, prm: 0 };
        doc.fontSize(5).font('Helvetica');
        
        if (hours.reg > 0) {
          doc.text(hours.reg.toFixed(1), colX + 2, tableY + 3, { width: hourColWidth - 2, align: 'center' });
        }
        if (hours.ot > 0) {
          doc.text(hours.ot.toFixed(1), colX + hourColWidth, tableY + 3, { width: hourColWidth, align: 'center' });
        }
        if (hours.prm > 0) {
          doc.text(hours.prm.toFixed(1), colX + hourColWidth * 2, tableY + 3, { width: hourColWidth - 2, align: 'center' });
        }

        // Accumulate totals
        if (day <= 15) {
          period1Totals[idx].reg += hours.reg;
          period1Totals[idx].ot += hours.ot;
          period1Totals[idx].prm += hours.prm;
        } else {
          period2Totals[idx].reg += hours.reg;
          period2Totals[idx].ot += hours.ot;
          period2Totals[idx].prm += hours.prm;
        }

        colX += projectColWidth;
      });

      // Remarks column
      doc.rect(colX, tableY, remarksColWidth, rowHeight).stroke();
      if (holiday) {
        doc.fontSize(5).font('Helvetica');
        doc.text(holiday, colX + 2, tableY + 3, { width: remarksColWidth - 4 });
      }

      tableY += rowHeight;

      // After day 15, draw Period 1 totals
      if (day === 15) {
        const totalsHeight = rowHeight * 3;
        ['Period 1 Regular', 'Period 1 OT', 'Period 1 Premium'].forEach((label, rowIdx) => {
          doc.rect(startX, tableY, dateColWidth, rowHeight).stroke();
          doc.fontSize(5.5).font('Helvetica-Bold');
          doc.text(label, startX + 2, tableY + 3, { width: dateColWidth - 4 });

          colX = startX + dateColWidth;
          let rowTotal = 0;
          data.projects.slice(0, 5).forEach((_, idx) => {
            doc.rect(colX, tableY, projectColWidth, rowHeight).stroke();
            const val = rowIdx === 0 ? period1Totals[idx].reg : rowIdx === 1 ? period1Totals[idx].ot : period1Totals[idx].prm;
            rowTotal += val;
            doc.fontSize(5).font('Helvetica');
            doc.text(val.toFixed(1), colX + 2, tableY + 3, { width: projectColWidth - 4, align: 'center' });
            colX += projectColWidth;
          });

          // Total column in remarks
          doc.rect(colX, tableY, remarksColWidth, rowHeight).stroke();
          const totalLabel = rowIdx === 0 ? 'Total Regular' : rowIdx === 1 ? 'Total OT' : 'Total Premium';
          doc.fontSize(5).font('Helvetica-Bold');
          doc.text(`${totalLabel}  ${rowTotal.toFixed(1)}`, colX + 2, tableY + 3, { width: remarksColWidth - 4 });

          tableY += rowHeight;
        });
      }
    }

    // Period 2 totals
    ['Period 2 Regular', 'Period 2 Overtime', 'Period 2 Premium'].forEach((label, rowIdx) => {
      doc.rect(startX, tableY, dateColWidth, rowHeight).stroke();
      doc.fontSize(5.5).font('Helvetica-Bold');
      doc.text(label, startX + 2, tableY + 3, { width: dateColWidth - 4 });

      colX = startX + dateColWidth;
      let rowTotal = 0;
      data.projects.slice(0, 5).forEach((_, idx) => {
        doc.rect(colX, tableY, projectColWidth, rowHeight).stroke();
        const val = rowIdx === 0 ? period2Totals[idx].reg : rowIdx === 1 ? period2Totals[idx].ot : period2Totals[idx].prm;
        rowTotal += val;
        doc.fontSize(5).font('Helvetica');
        doc.text(val.toFixed(1), colX + 2, tableY + 3, { width: projectColWidth - 4, align: 'center' });
        colX += projectColWidth;
      });

      doc.rect(colX, tableY, remarksColWidth, rowHeight).stroke();
      const totalLabel = rowIdx === 0 ? 'Total Regular' : rowIdx === 1 ? 'Total Overtime' : 'Total Premium';
      doc.fontSize(5).font('Helvetica-Bold');
      doc.text(`${totalLabel}  ${rowTotal.toFixed(1)}`, colX + 2, tableY + 3, { width: remarksColWidth - 4 });

      tableY += rowHeight;
    });

    // Month totals
    ['Month Regular', 'Month Overtime', 'Month Premium'].forEach((label, rowIdx) => {
      doc.rect(startX, tableY, dateColWidth, rowHeight).stroke();
      doc.fontSize(5.5).font('Helvetica-Bold');
      doc.text(label, startX + 2, tableY + 3, { width: dateColWidth - 4 });

      colX = startX + dateColWidth;
      let rowTotal = 0;
      data.projects.slice(0, 5).forEach((_, idx) => {
        doc.rect(colX, tableY, projectColWidth, rowHeight).stroke();
        const p1 = rowIdx === 0 ? period1Totals[idx].reg : rowIdx === 1 ? period1Totals[idx].ot : period1Totals[idx].prm;
        const p2 = rowIdx === 0 ? period2Totals[idx].reg : rowIdx === 1 ? period2Totals[idx].ot : period2Totals[idx].prm;
        const val = p1 + p2;
        rowTotal += val;
        doc.fontSize(5).font('Helvetica');
        doc.text(val.toFixed(1), colX + 2, tableY + 3, { width: projectColWidth - 4, align: 'center' });
        colX += projectColWidth;
      });

      doc.rect(colX, tableY, remarksColWidth, rowHeight).stroke();
      const totalLabel = rowIdx === 0 ? 'Total Regular' : rowIdx === 1 ? 'Total Overtime' : 'Total Premium';
      doc.fontSize(5).font('Helvetica-Bold');
      doc.text(`${totalLabel}  ${rowTotal.toFixed(1)}`, colX + 2, tableY + 3, { width: remarksColWidth - 4 });

      tableY += rowHeight;
    });

    // Project Total row
    doc.rect(startX, tableY, dateColWidth, rowHeight).stroke();
    doc.fontSize(5.5).font('Helvetica-Bold');
    doc.text('Project Total', startX + 2, tableY + 3, { width: dateColWidth - 4 });

    colX = startX + dateColWidth;
    let grandTotal = 0;
    data.projects.slice(0, 5).forEach((_, idx) => {
      doc.rect(colX, tableY, projectColWidth, rowHeight).stroke();
      const total = period1Totals[idx].reg + period1Totals[idx].ot + period1Totals[idx].prm +
                   period2Totals[idx].reg + period2Totals[idx].ot + period2Totals[idx].prm;
      grandTotal += total;
      doc.fontSize(5).font('Helvetica');
      doc.text(total.toFixed(1), colX + 2, tableY + 3, { width: projectColWidth - 4, align: 'center' });
      colX += projectColWidth;
    });
    doc.rect(colX, tableY, remarksColWidth, rowHeight).stroke();
    doc.fontSize(5).font('Helvetica-Bold');
    doc.text(grandTotal.toFixed(1), colX + 2, tableY + 3, { width: remarksColWidth - 4, align: 'right' });
    tableY += rowHeight;

    // % Reg/Hol row
    doc.rect(startX, tableY, dateColWidth, rowHeight).stroke();
    doc.fontSize(5.5).font('Helvetica-Bold');
    doc.text('% Reg/Hol', startX + 2, tableY + 3, { width: dateColWidth - 4 });

    colX = startX + dateColWidth;
    data.projects.slice(0, 5).forEach((_, idx) => {
      doc.rect(colX, tableY, projectColWidth, rowHeight).stroke();
      const total = period1Totals[idx].reg + period1Totals[idx].ot + period1Totals[idx].prm +
                   period2Totals[idx].reg + period2Totals[idx].ot + period2Totals[idx].prm;
      const pct = grandTotal > 0 ? (total / grandTotal * 100) : 0;
      doc.fontSize(5).font('Helvetica');
      doc.text(pct.toFixed(1) + '%', colX + 2, tableY + 3, { width: projectColWidth - 4, align: 'center' });
      colX += projectColWidth;
    });
    doc.rect(colX, tableY, remarksColWidth, rowHeight).stroke();
    doc.text('100.0%', colX + 2, tableY + 3, { width: remarksColWidth - 4, align: 'right' });
    tableY += rowHeight;

    // Totals summary row
    const totalReg = period1Totals.reduce((s, t) => s + t.reg, 0) + period2Totals.reduce((s, t) => s + t.reg, 0);
    const totalOT = period1Totals.reduce((s, t) => s + t.ot, 0) + period2Totals.reduce((s, t) => s + t.ot, 0);
    const totalPrm = period1Totals.reduce((s, t) => s + t.prm, 0) + period2Totals.reduce((s, t) => s + t.prm, 0);

    tableY += 5;
    doc.fontSize(6).font('Helvetica');
    doc.text(`Total REG + PRM: ${(totalReg + totalPrm).toFixed(1)}`, startX, tableY);
    doc.text(`Total OT: ${totalOT.toFixed(1)}`, startX + 120, tableY);
    doc.text(`Grand Total: ${grandTotal.toFixed(1)}`, startX + 240, tableY);

    // Footer notes
    tableY += 15;
    doc.fontSize(6).font('Helvetica-Oblique');
    doc.text('One separate sheet required for each District. Some Districts require special Overtime sheet to be filled out for acceptance.', startX, tableY);

    // Signature section
    tableY += 20;
    doc.fontSize(7).font('Helvetica');
    doc.text('District Rep. Approval', startX, tableY);
    doc.text('Date:', startX + 300, tableY);
    doc.moveTo(startX + 330, tableY + 8).lineTo(startX + 430, tableY + 8).stroke();

    tableY += 15;
    doc.text('Signature:', startX, tableY);
    doc.moveTo(startX + 50, tableY + 8).lineTo(startX + 200, tableY + 8).stroke();

    tableY += 20;
    doc.text('Est. Percentage Complete:', startX, tableY);
    doc.text(data.estPercentComplete || '', startX + 130, tableY);
    
    tableY += 12;
    doc.text('Est. Completion Date:', startX, tableY);
    doc.text(data.estCompletionDate || '', startX + 110, tableY);

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

export interface InvoiceData {
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  clientName?: string;
  clientAddress?: string;
  projectName: string;
  projectNumber?: string;
  purchaseOrderNumber?: string;
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

    // Header - Company info
    doc.fontSize(18).font('Helvetica-Bold').text(data.companyName, startX, 50);
    doc.fontSize(9).font('Helvetica');
    if (data.companyAddress) doc.text(data.companyAddress, startX, 72);
    if (data.companyPhone) doc.text(data.companyPhone, startX, doc.y);
    if (data.companyEmail) doc.text(data.companyEmail, startX, doc.y);

    // Invoice title
    doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', pageWidth + 50, 50, { width: 100, align: 'right' });

    // Invoice details box
    const invoiceBoxY = 110;
    doc.fontSize(10).font('Helvetica');
    doc.text('Invoice #:', startX + pageWidth - 150, invoiceBoxY);
    doc.font('Helvetica-Bold').text(data.invoiceNumber, startX + pageWidth - 50, invoiceBoxY, { width: 100 });
    
    doc.font('Helvetica').text('Date:', startX + pageWidth - 150, invoiceBoxY + 15);
    doc.font('Helvetica-Bold').text(format(data.invoiceDate, 'MM/dd/yyyy'), startX + pageWidth - 50, invoiceBoxY + 15, { width: 100 });

    if (data.dueDate) {
      doc.font('Helvetica').text('Due Date:', startX + pageWidth - 150, invoiceBoxY + 30);
      doc.font('Helvetica-Bold').text(format(data.dueDate, 'MM/dd/yyyy'), startX + pageWidth - 50, invoiceBoxY + 30, { width: 100 });
    }

    // Bill To
    doc.fontSize(10).font('Helvetica-Bold').text('Bill To:', startX, invoiceBoxY);
    doc.fontSize(10).font('Helvetica');
    if (data.clientName) doc.text(data.clientName, startX, invoiceBoxY + 15);
    if (data.clientAddress) doc.text(data.clientAddress, startX, doc.y);

    // Project info
    const projectY = 180;
    doc.fontSize(10).font('Helvetica-Bold').text('Project:', startX, projectY);
    doc.font('Helvetica').text(data.projectName, startX + 50, projectY);
    let currentY = projectY + 15;
    if (data.projectNumber) {
      doc.font('Helvetica-Bold').text('Project #:', startX, currentY);
      doc.font('Helvetica').text(data.projectNumber, startX + 60, currentY);
      currentY += 15;
    }
    if (data.purchaseOrderNumber) {
      doc.font('Helvetica-Bold').text('PO #:', startX, currentY);
      doc.font('Helvetica').text(data.purchaseOrderNumber, startX + 35, currentY);
      currentY += 15;
    }

    const monthName = format(new Date(data.year, data.month - 1), 'MMMM yyyy');
    doc.font('Helvetica-Bold').text('Period:', startX, currentY);
    doc.font('Helvetica').text(monthName, startX + 45, currentY);

    // Line items table
    const tableY = 250;
    const colWidths = [200, 80, 80, 80, 100];
    doc.lineWidth(1);

    // Header
    doc.rect(startX, tableY, pageWidth, 25).fillAndStroke('#f0f0f0', '#000');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
    let colX = startX;
    ['Description', 'Hours', 'Rate', 'Amount'].forEach((header, i) => {
      const w = i === 0 ? colWidths[0] : i === 1 ? colWidths[1] : i === 2 ? colWidths[2] : colWidths[3];
      doc.text(header, colX + 5, tableY + 8, { width: w - 10, align: i > 0 ? 'right' : 'left' });
      colX += w;
    });

    // Line items
    const lineItems = [
      { desc: 'Regular Hours', hours: data.regularHours, rate: data.regularRate },
      { desc: 'Overtime Hours', hours: data.overtimeHours, rate: data.overtimeRate },
      { desc: 'Premium Hours', hours: data.premiumHours, rate: data.premiumRate },
    ].filter(item => item.hours > 0);

    let rowY = tableY + 25;
    let subtotal = 0;

    lineItems.forEach(item => {
      const amount = item.hours * item.rate;
      subtotal += amount;

      doc.rect(startX, rowY, pageWidth, 20).stroke();
      doc.fontSize(9).font('Helvetica');
      
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

    // Totals
    rowY += 10;
    doc.fontSize(10).font('Helvetica-Bold');
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

    // Footer
    doc.fontSize(8).font('Helvetica').fillColor('#666');
    doc.text('Thank you for your business!', startX, doc.page.height - 50, { width: pageWidth, align: 'center' });

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
