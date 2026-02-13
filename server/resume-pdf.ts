import PDFDocument from "pdfkit";
import { UserProfile, Project, Company, Client } from "@shared/schema";

interface ResumeData {
  profile: UserProfile;
  projects: Project[];
  companies: Company[];
  clients: Client[];
  photoBuffer?: Buffer | null;
  companyLogoBuffer?: Buffer | null;
  companyName?: string;
  companyWebsite?: string;
}

function determineInspectorClass(profile: UserProfile): string | null {
  const title = (profile.title || "");
  const certs = (profile.certifications as string[] || []);
  const allText = [title, ...certs].join(" ");

  const explicitMatch = allText.match(/DSA\s*Class\s*(4|3|2|1)/i);
  if (explicitMatch) return `DSA Class ${explicitMatch[1]} Inspector`;

  const romanMatch = allText.match(/DSA\s*Class\s*(IV|III|II|I)\b/i);
  if (romanMatch) {
    const romanMap: Record<string, string> = { "I": "1", "II": "2", "III": "3", "IV": "4" };
    return `DSA Class ${romanMap[romanMatch[1].toUpperCase()]} Inspector`;
  }

  if (/\bDSA\b/i.test(allText)) return "DSA Inspector";

  return null;
}

function getImageDimensions(buf: Buffer): { width: number; height: number } | null {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2;
      while (offset < buf.length) {
        if (buf[offset] !== 0xff) break;
        const marker = buf[offset + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5) };
        }
        offset += 2 + buf.readUInt16BE(offset + 2);
      }
    }
  } catch {}
  return null;
}

function drawBadgeHeader(
  doc: PDFKit.PDFDocument,
  photoBuffer: Buffer | null | undefined,
  fullName: string,
  jobTitle: string,
  inspectorClass: string | null,
  companyName: string | undefined,
  companyLogoBuffer: Buffer | null | undefined,
  primaryColor: string,
  goldColor: string,
  licenseStr?: string,
  companyWebsite?: string,
  sidebarX?: number,
  sidebarWidth?: number
): { headerHeight: number; badgeX: number; badgeY: number; badgeW: number; badgeH: number; badgePad: number; photoInnerW: number; logoSectionH: number; photoH: number; nameBarH: number; titleBarH: number; footerBarH: number } {
  const pageW = doc.page.width;

  let logoDisplayW = 0;
  let logoDisplayH = 0;
  const targetLogoH = 44;

  if (companyLogoBuffer) {
    const dims = getImageDimensions(companyLogoBuffer);
    if (dims && dims.width > 0 && dims.height > 0) {
      const aspect = dims.width / dims.height;
      logoDisplayH = targetLogoH;
      logoDisplayW = targetLogoH * aspect;
    } else {
      logoDisplayH = targetLogoH;
      logoDisplayW = 100;
    }
  }

  const badgePad = 0;
  const sidebarColLeft = sidebarX != null ? sidebarX - 10 : pageW - 190;
  const sidebarColWidth = sidebarWidth != null ? sidebarWidth + 20 : 190;
  const badgeMargin = 8;
  const badgeW = sidebarColWidth - badgeMargin * 2;
  const photoInnerW = badgeW;
  const logoSectionH = companyLogoBuffer ? 30 : 0;
  const photoH = 150;
  const nameBarH = 14;
  const titleBarH = 11;
  const footerBarH = companyWebsite ? 10 : 0;
  const badgeH = badgePad + logoSectionH + photoH + nameBarH + titleBarH + footerBarH + badgePad;

  const headerHeight = 85;

  doc.rect(0, 0, pageW, headerHeight).fill(primaryColor);
  doc.rect(0, headerHeight, pageW, 3).fill(goldColor);

  const badgeX = sidebarColLeft + badgeMargin;
  const badgeY = 8;

  const textX = 30;
  const textW = badgeX - textX - 15;

  doc.fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(fullName.toUpperCase(), textX, 18, { width: textW, characterSpacing: 1.2 });

  let detailY = doc.y + 3;

  const subtitleParts: string[] = [];
  if (inspectorClass) subtitleParts.push(inspectorClass);
  if (jobTitle && jobTitle !== inspectorClass) subtitleParts.push(jobTitle);
  if (subtitleParts.length > 0) {
    doc.fillColor("#8ab4d4").font("Helvetica").fontSize(11);
    doc.text(subtitleParts.join("  |  "), textX, detailY, { width: textW });
    detailY = doc.y + 3;
  }

  const headerDetails: string[] = [];
  if (licenseStr) headerDetails.push(licenseStr);
  if (companyName) headerDetails.push(companyName);
  if (headerDetails.length > 0) {
    doc.fillColor("#a0b8cf").font("Helvetica").fontSize(8.5);
    doc.text(headerDetails.join("  |  "), textX, detailY, { width: textW });
  }

  return { headerHeight: headerHeight + 3, badgeX, badgeY, badgeW, badgeH, badgePad, photoInnerW, logoSectionH, photoH, nameBarH, titleBarH, footerBarH };
}

