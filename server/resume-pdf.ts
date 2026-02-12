import PDFDocument from "pdfkit";
import { UserProfile, Project, Company } from "@shared/schema";

interface ResumeData {
  profile: UserProfile;
  projects: Project[];
  companies: Company[];
  photoBuffer?: Buffer | null;
  companyLogoBuffer?: Buffer | null;
  companyName?: string;
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
  licenseStr?: string
): number {
  const pageW = doc.page.width;

  const badgeX = 30;
  const badgeY = 8;
  const badgePad = 3;

  let logoDisplayW = 0;
  let logoDisplayH = 0;
  const targetLogoH = 30;

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

  const minBadgeW = 110;
  const badgeW = companyLogoBuffer
    ? Math.max(minBadgeW, logoDisplayW + badgePad * 2 + 4)
    : minBadgeW;

  const photoH = 68;
  const nameBarH = 16;
  const titleBarH = 13;
  const logoSection = companyLogoBuffer ? logoDisplayH + 2 : 0;
  const badgeH = badgePad + logoSection + photoH + nameBarH + titleBarH + badgePad;

  const headerHeight = Math.max(badgeH + badgeY * 2, 120);

  doc.rect(0, 0, pageW, headerHeight).fill(primaryColor);
  doc.rect(0, headerHeight, pageW, 3).fill(goldColor);

  doc.rect(badgeX, badgeY, badgeW, badgeH).fill("#ffffff");

  let badgeInnerY = badgeY + badgePad;

  if (companyLogoBuffer) {
    try {
      const logoAreaW = badgeW - badgePad * 2 - 4;
      const fitW = Math.min(logoDisplayW, logoAreaW);
      const fitH = logoDisplayH;
      const logoX = badgeX + badgePad + 2 + (logoAreaW - fitW) / 2;
      doc.image(companyLogoBuffer, logoX, badgeInnerY, {
        fit: [fitW, fitH],
        align: "center",
        valign: "center",
      });
    } catch (e) {}
    badgeInnerY += logoDisplayH + 2;
  }

  const photoInnerX = badgeX + badgePad;
  const photoInnerW = badgeW - badgePad * 2;

  doc.rect(photoInnerX, badgeInnerY, photoInnerW, photoH).fill("#4a5568");

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
    doc.fillColor("#8ab4d4").font("Helvetica-Bold").fontSize(24);
    const initials = fullName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    doc.text(initials, photoInnerX, badgeInnerY + photoH / 2 - 12, { width: photoInnerW, align: "center" });
  }

  badgeInnerY += photoH;

  doc.rect(badgeX + badgePad, badgeInnerY, badgeW - badgePad * 2, nameBarH).fill(goldColor);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(6.5);
  doc.text(fullName, badgeX + badgePad + 1, badgeInnerY + 3, { width: badgeW - badgePad * 2 - 2, align: "center" });
  badgeInnerY += nameBarH;

  doc.rect(badgeX + badgePad, badgeInnerY, badgeW - badgePad * 2, titleBarH).fill("#3d3926");
  const titleText = inspectorClass || jobTitle;
  doc.fillColor(goldColor).font("Helvetica").fontSize(5);
  doc.text(titleText, badgeX + badgePad + 1, badgeInnerY + 3, { width: badgeW - badgePad * 2 - 2, align: "center" });

  const textX = badgeX + badgeW + 20;
  const textW = pageW - textX - 30;

  doc.fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(24)
    .text(fullName.toUpperCase(), textX, 24, { width: textW, characterSpacing: 1.2 });

  let detailY = doc.y + 4;

  const subtitleParts: string[] = [];
  if (inspectorClass) subtitleParts.push(inspectorClass);
  if (jobTitle && jobTitle !== inspectorClass) subtitleParts.push(jobTitle);
  if (subtitleParts.length > 0) {
    doc.fillColor("#8ab4d4").font("Helvetica").fontSize(12);
    doc.text(subtitleParts.join("  |  "), textX, detailY, { width: textW });
    detailY = doc.y + 4;
  }

  const headerDetails: string[] = [];
  if (licenseStr) headerDetails.push(licenseStr);
  if (companyName) headerDetails.push(companyName);
  if (headerDetails.length > 0) {
    doc.fillColor("#a0b8cf").font("Helvetica").fontSize(9);
    doc.text(headerDetails.join("  |  "), textX, detailY, { width: textW });
  }

  return headerHeight + 3;
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
      const leftColWidth = 170;
      const rightColWidth = pageWidth - leftColWidth - 24;
      const leftColX = 40;
      const rightColX = leftColX + leftColWidth + 24;

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

      const headerBottom = drawBadgeHeader(
        doc, data.photoBuffer, fullName, jobTitle, inspectorClass,
        data.companyName, data.companyLogoBuffer, primaryColor, goldColor, licenseStr
      );

      doc.rect(leftColX - 10, headerBottom, leftColWidth + 20, doc.page.height - headerBottom - 40).fill(sidebarBg);

      let leftY = headerBottom + 16;

      const drawLeftSection = (title: string) => {
        if (leftY > doc.page.height - 80) return false;
        doc.fillColor(accentColor)
          .font("Helvetica-Bold")
          .fontSize(9)
          .text(title.toUpperCase(), leftColX, leftY, { width: leftColWidth, characterSpacing: 0.8 });
        leftY += 13;
        doc.moveTo(leftColX, leftY - 2).lineTo(leftColX + leftColWidth * 0.4, leftY - 2).lineWidth(1.5).strokeColor(goldColor).stroke();
        leftY += 8;
        return true;
      };

      const certifications = data.profile.certifications as string[] | null;
      if (certifications && certifications.length > 0) {
        if (drawLeftSection("Certifications")) {
          for (const cert of certifications) {
            if (leftY > doc.page.height - 60) break;
            doc.fillColor(textColor).font("Helvetica").fontSize(8.5);
            doc.text(`\u2022  ${cert}`, leftColX + 4, leftY, { width: leftColWidth - 4 });
            leftY = doc.y + 5;
          }
          leftY += 10;
        }
      }

      const education = data.profile.education as Array<{ degree: string; school: string; status?: string }> | null;
      if (education && education.length > 0) {
        if (drawLeftSection("Education")) {
          for (const edu of education) {
            if (leftY > doc.page.height - 60) break;
            doc.fillColor(primaryColor).font("Helvetica-Bold").fontSize(8.5);
            doc.text(edu.degree, leftColX + 4, leftY, { width: leftColWidth - 4 });
            leftY = doc.y + 2;
            doc.fillColor(lightText).font("Helvetica").fontSize(8);
            doc.text(edu.school, leftColX + 4, leftY, { width: leftColWidth - 4 });
            leftY = doc.y + 2;
            if (edu.status) {
              doc.fillColor(goldColor).font("Helvetica-Oblique").fontSize(7.5);
              doc.text(edu.status, leftColX + 4, leftY, { width: leftColWidth - 4 });
              leftY = doc.y + 2;
            }
            leftY += 6;
          }
          leftY += 6;
        }
      }

      if (data.profile.licenseNumber || data.profile.licenseState) {
        if (drawLeftSection("License")) {
          if (data.profile.licenseNumber) {
            doc.fillColor(textColor).font("Helvetica-Bold").fontSize(8.5);
            doc.text(data.profile.licenseNumber, leftColX + 4, leftY, { width: leftColWidth - 4 });
            leftY = doc.y + 3;
          }
          if (data.profile.licenseState) {
            doc.fillColor(lightText).font("Helvetica").fontSize(8);
            doc.text(data.profile.licenseState, leftColX + 4, leftY, { width: leftColWidth - 4 });
            leftY = doc.y + 3;
          }
          leftY += 10;
        }
      }

      if (data.profile.contractorCompanyName) {
        if (drawLeftSection("Company")) {
          doc.fillColor(textColor).font("Helvetica").fontSize(8.5);
          doc.text(data.profile.contractorCompanyName, leftColX + 4, leftY, { width: leftColWidth - 4 });
          leftY = doc.y + 4;
          if (data.profile.contractorAddress) {
            doc.fillColor(lightText).font("Helvetica").fontSize(8);
            doc.text(data.profile.contractorAddress, leftColX + 4, leftY, { width: leftColWidth - 4 });
            leftY = doc.y + 4;
          }
          leftY += 10;
        }
      }

      let currentY = headerBottom + 16;

      const drawRightSection = (title: string) => {
        if (currentY > doc.page.height - 80) {
          doc.addPage();
          currentY = 50;
        }
        doc.fillColor(accentColor)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(title.toUpperCase(), rightColX, currentY, { width: rightColWidth, characterSpacing: 0.8 });
        currentY += 16;
        doc.moveTo(rightColX, currentY - 2).lineTo(rightColX + rightColWidth, currentY - 2).lineWidth(1.5).strokeColor(goldColor).stroke();
        currentY += 8;
      };

      const bio = data.profile.bio as string | null;
      if (bio) {
        drawRightSection("Profile Summary");
        doc.fillColor(textColor).font("Helvetica").fontSize(9.5);
        doc.text(bio, rightColX, currentY, { width: rightColWidth, lineGap: 3.5 });
        currentY = doc.y + 20;
      }

      const assignedProjects = data.projects.filter(p => p.name);
      if (assignedProjects.length > 0) {
        drawRightSection("Project Experience");

        for (const project of assignedProjects.slice(0, 15)) {
          if (currentY > doc.page.height - 100) {
            doc.addPage();
            currentY = 50;
          }

          doc.fillColor(primaryColor).font("Helvetica-Bold").fontSize(10);
          doc.text(project.name, rightColX, currentY, { width: rightColWidth });
          currentY = doc.y + 2;

          const details: string[] = [];
          if (project.projectNumber) details.push(project.projectNumber);

          const company = data.companies.find(c => c.id === project.companyId);
          if (company) details.push(company.name);

          if (project.startDate || project.substantialCompletionDate) {
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const formatDateUTC = (d: Date) => `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
            const start = project.startDate ? formatDateUTC(new Date(project.startDate)) : "";
            const end = project.substantialCompletionDate ? formatDateUTC(new Date(project.substantialCompletionDate)) : "Present";
            details.push(`${start} - ${end}`);
          }

          if (details.length > 0) {
            doc.fillColor(lightText).font("Helvetica").fontSize(8.5);
            doc.text(details.join("  |  "), rightColX, currentY, { width: rightColWidth });
            currentY = doc.y + 2;
          }

          currentY += 10;
        }
      }

      const jobHistory = data.profile.jobHistory as Array<{ title: string; company: string; startDate?: string; endDate?: string; description?: string }> | null;
      if (jobHistory && jobHistory.length > 0) {
        drawRightSection("Work History");

        for (const job of jobHistory) {
          if (currentY > doc.page.height - 100) {
            doc.addPage();
            currentY = 50;
          }

          doc.fillColor(primaryColor).font("Helvetica-Bold").fontSize(10);
          doc.text(job.title, rightColX, currentY, { width: rightColWidth });
          currentY = doc.y + 2;

          const jobDetails: string[] = [job.company];
          if (job.startDate || job.endDate) {
            jobDetails.push(`${job.startDate || "?"} - ${job.endDate || "Present"}`);
          }

          doc.fillColor(lightText).font("Helvetica").fontSize(8.5);
          doc.text(jobDetails.join("  |  "), rightColX, currentY, { width: rightColWidth });
          currentY = doc.y + 2;

          if (job.description) {
            doc.fillColor(textColor).font("Helvetica").fontSize(9);
            doc.text(job.description, rightColX, currentY, { width: rightColWidth, lineGap: 2 });
            currentY = doc.y + 2;
          }

          currentY += 10;
        }
      }

      const references = data.profile.references as Array<{ name: string; title: string; organization: string; email?: string; phone?: string }> | null;
      if (references && references.length > 0) {
        const refStartY = Math.max(currentY, leftY) + 14;
        if (refStartY > doc.page.height - 120) {
          doc.addPage();
          currentY = 50;
        } else {
          currentY = refStartY;
        }

        doc.fillColor(accentColor)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text("REFERENCES", leftColX, currentY, { width: pageWidth, characterSpacing: 0.8 });
        currentY += 16;
        doc.moveTo(leftColX, currentY - 2).lineTo(leftColX + pageWidth, currentY - 2).lineWidth(1.5).strokeColor(goldColor).stroke();
        currentY += 8;

        const refColWidth = (pageWidth - 20) / 2;
        let refX = leftColX;
        let refRowStartY = currentY;

        for (let i = 0; i < references.length; i++) {
          const ref = references[i];

          if (i > 0 && i % 2 === 0) {
            refX = leftColX;
            refRowStartY = currentY + 4;
            if (refRowStartY > doc.page.height - 80) {
              doc.addPage();
              refRowStartY = 50;
            }
          }

          const colX = (i % 2 === 0) ? leftColX : leftColX + refColWidth + 20;
          let refY = (i % 2 === 0) ? refRowStartY : refRowStartY;

          doc.fillColor(primaryColor).font("Helvetica-Bold").fontSize(9.5);
          doc.text(ref.name, colX, refY, { width: refColWidth });
          refY = doc.y + 1;

          doc.fillColor(textColor).font("Helvetica").fontSize(8.5);
          doc.text(`${ref.title}, ${ref.organization}`, colX, refY, { width: refColWidth });
          refY = doc.y + 1;

          const refContact: string[] = [];
          if (ref.email) refContact.push(ref.email);
          if (ref.phone) refContact.push(ref.phone);
          if (refContact.length > 0) {
            doc.fillColor(lightText).font("Helvetica").fontSize(8);
            doc.text(refContact.join("  |  "), colX, refY, { width: refColWidth });
            refY = doc.y + 1;
          }
          refY += 4;

          if (i % 2 === 0 || refY > currentY) {
            currentY = refY;
          }
        }
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
