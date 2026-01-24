import { db } from "./db";
import { 
  clients, 
  purchaseOrders, 
  contracts, 
  contractOptions, 
  contractOptionInspectors,
  projects, 
  proposals, 
  proposalOptions, 
  proposalOptionInspectors,
  dailyReports,
  teamInspectors,
  iorAgreements
} from "@shared/schema";
import { nanoid } from "nanoid";
import { eq, inArray } from "drizzle-orm";

const contractStatuses: ("bid_release" | "bid_received" | "under_review" | "awarded" | "not_awarded" | "cancelled" | "in_execution" | "substantial_completion" | "final_closeout")[] = [
  "bid_release", "bid_received", "under_review", "awarded", "in_execution", "in_execution", "substantial_completion", "final_closeout", "cancelled"
];
const budgetTrackingModes: ("daily_reports" | "scheduled" | "hybrid")[] = ["daily_reports", "scheduled", "hybrid"];
const proposalStatuses: ("draft" | "sent" | "accepted" | "declined" | "expired")[] = ["draft", "sent", "accepted", "declined", "expired"];
const poStatuses: ("active" | "closed" | "cancelled")[] = ["active", "active", "active", "closed", "cancelled"];

const projectTypes = [
  "Elementary School Modernization",
  "High School New Construction", 
  "Community College Building A",
  "University Library Renovation",
  "Hospital Wing Addition",
  "Medical Office Building",
  "Retail Center Development",
  "Office Tower Construction",
  "Residential Complex Phase 1",
  "Industrial Warehouse",
  "Fire Station Retrofit",
  "Police Headquarters",
  "City Hall Renovation",
  "Park Recreation Center",
  "Water Treatment Facility",
  "Transit Station Upgrade",
  "Airport Terminal Expansion",
  "Sports Arena Construction",
  "Convention Center Phase 2",
  "Mixed-Use Development",
  "Senior Living Facility",
  "Charter School Campus",
  "Middle School Gymnasium",
  "District Office Building",
  "Parking Structure",
  "Bridge Seismic Retrofit",
  "Highway Interchange",
  "Storm Drain Improvement",
  "Utility Infrastructure",
  "Solar Farm Installation"
];

const clientNames = [
  "Los Angeles Unified School District",
  "Long Beach Unified School District",
  "Orange County Department of Education",
  "San Diego Community College District",
  "UC Regents",
  "CSU Chancellor's Office",
  "Kaiser Permanente",
  "Dignity Health",
  "Westfield Corporation",
  "CBRE Development",
  "City of Los Angeles",
  "County of Orange",
  "State of California DGS",
  "Metropolitan Water District",
  "LA Metro",
  "Port of Long Beach"
];

const inspectorTitles = [
  "DSA Class 1 Inspector",
  "DSA Class 2 Inspector", 
  "Special Inspector - Concrete",
  "Special Inspector - Steel",
  "Project Inspector",
  "Senior Inspector",
  "Lead Inspector",
  "Field Inspector",
  "Quality Assurance Inspector"
];

const inspectorNames = [
  "Michael Johnson",
  "Sarah Williams",
  "David Brown",
  "Jennifer Davis",
  "Robert Martinez",
  "Emily Wilson",
  "Christopher Taylor",
  "Amanda Anderson",
  "James Thompson",
  "Michelle Garcia",
  "Daniel Hernandez",
  "Lisa Rodriguez",
  "Matthew Moore",
  "Jessica White",
  "Andrew Jackson"
];

