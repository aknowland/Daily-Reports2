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
      const leftColWidth = 180;
      const rightColWidth = pageWidth - leftColWidth - 20;
      const leftColX = 40;
      const rightColX = leftColX + leftColWidth + 20;

      const fullName = `${data.profile.firstName || ""} ${data.profile.lastName || ""}`.trim() || "Inspector";
      const jobTitle = data.profile.title || "Construction Inspector";

      const primaryColor = "#1e3a5f";
      const accentColor = "#2563eb";
      const textColor = "#333333";
      const lightGray = "#f0f4f8";
      const mediumGray = "#94a3b8";

      doc.rect(0, 0, doc.page.width, 130).fill(primaryColor);

      if (data.photoBuffer) {
        try {
          doc.save();
          const photoSize = 80;
          const photoX = leftColX + (leftColWidth - photoSize) / 2;
          const photoY = 25;
          doc.roundedRect(photoX, photoY, photoSize, photoSize, 6).clip();
          doc.image(data.photoBuffer, photoX, photoY, { width: photoSize, height: photoSize, fit: [photoSize, photoSize], align: "center", valign: "center" });
          doc.restore();
        } catch (e) {
          // Photo rendering failed, skip
        }
      }

      doc.fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(24)
        .text(fullName.toUpperCase(), rightColX, 30, { width: rightColWidth });

      doc.fillColor("#94b8d9")
        .font("Helvetica")
        .fontSize(13)
        .text(jobTitle, rightColX, 58, { width: rightColWidth });

      let contactY = 80;
      doc.fillColor("#c0d4e8").fontSize(9).font("Helvetica");

      const contactItems: string[] = [];
      if (data.profile.email) contactItems.push(data.profile.email);
      if (data.profile.phone) contactItems.push(data.profile.phone);
      if (data.profile.licenseNumber) contactItems.push(`License: ${data.profile.licenseNumber}`);
      if (data.profile.licenseState) contactItems.push(data.profile.licenseState);

      if (contactItems.length > 0) {
        doc.text(contactItems.join("  |  "), rightColX, contactY, { width: rightColWidth });
      }

      if (data.companyName) {
        contactY += 14;
        doc.text(data.companyName, rightColX, contactY, { width: rightColWidth });
      }

      let currentY = 150;

      const drawSectionHeader = (title: string, x: number, width: number) => {
        doc.fillColor(accentColor)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(title.toUpperCase(), x, currentY, { width });
        currentY += 16;
        doc.moveTo(x, currentY - 2).lineTo(x + width, currentY - 2).lineWidth(1).strokeColor(accentColor).stroke();
        currentY += 6;
      };

      const bio = data.profile.bio as string | null;
      if (bio) {
        drawSectionHeader("Profile Summary", rightColX, rightColWidth);
        doc.fillColor(textColor).font("Helvetica").fontSize(9.5);
        doc.text(bio, rightColX, currentY, { width: rightColWidth, lineGap: 3 });
        currentY = doc.y + 16;
      }

      const assignedProjects = data.projects.filter(p => p.name);
      if (assignedProjects.length > 0) {
        drawSectionHeader("Project Experience", rightColX, rightColWidth);

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
            doc.fillColor(mediumGray).font("Helvetica").fontSize(8.5);
            doc.text(details.join("  |  "), rightColX, currentY, { width: rightColWidth });
            currentY = doc.y + 2;
          }

          currentY += 8;
        }
      }

      let leftY = 150;

      const drawLeftSectionHeader = (title: string) => {
        doc.fillColor(primaryColor)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(title.toUpperCase(), leftColX, leftY, { width: leftColWidth });
        leftY += 14;
        doc.moveTo(leftColX, leftY - 2).lineTo(leftColX + leftColWidth, leftY - 2).lineWidth(0.5).strokeColor(primaryColor).stroke();
        leftY += 8;
      };

      const certifications = data.profile.certifications as string[] | null;
      if (certifications && certifications.length > 0) {
        drawLeftSectionHeader("Certifications");

        for (const cert of certifications) {
          if (leftY > doc.page.height - 60) break;
          doc.fillColor(textColor).font("Helvetica").fontSize(9);
          doc.text(`\u2022  ${cert}`, leftColX, leftY, { width: leftColWidth });
          leftY = doc.y + 4;
        }
        leftY += 10;
      }

      const education = data.profile.education as Array<{ degree: string; school: string; status?: string }> | null;
      if (education && education.length > 0) {
        drawLeftSectionHeader("Education");

        for (const edu of education) {
          if (leftY > doc.page.height - 60) break;
          doc.fillColor(primaryColor).font("Helvetica-Bold").fontSize(9);
          doc.text(edu.degree, leftColX, leftY, { width: leftColWidth });
          leftY = doc.y + 2;

          doc.fillColor(textColor).font("Helvetica").fontSize(8.5);
          doc.text(edu.school, leftColX, leftY, { width: leftColWidth });
          leftY = doc.y + 2;

          if (edu.status) {
            doc.fillColor(mediumGray).font("Helvetica-Oblique").fontSize(8);
            doc.text(edu.status, leftColX, leftY, { width: leftColWidth });
            leftY = doc.y + 2;
          }
          leftY += 6;
        }
        leftY += 4;
      }

      if (data.profile.licenseNumber || data.profile.licenseState) {
        drawLeftSectionHeader("License");
        doc.fillColor(textColor).font("Helvetica").fontSize(9);
        if (data.profile.licenseNumber) {
          doc.text(data.profile.licenseNumber, leftColX, leftY, { width: leftColWidth });
          leftY = doc.y + 3;
        }
        if (data.profile.licenseState) {
          doc.fillColor(mediumGray).font("Helvetica").fontSize(8.5);
          doc.text(data.profile.licenseState, leftColX, leftY, { width: leftColWidth });
          leftY = doc.y + 3;
        }
        leftY += 10;
      }

      const contactInfo: string[] = [];
      if (data.profile.email) contactInfo.push(data.profile.email);
      if (data.profile.phone) contactInfo.push(data.profile.phone);

      if (contactInfo.length > 0) {
        drawLeftSectionHeader("Contact");
        doc.fillColor(textColor).font("Helvetica").fontSize(9);
        for (const item of contactInfo) {
          doc.text(item, leftColX, leftY, { width: leftColWidth });
          leftY = doc.y + 4;
        }
        leftY += 10;
      }

      const references = data.profile.references as Array<{ name: string; title: string; organization: string; email?: string; phone?: string }> | null;
      if (references && references.length > 0) {
        const refY = Math.max(currentY, leftY) + 10;
        if (refY < doc.page.height - 120) {
          currentY = refY;
          drawSectionHeader("References", leftColX, pageWidth);

          for (const ref of references) {
            if (currentY > doc.page.height - 60) {
              doc.addPage();
              currentY = 50;
            }

            doc.fillColor(primaryColor).font("Helvetica-Bold").fontSize(9.5);
            doc.text(ref.name, leftColX, currentY, { width: pageWidth / 2 - 10, continued: false });
            currentY = doc.y + 1;

            doc.fillColor(textColor).font("Helvetica").fontSize(9);
            doc.text(`${ref.title}, ${ref.organization}`, leftColX, currentY, { width: pageWidth });
            currentY = doc.y + 1;

            const refContact: string[] = [];
            if (ref.email) refContact.push(ref.email);
            if (ref.phone) refContact.push(ref.phone);
            if (refContact.length > 0) {
              doc.fillColor(mediumGray).font("Helvetica").fontSize(8.5);
              doc.text(refContact.join("  |  "), leftColX, currentY, { width: pageWidth });
              currentY = doc.y + 1;
            }
            currentY += 8;
          }
        } else {
          doc.addPage();
          currentY = 50;
          drawSectionHeader("References", leftColX, pageWidth);

          for (const ref of references) {
            doc.fillColor(primaryColor).font("Helvetica-Bold").fontSize(9.5);
            doc.text(ref.name, leftColX, currentY, { width: pageWidth / 2 - 10 });
            currentY = doc.y + 1;

            doc.fillColor(textColor).font("Helvetica").fontSize(9);
            doc.text(`${ref.title}, ${ref.organization}`, leftColX, currentY, { width: pageWidth });
            currentY = doc.y + 1;

            const refContact: string[] = [];
            if (ref.email) refContact.push(ref.email);
            if (ref.phone) refContact.push(ref.phone);
            if (refContact.length > 0) {
              doc.fillColor(mediumGray).font("Helvetica").fontSize(8.5);
              doc.text(refContact.join("  |  "), leftColX, currentY, { width: pageWidth });
              currentY = doc.y + 1;
            }
            currentY += 8;
          }
        }
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