function drawBadgeOverlay(
  doc: PDFKit.PDFDocument,
  photoBuffer: Buffer | null | undefined,
  fullName: string,
  jobTitle: string,
  inspectorClass: string | null,
  companyLogoBuffer: Buffer | null | undefined,
  goldColor: string,
  companyWebsite: string | undefined,
  badge: { badgeX: number; badgeY: number; badgeW: number; badgeH: number; badgePad: number; photoInnerW: number; logoSectionH: number; photoH: number; nameBarH: number; titleBarH: number; footerBarH: number }
): void {
  const { badgeX, badgeY, badgeW, badgeH, badgePad, photoInnerW, logoSectionH, photoH, nameBarH, titleBarH, footerBarH } = badge;

  doc.rect(badgeX, badgeY, badgeW, badgeH).fill("#ffffff");

  let badgeInnerY = badgeY + badgePad;
  const photoInnerX = badgeX + badgePad;

  if (companyLogoBuffer && logoSectionH > 0) {
    const gradientSteps = 15;
    const stepH = logoSectionH / gradientSteps;
    const startR = 0xff, startG = 0xff, startB = 0xff;
    const endR = 0xd4, endG = 0xb8, endB = 0x96;
    for (let i = 0; i < gradientSteps; i++) {
      const t = i / (gradientSteps - 1);
      const r = Math.round(startR + (endR - startR) * t);
      const g = Math.round(startG + (endG - startG) * t);
      const b = Math.round(startB + (endB - startB) * t);
      const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      doc.rect(photoInnerX, badgeInnerY + i * stepH, photoInnerW, stepH + 0.5).fill(hex);
    }

    try {
      const logoAreaW = photoInnerW - 4;
      const dims = getImageDimensions(companyLogoBuffer);
      let fitH = logoSectionH - 4;
      let fitW = logoAreaW;
      if (dims && dims.width > 0 && dims.height > 0) {
        const aspect = dims.width / dims.height;
        const candidateW = fitH * aspect;
        if (candidateW > logoAreaW) {
          fitW = logoAreaW;
          fitH = logoAreaW / aspect;
        } else {
          fitW = candidateW;
        }
      }
      const logoX = photoInnerX + 2 + (logoAreaW - fitW) / 2;
      const logoY = badgeInnerY + (logoSectionH - fitH) / 2;
      doc.image(companyLogoBuffer, logoX, logoY, {
        fit: [fitW, fitH],
        align: "center",
        valign: "center",
      });
    } catch (e) {}
    badgeInnerY += logoSectionH;
  }

  if (photoBuffer) {
    try {
      doc.save();
      doc.rect(photoInnerX, badgeInnerY, photoInnerW, photoH).clip();
      doc.image(photoBuffer, photoInnerX, badgeInnerY, {
        width: photoInnerW,
        height: photoH,
        fit: [photoInnerW, photoH],
        align: "center",
        valign: "center",
      });
      doc.restore();
    } catch (e) {}
  } else {
    doc.fillColor("#8b7355").font("Helvetica-Bold").fontSize(30);
    const initials = fullName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    doc.text(initials, photoInnerX, badgeInnerY + photoH / 2 - 15, { width: photoInnerW, align: "center" });
  }

  badgeInnerY += photoH;

  doc.rect(badgeX + badgePad, badgeInnerY, photoInnerW, nameBarH).fill(goldColor);
  const nameFontSize = 8;
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(nameFontSize);
  const nameTextY = badgeInnerY + (nameBarH - nameFontSize) / 2;
  doc.text(fullName, badgeX + badgePad + 1, nameTextY, { width: photoInnerW - 2, align: "center" });
  badgeInnerY += nameBarH;

  doc.rect(badgeX + badgePad, badgeInnerY, photoInnerW, titleBarH).fill("#3d3926");
  const titleText = inspectorClass || jobTitle;
  const titleFontSize = 6;
  doc.fillColor(goldColor).font("Helvetica-Bold").fontSize(titleFontSize);
  const titleTextY = badgeInnerY + (titleBarH - titleFontSize) / 2;
  doc.text(titleText, badgeX + badgePad + 1, titleTextY, { width: photoInnerW - 2, align: "center" });
  badgeInnerY += titleBarH;

  if (companyWebsite) {
    doc.rect(badgeX + badgePad, badgeInnerY, photoInnerW, footerBarH).fill("#f5f0e8");
    const urlFontSize = 5;
    doc.fillColor("#6b5c3e").font("Helvetica").fontSize(urlFontSize);
    const urlTextY = badgeInnerY + (footerBarH - urlFontSize) / 2;
    const displayUrl = companyWebsite.replace(/^https?:\/\//, "").replace(/\/$/, "");
    doc.text(displayUrl, badgeX + badgePad + 1, urlTextY, { width: photoInnerW - 2, align: "center" });
  }
}

export async function generateResumePDF(data: ResumeData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        bufferPages: true,
      });

      const buffers: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const pageWidth = doc.page.width - 80;
      const sidebarWidth = 170;
      const mainColWidth = pageWidth - sidebarWidth - 24;
      const mainColX = 40;
      const sidebarX = mainColX + mainColWidth + 24;

      const fullName = `${data.profile.firstName || ""} ${data.profile.lastName || ""}`.trim() || "Inspector";
      const jobTitle = data.profile.title || "Construction Inspector";
      const inspectorClass = determineInspectorClass(data.profile);

      const primaryColor = "#1a2e47";
      const accentColor = "#1e5a96";
      const goldColor = "#c9a84c";
      const textColor = "#2d3748";
      const lightText = "#64748b";
      const sidebarBg = "#f1f5f9";

      const licenseStr = data.profile.licenseNumber
        ? `License: ${data.profile.licenseNumber}${data.profile.licenseState ? ` (${data.profile.licenseState})` : ""}`
        : undefined;

      const badgeInfo = drawBadgeHeader(
        doc, data.photoBuffer, fullName, jobTitle, inspectorClass,
        data.companyName, data.companyLogoBuffer, primaryColor, goldColor, licenseStr,
        data.companyWebsite, sidebarX, sidebarWidth
      );
      const headerBottom = badgeInfo.headerHeight;

      doc.rect(sidebarX - 10, headerBottom, sidebarWidth + 20, doc.page.height - headerBottom - 40).fill(sidebarBg);

      drawBadgeOverlay(
        doc, data.photoBuffer, fullName, jobTitle, inspectorClass,
        data.companyLogoBuffer, goldColor, data.companyWebsite, badgeInfo
      );

      const badgeBottom = badgeInfo.badgeY + badgeInfo.badgeH;
      const badgeOverlap = Math.max(0, badgeBottom - headerBottom);
      let sidebarY = headerBottom + badgeOverlap + 10;

      const drawSidebarSection = (title: string) => {
        if (sidebarY > doc.page.height - 80) return false;
        doc.fillColor(accentColor)
          .font("Helvetica-Bold")
          .fontSize(9)
          .text(title.toUpperCase(), sidebarX, sidebarY, { width: sidebarWidth, characterSpacing: 0.8 });
        sidebarY += 13;
        sidebarY += 4;
        return true;
      };

      const certifications = data.profile.certifications as string[] | null;
      if (certifications && certifications.length > 0) {
        if (drawSidebarSection("Certifications")) {
          for (const cert of certifications) {
            if (sidebarY > doc.page.height - 60) break;
            doc.fillColor(textColor).font("Helvetica").fontSize(8.5);
            doc.text(`\u2022  ${cert}`, sidebarX + 4, sidebarY, { width: sidebarWidth - 4 });
            sidebarY = doc.y + 5;
          }
          sidebarY += 10;
        }
      }

      if (data.profile.licenseNumber || data.profile.licenseState) {
        if (drawSidebarSection("License")) {
          if (data.profile.licenseNumber) {
            doc.fillColor(textColor).font("Helvetica-Bold").fontSize(8.5);
            doc.text(data.profile.licenseNumber, sidebarX + 4, sidebarY, { width: sidebarWidth - 4 });
            sidebarY = doc.y + 3;
          }
          if (data.profile.licenseState) {
            doc.fillColor(lightText).font("Helvetica").fontSize(8);
            doc.text(data.profile.licenseState, sidebarX + 4, sidebarY, { width: sidebarWidth - 4 });
            sidebarY = doc.y + 3;
          }
          sidebarY += 10;
        }
      }

      const education = data.profile.education as Array<{ degree: string; school: string; status?: string }> | null;
      if (education && education.length > 0) {
        if (drawSidebarSection("Education")) {
          for (const edu of education) {
            if (sidebarY > doc.page.height - 60) break;
            doc.fillColor(primaryColor).font("Helvetica-Bold").fontSize(8.5);
            doc.text(edu.degree, sidebarX + 4, sidebarY, { width: sidebarWidth - 4 });
            sidebarY = doc.y + 2;
            doc.fillColor(lightText).font("Helvetica").fontSize(8);
            doc.text(edu.school, sidebarX + 4, sidebarY, { width: sidebarWidth - 4 });
            sidebarY = doc.y + 2;
            if (edu.status) {
              doc.fillColor(goldColor).font("Helvetica-Oblique").fontSize(7.5);
              doc.text(edu.status, sidebarX + 4, sidebarY, { width: sidebarWidth - 4 });
              sidebarY = doc.y + 2;
            }
            sidebarY += 6;
          }
          sidebarY += 6;
        }
      }

      const references = data.profile.references as Array<{ name: string; title: string; organization: string; email?: string; phone?: string }> | null;
      if (references && references.length > 0) {
        if (drawSidebarSection("References")) {
          for (const ref of references) {
            if (sidebarY > doc.page.height - 60) break;
            doc.fillColor(primaryColor).font("Helvetica-Bold").fontSize(8.5);
            doc.text(ref.name, sidebarX + 4, sidebarY, { width: sidebarWidth - 4 });
            sidebarY = doc.y + 2;
            doc.fillColor(textColor).font("Helvetica").fontSize(8);
            doc.text(`${ref.title}, ${ref.organization}`, sidebarX + 4, sidebarY, { width: sidebarWidth - 4 });
            sidebarY = doc.y + 2;
            const refContact: string[] = [];
            if (ref.email) refContact.push(ref.email);
            if (ref.phone) refContact.push(ref.phone);
            if (refContact.length > 0) {
              doc.fillColor(lightText).font("Helvetica").fontSize(7.5);
              doc.text(refContact.join("  |  "), sidebarX + 4, sidebarY, { width: sidebarWidth - 4 });
              sidebarY = doc.y + 2;
            }
            sidebarY += 6;
          }
          sidebarY += 6;
        }
      }

      let currentY = headerBottom + 16;

      const drawMainSection = (title: string) => {
        if (currentY > doc.page.height - 80) {
          doc.addPage();
          currentY = 50;
        }
        doc.fillColor(accentColor)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(title.toUpperCase(), mainColX, currentY, { width: mainColWidth, characterSpacing: 0.8 });
        currentY += 16;
        currentY += 4;
      };

      const bio = data.profile.bio as string | null;
      if (bio) {
        drawMainSection("Profile Summary");
        doc.fillColor(textColor).font("Helvetica").fontSize(9.5);
        doc.text(bio, mainColX, currentY, { width: mainColWidth, lineGap: 3.5 });
        currentY = doc.y + 20;
      }

      const assignedProjects = data.projects.filter(p => p.name);
      const jobHistoryRaw = data.profile.jobHistory as Array<{ title: string; company: string; client?: string; projectName?: string; projectNumber?: string; projectValue?: string; startDate?: string; endDate?: string; description?: string }> | null;
      const jobHistory = (jobHistoryRaw || []).slice().sort((a, b) => {
        const parseDate = (d?: string) => {
          if (!d || d.toLowerCase() === "present") return Infinity;
          const parsed = Date.parse(d);
          return isNaN(parsed) ? 0 : parsed;
        };
        return parseDate(b.endDate) - parseDate(a.endDate);
      });

      if (assignedProjects.length > 0 || jobHistory.length > 0) {
        drawMainSection("Project Experience");

        for (const project of assignedProjects.slice(0, 15)) {
          if (currentY > doc.page.height - 100) {
            doc.addPage();
            currentY = 50;
          }

          const company = data.companies.find(c => c.id === project.companyId);
          const clientRecord = (project as any).clientId
            ? data.clients.find(c => c.id === (project as any).clientId)
            : null;
          const clientName = clientRecord?.name || project.client || null;
          const projectVal = (project as any).projectValue || null;

          const getYearRange = () => {
            if (!project.startDate && !project.substantialCompletionDate) return null;
            const startYear = project.startDate ? new Date(project.startDate).getUTCFullYear().toString() : "";
            const endYear = project.substantialCompletionDate ? new Date(project.substantialCompletionDate).getUTCFullYear().toString() : "Present";
            return `${startYear} - ${endYear}`;
          };
          const yearRange = getYearRange();

          const lineFont = 9;
          const lineFontBold = 9;

          if (company || projectVal) {
            doc.font("Helvetica-Bold").fontSize(lineFontBold).fillColor(primaryColor);
            const companyText = company?.name || "";
            doc.text(companyText, mainColX, currentY, { width: mainColWidth, continued: false });
            if (projectVal) {
              const valWidth = doc.widthOfString(projectVal);
              doc.text(projectVal, mainColX + mainColWidth - valWidth, currentY, { width: valWidth, align: "right" });
            }
            currentY = doc.y + 1;
          }

          if (clientName || yearRange) {
            doc.font("Helvetica").fontSize(lineFont).fillColor(textColor);
            const clientText = clientName || "";
            doc.text(clientText, mainColX, currentY, { width: mainColWidth, continued: false });
            if (yearRange) {
              const yrWidth = doc.widthOfString(yearRange);
              doc.text(yearRange, mainColX + mainColWidth - yrWidth, currentY, { width: yrWidth, align: "right" });
            }
            currentY = doc.y + 1;
          }

          const projectNameParts: string[] = [project.name];
          if (project.projectNumber) projectNameParts.push(`(${project.projectNumber})`);
          doc.font("Helvetica-Bold").fontSize(lineFont).fillColor(accentColor);
          doc.text(projectNameParts.join(" "), mainColX, currentY, { width: mainColWidth });
          currentY = doc.y + 1;

          if ((project as any).scopeOfWork) {
            doc.fillColor(textColor).font("Helvetica").fontSize(8.5);
            doc.text((project as any).scopeOfWork, mainColX, currentY, { width: mainColWidth, lineGap: 2 });
            currentY = doc.y + 1;
          }

          currentY += 10;
        }

        for (const job of jobHistory) {
          if (currentY > doc.page.height - 100) {
            doc.addPage();
            currentY = 50;
          }

          const lineFont = 9;
          const lineFontBold = 9;

          if (job.company || job.projectValue) {
            doc.font("Helvetica-Bold").fontSize(lineFontBold).fillColor(primaryColor);
            doc.text(job.company, mainColX, currentY, { width: mainColWidth, continued: false });
            if (job.projectValue) {
              const valWidth = doc.widthOfString(job.projectValue);
              doc.text(job.projectValue, mainColX + mainColWidth - valWidth, currentY, { width: valWidth, align: "right" });
            }
            currentY = doc.y + 1;
          }

          if (job.client || job.startDate || job.endDate) {
            doc.font("Helvetica").fontSize(lineFont).fillColor(textColor);
            const clientText = job.client || "";
            doc.text(clientText, mainColX, currentY, { width: mainColWidth, continued: false });
            if (job.startDate || job.endDate) {
              const dateRange = `${job.startDate || "?"} - ${job.endDate || "Present"}`;
              const yrWidth = doc.widthOfString(dateRange);
              doc.text(dateRange, mainColX + mainColWidth - yrWidth, currentY, { width: yrWidth, align: "right" });
            }
            currentY = doc.y + 1;
          }

          const jobNameParts: string[] = [];
          if (job.projectName) {
            jobNameParts.push(job.projectName);
          } else {
            jobNameParts.push(job.title);
          }
          if (job.projectNumber) jobNameParts.push(`(${job.projectNumber})`);
          doc.font("Helvetica-Bold").fontSize(lineFont).fillColor(accentColor);
          doc.text(jobNameParts.join(" "), mainColX, currentY, { width: mainColWidth });
          currentY = doc.y + 1;

          if (job.description) {
            doc.fillColor(textColor).font("Helvetica").fontSize(8.5);
            doc.text(job.description, mainColX, currentY, { width: mainColWidth, lineGap: 2 });
            currentY = doc.y + 1;
          }

          currentY += 10;
        }
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