const contractors = [
  "ABC Electric Co",
  "Pacific Plumbing & Mechanical",
  "Steel Structures Inc",
  "Concrete Masters LLC",
  "HVAC Solutions Corp",
  "Foundation Specialists",
  "Roofing Pros Inc",
  "Fire Protection Systems",
  "Elevator Installation Co",
  "Landscape Design Group"
];

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export async function seedDemoData(companyId: string, createdById: string) {
  console.log("Starting demo data seed for company:", companyId);
  
  const createdData = {
    clients: [] as string[],
    purchaseOrders: [] as string[],
    contracts: [] as string[],
    projects: [] as string[],
    proposals: [] as string[],
    teamInspectors: [] as string[],
    dailyReports: [] as string[],
    iorAgreements: [] as string[]
  };

  try {
    // Clean up existing demo data for this company before seeding new data
    console.log("Cleaning up existing demo data...");
    
    // Get existing contracts and projects to clean up related records
    const existingContracts = await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.companyId, companyId));
    const existingProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.companyId, companyId));
    const existingProposals = await db.select({ id: proposals.id }).from(proposals).where(eq(proposals.companyId, companyId));
    
    const contractIds = existingContracts.map(c => c.id);
    const projectIds = existingProjects.map(p => p.id);
    const proposalIds = existingProposals.map(p => p.id);
    
    // Delete in order of dependencies (children first)
    if (projectIds.length > 0) {
      await db.delete(dailyReports).where(inArray(dailyReports.projectId, projectIds));
    }
    
    if (contractIds.length > 0) {
      // Get contract options to delete their inspectors
      const existingOptions = await db.select({ id: contractOptions.id }).from(contractOptions).where(inArray(contractOptions.contractId, contractIds));
      const optionIds = existingOptions.map(o => o.id);
      if (optionIds.length > 0) {
        await db.delete(contractOptionInspectors).where(inArray(contractOptionInspectors.optionId, optionIds));
        await db.delete(contractOptions).where(inArray(contractOptions.id, optionIds));
      }
    }
    
    if (proposalIds.length > 0) {
      // Get proposal options to delete their inspectors
      const existingPropOptions = await db.select({ id: proposalOptions.id }).from(proposalOptions).where(inArray(proposalOptions.proposalId, proposalIds));
      const propOptionIds = existingPropOptions.map(o => o.id);
      if (propOptionIds.length > 0) {
        await db.delete(proposalOptionInspectors).where(inArray(proposalOptionInspectors.optionId, propOptionIds));
        await db.delete(proposalOptions).where(inArray(proposalOptions.id, propOptionIds));
      }
      await db.delete(proposals).where(eq(proposals.companyId, companyId));
    }
    
    // Delete projects, contracts, POs, clients, team inspectors, IORs
    await db.delete(projects).where(eq(projects.companyId, companyId));
    await db.delete(contracts).where(eq(contracts.companyId, companyId));
    await db.delete(purchaseOrders).where(eq(purchaseOrders.companyId, companyId));
    await db.delete(iorAgreements).where(eq(iorAgreements.companyId, companyId));
    await db.delete(teamInspectors).where(eq(teamInspectors.companyId, companyId));
    await db.delete(clients).where(eq(clients.companyId, companyId));
    
    console.log("Cleanup complete. Creating new demo data...");
    
    console.log("Creating clients...");
    for (let i = 0; i < 10; i++) {
      const clientName = clientNames[i % clientNames.length];
      const [client] = await db.insert(clients).values({
        companyId,
        name: clientName,
        contactName: `${randomElement(["John", "Mary", "Bob", "Sue"])} ${randomElement(["Smith", "Jones", "Davis", "Wilson"])}`,
        email: `contact@${clientName.toLowerCase().replace(/\s+/g, '').substring(0, 15)}.org`,
        phone: `(${randomInt(310, 949)}) ${randomInt(100, 999)}-${randomInt(1000, 9999)}`,
        address: `${randomInt(100, 9999)} ${randomElement(["Main", "Oak", "First", "Park", "Center"])} ${randomElement(["St", "Ave", "Blvd", "Dr"])}, ${randomElement(["Los Angeles", "Long Beach", "Irvine", "San Diego"])}, CA ${randomInt(90001, 92899)}`
      }).returning();
      createdData.clients.push(client.id);
    }
    console.log(`Created ${createdData.clients.length} clients`);

    console.log("Creating team inspectors...");
    for (let i = 0; i < 10; i++) {
      const firstName = inspectorNames[i].split(" ")[0];
      const lastName = inspectorNames[i].split(" ")[1];
      const [inspector] = await db.insert(teamInspectors).values({
        companyId,
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@inspection.com`,
        phone: `(${randomInt(310, 949)}) ${randomInt(100, 999)}-${randomInt(1000, 9999)}`,
        title: randomElement(inspectorTitles),
        licenseNumber: `IC-${randomInt(10000, 99999)}`,
        licenseState: "CA",
        certifications: [
          randomElement(["ICC Reinforced Concrete", "ICC Structural Steel", "ICC Masonry", "AWS CWI"]),
          randomElement(["ICC Spray-Applied Fireproofing", "NICET Level II", "ACI Field Testing"])
        ],
        notes: `Experienced inspector with ${randomInt(5, 20)} years in the field.`
      }).returning();
      createdData.teamInspectors.push(inspector.id);
    }
    console.log(`Created ${createdData.teamInspectors.length} team inspectors`);

    console.log("Creating purchase orders...");
    for (let i = 0; i < 15; i++) {
      const totalAmount = randomInt(50000, 500000);
      const usedAmount = Math.floor(totalAmount * Math.random() * 0.8);
      const [po] = await db.insert(purchaseOrders).values({
        companyId,
        clientId: randomElement(createdData.clients),
        poNumber: `PO-${2025 + Math.floor(i / 5)}-${String(i + 1).padStart(4, "0")}`,
        description: `Purchase Order for ${randomElement(projectTypes)}`,
        totalAmount: totalAmount.toString(),
        remainingAmount: (totalAmount - usedAmount).toString(),
        issueDate: randomDate(new Date("2025-01-01"), new Date("2026-01-15")),
        expirationDate: randomDate(new Date("2026-06-01"), new Date("2027-12-31")),
        status: randomElement(poStatuses),
        notes: `Authorized by ${randomElement(["John Smith", "Mary Johnson", "Bob Williams"])}`
      }).returning();
      createdData.purchaseOrders.push(po.id);
    }
    console.log(`Created ${createdData.purchaseOrders.length} purchase orders`);

    console.log("Creating contracts and projects...");
    for (let i = 0; i < 30; i++) {
      const projectName = projectTypes[i % projectTypes.length];
      const status = contractStatuses[i % contractStatuses.length];
      const clientId = randomElement(createdData.clients);
      const budgetMode = randomElement(budgetTrackingModes);
      
      const startDate = randomDate(new Date("2025-06-01"), new Date("2026-03-01"));
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + randomInt(6, 24));
      
      const contractValue = randomInt(100000, 2000000);
      const regularRate = randomInt(95, 150);
      const otRate = Math.round(regularRate * 1.5);
      
      const [contract] = await db.insert(contracts).values({
        companyId,
        clientId,
        purchaseOrderId: i < 15 ? createdData.purchaseOrders[i] : null,
        contractNumber: `C-${2025 + Math.floor(i / 10)}-${String(i + 1).padStart(4, "0")}`,
        name: projectName,
        description: `Construction inspection services for ${projectName}. Includes all phases from foundation to final closeout.`,
        contractType: randomElement(["lump_sum", "time_and_materials", "unit_price"]),
        status,
        originalValue: contractValue.toString(),
        currentValue: (contractValue + randomInt(0, 50000)).toString(),
        bidReleaseDate: new Date(startDate.getTime() - 90 * 24 * 60 * 60 * 1000),
        bidDueDate: new Date(startDate.getTime() - 60 * 24 * 60 * 60 * 1000),
        awardDate: status !== "bid_release" && status !== "cancelled" ? new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000) : null,
        startDate,
        substantialCompletionDate: endDate,
        finalCloseoutDate: new Date(endDate.getTime() + 60 * 24 * 60 * 60 * 1000),
        regularRate: regularRate.toString(),
        overtimeRate: otRate.toString(),
        premiumRate: (regularRate * 2).toString(),
        budgetTrackingMode: budgetMode,
        baseBudgetSpent: budgetMode === "hybrid" ? randomInt(10000, 50000).toString() : null,
        notes: `Project manager: ${randomElement(["Tom Anderson", "Lisa Chen", "Mike Rodriguez"])}\nContact: ${randomElement(["Direct", "Via PM", "Email only"])}`,
        createdById
      }).returning();
      createdData.contracts.push(contract.id);

      const numOptions = randomInt(1, 3);
      const optionIds: string[] = [];
      
      for (let opt = 0; opt < numOptions; opt++) {
        const [option] = await db.insert(contractOptions).values({
          contractId: contract.id,
          optionNumber: opt + 1,
          name: opt === 0 ? "Base Scope" : `Option ${opt}: Additional Services`,
          awardStatus: status === "awarded" || status === "in_execution" || status === "substantial_completion" || status === "final_closeout" 
            ? (opt === 0 ? "awarded" : randomElement(["awarded", "pending", "not_awarded"]))
            : "pending"
        }).returning();
        optionIds.push(option.id);

        const numInspectors = randomInt(1, 3);
        for (let ins = 0; ins < numInspectors; ins++) {
          await db.insert(contractOptionInspectors).values({
            optionId: option.id,
            title: inspectorTitles[ins % inspectorTitles.length],
            inspectorName: inspectorNames[(i + ins) % inspectorNames.length],
            rate: (regularRate + randomInt(-10, 20)).toString(),
            hours: (randomInt(200, 1500)).toString(),
            scheduleType: randomElement(["fullTime", "fullTime", "partTime"])
          });
        }
      }

      const numProjects = randomInt(1, 3);
      for (let p = 0; p < numProjects; p++) {
        const projectBudget = Math.floor(contractValue / numProjects);
        const [project] = await db.insert(projects).values({
          companyId,
          contractId: contract.id,
          contractOptionId: optionIds[0],
          clientId,
          name: numProjects === 1 ? projectName : `${projectName} - Phase ${p + 1}`,
          projectNumber: `PRJ-${2025 + Math.floor(i / 10)}-${String(i * 3 + p + 1).padStart(4, "0")}`,
          client: clientNames[i % clientNames.length],
          address: `${randomInt(100, 9999)} ${randomElement(["Construction", "Building", "Project", "Development"])} Way, ${randomElement(["Los Angeles", "Long Beach", "Irvine", "San Diego", "Anaheim"])}, CA ${randomInt(90001, 92899)}`,
          distributionEmails: [
            `pm@project${i}.com`,
            `inspector@project${i}.com`
          ],
          startDate,
          substantialCompletionDate: endDate,
          budgetAmount: projectBudget.toString(),
          baseBudget: budgetMode === "hybrid" ? (randomInt(5000, 20000)).toString() : null,
          budgetTrackingMode: budgetMode
        }).returning();
        createdData.projects.push(project.id);

        if (status === "in_execution" || status === "substantial_completion" || status === "final_closeout") {
          const numReports = (status === "substantial_completion" || status === "final_closeout") ? randomInt(20, 50) : randomInt(5, 20);
          let reportDate = new Date(startDate);
          
          for (let r = 0; r < numReports && reportDate < new Date(); r++) {
            if (reportDate.getDay() === 0) reportDate.setDate(reportDate.getDate() + 1);
            if (reportDate.getDay() === 6) reportDate.setDate(reportDate.getDate() + 2);
            
            const regularHours = randomElement(["8.00", "8.00", "8.00", "6.00", "4.00"]);
            const otHours = Math.random() > 0.7 ? randomElement(["2.00", "4.00", "1.00"]) : "";
            
            const [report] = await db.insert(dailyReports).values({
              projectId: project.id,
              inspectorId: createdById,
              date: new Date(reportDate),
              weatherType: randomElement(["clear", "clear", "clear", "cloudy", "rain", "heat"]),
              weatherNotes: `${randomInt(55, 95)}°F, ${randomElement(["Light breeze", "Calm", "Windy", "Humid"])}`,
              typeOfWork: [randomElement(["reinf_concrete", "structural_steel", "masonry", "fireproofing", "welding"])],
              workPerformed: `Site inspection and documentation. ${randomElement(["Foundation work", "Steel erection", "Concrete pour", "MEP rough-in", "Finish work"])} observed.`,
              workActivities: [
                {
                  contractor: randomElement(contractors),
                  headcount: randomInt(3, 12),
                  workDescription: randomElement([
                    "Layout and preparation work",
                    "Material delivery and staging",
                    "Installation and testing",
                    "Quality control and documentation",
                    "Coordination with other trades"
                  ])
                },
                {
                  contractor: randomElement(contractors),
                  headcount: randomInt(2, 8),
                  workDescription: randomElement([
                    "Continuing rough-in work",
                    "Finishing previous day's work",
                    "Inspections and corrections",
                    "Safety walkthrough",
                    "Equipment calibration"
                  ])
                }
              ],
              visitors: Math.random() > 0.6 ? [{
                name: randomElement(["Owner Rep", "Architect", "Engineer", "City Inspector"]),
                company: randomElement(["Design Associates", "City Building Dept", "Owner's Office"]),
                notes: "Site visit and walkthrough"
              }] : [],
              equipment: `${randomInt(1, 3)} Excavators, ${randomInt(1, 2)} Cranes, ${randomInt(2, 5)} Forklifts`,
              inspections: Math.random() > 0.5 ? `Inspection #${randomInt(100, 999)} - ${randomElement(["Pass", "Pass", "Conditional", "Reinspection needed"])}` : "",
              materialsDelivered: Math.random() > 0.6 ? `${randomElement(["Rebar", "Concrete", "Steel beams", "Electrical conduit", "HVAC equipment"])} delivered` : "",
              issuesFlag: Math.random() > 0.85,
              issuesDetails: Math.random() > 0.85 ? "Minor coordination issue resolved on site" : "",
              safetyFlag: Math.random() > 0.95,
              safetyDetails: Math.random() > 0.95 ? "Safety briefing conducted" : "",
              timeIn: "07:00",
              timeOut: regularHours === "8.00" ? "16:00" : (regularHours === "6.00" ? "14:00" : "12:00"),
              regularHours,
              otHours,
              status: "submitted"
            }).returning();
            createdData.dailyReports.push(report.id);
            
            reportDate.setDate(reportDate.getDate() + randomInt(1, 3));
          }
        }
      }
    }
    console.log(`Created ${createdData.contracts.length} contracts`);
    console.log(`Created ${createdData.projects.length} projects`);
    console.log(`Created ${createdData.dailyReports.length} daily reports`);

    console.log("Creating proposals...");
    for (let i = 0; i < 12; i++) {
      const proposalStatus = proposalStatuses[i % proposalStatuses.length];
      const startDate = randomDate(new Date("2026-02-01"), new Date("2026-08-01"));
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + randomInt(6, 18));
      
      const [proposal] = await db.insert(proposals).values({
        companyId,
        clientId: randomElement(createdData.clients),
        proposalNumber: `PROP-${2026}-${String(i + 1).padStart(4, "0")}`,
        clientName: randomElement(clientNames),
        projectName: `${randomElement(projectTypes)} - Proposed`,
        projectManager: randomElement(["Tom Anderson", "Lisa Chen", "Mike Rodriguez", "Sarah Johnson"]),
        startDate,
        endDate,
        totalHours: randomInt(500, 3000).toString(),
        scheduleType: randomElement(["fullTime", "partTime"]),
        rateEscalationNote: "Rates subject to 3% annual escalation",
        terms: "Standard terms and conditions apply. Payment net 30.",
        status: proposalStatus,
        sentDate: proposalStatus !== "draft" ? randomDate(new Date("2026-01-01"), new Date()) : null,
        acceptedDate: proposalStatus === "accepted" ? randomDate(new Date("2026-01-15"), new Date()) : null,
        createdById
      }).returning();
      createdData.proposals.push(proposal.id);

      const numOptions = randomInt(1, 2);
      for (let opt = 0; opt < numOptions; opt++) {
        const [option] = await db.insert(proposalOptions).values({
          proposalId: proposal.id,
          optionNumber: opt + 1,
          name: opt === 0 ? "Base Scope" : "Option: Extended Services"
        }).returning();

        const numInspectors = randomInt(1, 3);
        for (let ins = 0; ins < numInspectors; ins++) {
          await db.insert(proposalOptionInspectors).values({
            optionId: option.id,
            title: inspectorTitles[ins % inspectorTitles.length],
            inspectorName: inspectorNames[(i + ins) % inspectorNames.length],
            rate: randomInt(95, 150).toString(),
            hours: randomInt(200, 1000).toString(),
            scheduleType: randomElement(["fullTime", "fullTime", "partTime"])
          });
        }
      }
    }
    console.log(`Created ${createdData.proposals.length} proposals`);

    console.log("Creating IOR agreements...");
    const projectsForIor = createdData.projects.slice(0, 8);
    for (let i = 0; i < projectsForIor.length; i++) {
      const [ior] = await db.insert(iorAgreements).values({
        companyId,
        projectId: projectsForIor[i],
        inspectorId: createdById,
        agreementNumber: `IOR-${2026}-${String(i + 1).padStart(3, "0")}`,
        agreementDate: formatDate(randomDate(new Date("2025-06-01"), new Date("2026-01-15"))),
        clientName: randomElement(clientNames),
        consultantName: `${randomElement(["Smith", "Johnson", "Williams"])} Engineering`,
        agentName: `${randomElement(["Pacific", "Western", "Coastal"])} Inspection Services`,
        projectLocation: `${randomInt(100, 9999)} Project Drive, ${randomElement(["Los Angeles", "Long Beach", "Irvine"])}, CA`,
        dsaAppNumber: `${randomInt(100000, 999999)}-${randomInt(10, 99)}-${randomInt(1, 9)}`,
        rate: randomInt(95, 140).toString(),
        terms: "Standard IOR agreement terms apply."
      }).returning();
      createdData.iorAgreements.push(ior.id);
    }
    console.log(`Created ${createdData.iorAgreements.length} IOR agreements`);

    console.log("Demo data seeding complete!");
    return {
      success: true,
      message: "Demo data created successfully",
      summary: {
        clients: createdData.clients.length,
        teamInspectors: createdData.teamInspectors.length,
        purchaseOrders: createdData.purchaseOrders.length,
        contracts: createdData.contracts.length,
        projects: createdData.projects.length,
        proposals: createdData.proposals.length,
        dailyReports: createdData.dailyReports.length,
        iorAgreements: createdData.iorAgreements.length
      }
    };
  } catch (error) {
    console.error("Error seeding demo data:", error);
    throw error;
  }
}
