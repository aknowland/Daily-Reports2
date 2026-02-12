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

function drawBadge(doc: PDFKit.PDFDocument, x: number, y: number, size: number, photoBuffer: Buffer | null | undefined, inspectorClass: string | null, primaryColor: string) {
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const outerRadius = size / 2;
  const innerRadius = outerRadius - 4;
  const photoRadius = innerRadius - 6;

  doc.save();
  doc.circle(centerX, centerY, outerRadius).fill("#c9a84c");
  doc.circle(centerX, centerY, outerRadius - 2).fill(primaryColor);
  doc.circle(centerX, centerY, innerRadius).fill("#c9a84c");
  doc.circle(centerX, centerY, innerRadius - 1.5).fill("#1a2e47");

  if (photoBuffer) {
    try {
      doc.save();
      doc.circle(centerX, centerY, photoRadius).clip();
      const photoSize = photoRadius * 2;
      doc.image(photoBuffer, centerX - photoRadius, centerY - photoRadius, {
        width: photoSize,
        height: photoSize,
        fit: [photoSize, photoSize],
        align: "center",
        valign: "center",
      });
      doc.restore();
    } catch (e) {
      doc.circle(centerX, centerY, photoRadius).fill("#2a4a6e");
    }
  } else {
    doc.circle(centerX, centerY, photoRadius).fill("#2a4a6e");
    doc.fillColor("#8ab4d4").font("Helvetica-Bold").fontSize(photoRadius * 0.7);
    doc.text("?", centerX - photoRadius * 0.2, centerY - photoRadius * 0.35, { width: photoRadius, align: "center" });
  }

  doc.restore();

  if (inspectorClass) {
    const labelY = y + size + 6;
    doc.fillColor("#c9a84c")
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(inspectorClass.toUpperCase(), x - 10, labelY, { width: size + 20, align: "center" });
    return labelY + 14;
  }

  return y + size + 6;
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

      doc.rect(0, 0, doc.page.width, 120).fill(primaryColor);
      doc.rect(0, 120, doc.page.width, 3).fill(goldColor);

      doc.fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(26)
        .text(fullName.toUpperCase(), rightColX, 28, { width: rightColWidth, characterSpacing: 1.5 });

      doc.fillColor("#8ab4d4")
        .font("Helvetica")
        .fontSize(13)
        .text(jobTitle, rightColX, 60, { width: rightColWidth });

      const headerDetails: string[] = [];
      if (data.profile.licenseNumber) {
        headerDetails.push(`License: ${data.profile.licenseNumber}${data.profile.licenseState ? ` (${data.profile.licenseState})` : ""}`);
      }
      if (data.companyName) headerDetails.push(data.companyName);

      if (headerDetails.length > 0) {
        doc.fillColor("#a0b8cf")
          .font("Helvetica")
          .fontSize(9)
          .text(headerDetails.join("  |  "), rightColX, 82, { width: rightColWidth });
      }

      doc.rect(leftColX - 10, 123, leftColWidth + 20, doc.page.height - 163).fill(sidebarBg);

      const badgeSize = 100;
      const badgeX = leftColX + (leftColWidth - badgeSize) / 2;
      let leftY = drawBadge(doc, badgeX, 140, badgeSize, data.photoBuffer, inspectorClass, primaryColor);
      leftY += 12;

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

      let currentY = 140;

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
          refY = doc.y + 6;

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
