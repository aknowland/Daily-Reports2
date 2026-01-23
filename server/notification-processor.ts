import { storage } from './storage';

// Notification intervals for each date type - single source of truth
export const NOTIFICATION_INTERVALS = {
  start_date: [30, 14, 7] as const,
  substantial_completion: [120, 90, 60, 30, 14, 3] as const,
  final_closeout: [10, 3] as const,
};

// Budget milestone percentages
export const BUDGET_MILESTONES = [50, 75, 90, 100] as const;

// Contract status types
type ContractStatus = "bid_release" | "bid_received" | "under_review" | "awarded" | "not_awarded" | "cancelled" | "in_execution" | "substantial_completion" | "final_closeout";

// Compute contract status based on dates
export const computeContractStatusFromDates = (contract: {
  startDate?: Date | null;
  substantialCompletionDate?: Date | null;
  finalCloseoutDate?: Date | null;
  status?: string;
}): ContractStatus | null => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  if (contract.finalCloseoutDate) {
    const closeout = new Date(contract.finalCloseoutDate);
    closeout.setHours(0, 0, 0, 0);
    if (now >= closeout) return "final_closeout";
  }
  
  if (contract.substantialCompletionDate) {
    const substantial = new Date(contract.substantialCompletionDate);
    substantial.setHours(0, 0, 0, 0);
    if (now >= substantial) return "substantial_completion";
  }
  
  if (contract.startDate) {
    const start = new Date(contract.startDate);
    start.setHours(0, 0, 0, 0);
    if (now >= start) return "in_execution";
  }
  
  return null;
};

export interface ProcessingResults {
  statusUpdates: { contractId: string; contractName: string; oldStatus: string; newStatus: string }[];
  notificationsSent: { contractId: string; contractName: string; dateType: string; daysBefore: number; emails: string[] }[];
  budgetAlerts: { contractId: string; contractName: string; milestone: number; utilization: number; emails: string[] }[];
  projectBudgetAlerts: { projectId: string; projectName: string; milestone: number; utilization: number; emails: string[] }[];
  errors: { contractId: string; error: string }[];
}

interface ProcessNotificationsOptions {
  companyIdFilter?: string | null;
  sendEmails?: boolean;
}

// Main notification processing function
export async function processContractNotifications(
  resendInstance: any,
  options: ProcessNotificationsOptions = {}
): Promise<ProcessingResults> {
  const { companyIdFilter = null, sendEmails = true } = options;
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  const allContracts = await storage.getAllContractsWithUpcomingDates();
  const contractsToProcess = companyIdFilter 
    ? allContracts.filter(c => c.companyId === companyIdFilter)
    : allContracts;
  
  const results: ProcessingResults = {
    statusUpdates: [],
    notificationsSent: [],
    budgetAlerts: [],
    projectBudgetAlerts: [],
    errors: [],
  };
  
  for (const contract of contractsToProcess) {
    try {
      // 1. Check and update contract status based on dates
      const computedStatus = computeContractStatusFromDates(contract);
      if (computedStatus && computedStatus !== contract.status) {
        await storage.updateContract(contract.id, { status: computedStatus });
        results.statusUpdates.push({
          contractId: contract.id,
          contractName: contract.name,
          oldStatus: contract.status,
          newStatus: computedStatus,
        });
      }
      
      // 2. Check for upcoming date notifications
      const dateChecks = [
        { type: 'start_date' as const, date: contract.startDate, label: 'Contract Start Date' },
        { type: 'substantial_completion' as const, date: contract.substantialCompletionDate, label: 'Substantial Completion Date' },
        { type: 'final_closeout' as const, date: contract.finalCloseoutDate, label: 'Final Closeout Date' },
      ];
      
      for (const check of dateChecks) {
        if (!check.date) continue;
        
        const targetDate = new Date(check.date);
        targetDate.setHours(0, 0, 0, 0);
        
        if (targetDate < now) continue;
        
        const daysUntil = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const intervals = NOTIFICATION_INTERVALS[check.type];
        
        for (const daysBefore of intervals) {
          if (daysUntil === daysBefore) {
            const alreadySent = await storage.hasNotificationBeenSent(contract.id, check.type, daysBefore);
            if (alreadySent) continue;
            
            const adminEmails = await storage.getCompanyAdminEmails(contract.companyId);
            if (adminEmails.length === 0) continue;
            
            const company = await storage.getCompany(contract.companyId);
            const formattedDate = targetDate.toLocaleDateString('en-US', { 
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
            });
            
            if (sendEmails && resendInstance) {
              try {
                await resendInstance.emails.send({
                  from: 'Field Daily Reports <noreply@mail.replit.app>',
                  to: adminEmails,
                  subject: `Contract Reminder: ${contract.name} - ${check.label} in ${daysBefore} days`,
                  html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h2 style="color: #1a365d;">Contract Date Reminder</h2>
                      <p>This is a reminder that the following contract date is approaching:</p>
                      <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin: 0 0 10px 0; color: #2d3748;">${contract.name}</h3>
                        <p style="margin: 5px 0;"><strong>Contract #:</strong> ${contract.contractNumber}</p>
                        <p style="margin: 5px 0;"><strong>${check.label}:</strong> ${formattedDate}</p>
                        <p style="margin: 5px 0;"><strong>Days Remaining:</strong> ${daysBefore}</p>
                        ${(contract as any).client?.name ? `<p style="margin: 5px 0;"><strong>Client:</strong> ${(contract as any).client.name}</p>` : ''}
                      </div>
                      <p style="color: #718096; font-size: 14px;">
                        This is an automated reminder from ${company?.name || 'Field Daily Reports'}.
                      </p>
                    </div>
                  `,
                });
              } catch (emailError: any) {
                results.errors.push({
                  contractId: contract.id,
                  error: `Failed to send date reminder email: ${emailError.message}`,
                });
                continue;
              }
            }
            
            await storage.createContractNotification({
              contractId: contract.id,
              companyId: contract.companyId,
              notificationType: check.type,
              daysBefore,
              recipientEmails: adminEmails,
            });
            
            results.notificationsSent.push({
              contractId: contract.id,
              contractName: contract.name,
              dateType: check.type,
              daysBefore,
              emails: adminEmails,
            });
          }
        }
      }
      
      // 3. Check for budget milestone notifications (50%, 75%, 90%, 100%)
      // Calculate budget using contract values (matching original route logic)
      const budgetSummary = await storage.getContractBudgetSummary(contract.id);
      const totalBudget = contract.budgetOverride 
        ? parseFloat(contract.budgetOverride) 
        : parseFloat(contract.currentValue || contract.originalValue || '0');
      
      if (totalBudget > 0) {
        // Include base budget spent + calculated billed amount (for stacking support)
        const baseBudgetSpent = parseFloat(contract.baseBudgetSpent || '0');
        const calculatedSpent = budgetSummary.totalBilled;
        const budgetSpent = baseBudgetSpent + calculatedSpent;
        const budgetProgress = (budgetSpent / totalBudget) * 100;
        
        for (const milestone of BUDGET_MILESTONES) {
          if (budgetProgress >= milestone) {
            // Use dedicated budget notification tracking (matching original route logic)
            const alreadySent = await storage.hasBudgetNotificationBeenSent(contract.id, milestone);
            if (alreadySent) continue;
            
            const adminEmails = await storage.getCompanyAdminEmails(contract.companyId);
            if (adminEmails.length === 0) continue;
            
            const company = await storage.getCompany(contract.companyId);
            
            // Format currency for display
            const formatCurrency = (amount: number) => 
              amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
            
            const milestoneLabel = milestone >= 100 ? 'Budget Exceeded' : `${milestone}% Budget Used`;
            const bgColor = milestone >= 100 ? '#fed7d7' : milestone >= 90 ? '#feebc8' : '#c6f6d5';
            const borderColor = milestone >= 100 ? '#fc8181' : milestone >= 90 ? '#f6ad55' : '#68d391';
            
            if (sendEmails && resendInstance) {
              try {
                await resendInstance.emails.send({
                  from: 'Field Daily Reports <noreply@mail.replit.app>',
                  to: adminEmails,
                  subject: `Budget Alert: ${contract.name} - ${milestoneLabel}`,
                  html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h2 style="color: ${milestone >= 100 ? '#c53030' : milestone >= 90 ? '#c05621' : '#2d3748'};">
                        Budget Milestone Alert
                      </h2>
                      <p>A budget milestone has been reached for the following contract:</p>
                      <div style="background: ${bgColor}; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${borderColor};">
                        <h3 style="margin: 0 0 10px 0; color: #2d3748;">${contract.name}</h3>
                        <p style="margin: 5px 0;"><strong>Contract #:</strong> ${contract.contractNumber}</p>
                        ${(contract as any).client?.name ? `<p style="margin: 5px 0;"><strong>Client:</strong> ${(contract as any).client.name}</p>` : ''}
                        <hr style="border: none; border-top: 1px solid ${borderColor}; margin: 15px 0;">
                        <p style="margin: 5px 0; font-size: 18px;"><strong>Budget Progress:</strong> ${budgetProgress.toFixed(1)}%</p>
                        <p style="margin: 5px 0;"><strong>Total Budget:</strong> ${formatCurrency(totalBudget)}</p>
                        <p style="margin: 5px 0;"><strong>Amount Spent:</strong> ${formatCurrency(budgetSpent)}</p>
                        <p style="margin: 5px 0;"><strong>Remaining:</strong> ${formatCurrency(totalBudget - budgetSpent)}</p>
                      </div>
                      ${milestone >= 100 ? `
                      <p style="color: #c53030; font-weight: bold;">
                        ALERT: This contract has exceeded its budget. Please review and take appropriate action.
                      </p>
                      ` : milestone >= 90 ? `
                      <p style="color: #c05621;">
                        This contract is approaching its budget limit. Please monitor closely.
                      </p>
                      ` : ''}
                      <p style="color: #718096; font-size: 14px;">
                        This is an automated budget alert from ${company?.name || 'Field Daily Reports'}.
                      </p>
                    </div>
                  `,
                });
              } catch (emailError: any) {
                results.errors.push({
                  contractId: contract.id,
                  error: `Failed to send budget alert email: ${emailError.message}`,
                });
                continue;
              }
            }
            
            // Use dedicated budget notification persistence (matching original route logic)
            await storage.createBudgetNotification({
              contractId: contract.id,
              companyId: contract.companyId,
              milestonePercent: milestone,
              currentSpend: budgetSpent.toString(),
              budgetAmount: totalBudget.toString(),
              recipientEmails: adminEmails,
            });
            
            results.budgetAlerts.push({
              contractId: contract.id,
              contractName: contract.name,
              milestone,
              utilization: budgetProgress,
              emails: adminEmails,
            });
          }
        }
      }
    } catch (contractError: any) {
      results.errors.push({
        contractId: contract.id,
        error: contractError.message,
      });
    }
  }
  
  // 4. Check for project-level budget notifications
  const projectsWithBudgets = await storage.getProjectsWithBudgets();
  const projectsToProcess = companyIdFilter
    ? projectsWithBudgets.filter(p => p.companyId === companyIdFilter)
    : projectsWithBudgets;
  
  for (const project of projectsToProcess) {
    try {
      if (!project.companyId) continue;
      
      const projectBudgetAmount = parseFloat((project as any).budgetAmount || '0');
      if (projectBudgetAmount <= 0) continue;
      
      // Calculate project budget: base + calculated from reports
      const projectBaseBudget = parseFloat((project as any).baseBudget || '0');
      
      // Get reports for this project and calculate billed amount
      const projectReports = await storage.getReportsByProject(project.id);
      let calculatedSpent = 0;
      
      // Get contract rates if project has a contract
      let hourlyRate = 75; // Default rate if no contract
      if (project.contractId) {
        const contractOptions = await storage.getContractOptions(project.contractId);
        const firstOption = contractOptions[0];
        const firstInspector = firstOption?.inspectors?.[0];
        if (firstInspector?.rate) {
          hourlyRate = parseFloat(firstInspector.rate);
        }
      }
      
      for (const report of projectReports) {
        const regularHours = parseFloat(report.regularHours || '0');
        const otHours = parseFloat(report.otHours || '0');
        const premiumHours = parseFloat((report as any).premiumHours || '0');
        calculatedSpent += (regularHours + otHours * 1.5 + premiumHours * 2) * hourlyRate;
      }
      
      const projectTotalSpent = projectBaseBudget + calculatedSpent;
      const projectBudgetProgress = (projectTotalSpent / projectBudgetAmount) * 100;
      
      for (const milestone of BUDGET_MILESTONES) {
        if (projectBudgetProgress >= milestone) {
          const alreadySent = await storage.hasProjectBudgetNotificationBeenSent(project.id, milestone);
          if (alreadySent) continue;
          
          const adminEmails = await storage.getCompanyAdminEmails(project.companyId);
          if (adminEmails.length === 0) continue;
          
          const company = await storage.getCompany(project.companyId);
          
          const formatCurrency = (amount: number) => 
            amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
          
          const milestoneLabel = milestone >= 100 ? 'Budget Exceeded' : `${milestone}% Budget Used`;
          const bgColor = milestone >= 100 ? '#fed7d7' : milestone >= 90 ? '#feebc8' : '#c6f6d5';
          const borderColor = milestone >= 100 ? '#fc8181' : milestone >= 90 ? '#f6ad55' : '#68d391';
          
          if (sendEmails && resendInstance) {
            try {
              await resendInstance.emails.send({
                from: 'Field Daily Reports <noreply@mail.replit.app>',
                to: adminEmails,
                subject: `Project Budget Alert: ${project.name} - ${milestoneLabel}`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: ${milestone >= 100 ? '#c53030' : milestone >= 90 ? '#c05621' : '#2d3748'};">
                      Project Budget Milestone Alert
                    </h2>
                    <p>A budget milestone has been reached for the following project:</p>
                    <div style="background: ${bgColor}; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${borderColor};">
                      <h3 style="margin: 0 0 10px 0; color: #2d3748;">${project.name}</h3>
                      <p style="margin: 5px 0;"><strong>Project #:</strong> ${project.projectNumber}</p>
                      <hr style="border: none; border-top: 1px solid ${borderColor}; margin: 15px 0;">
                      <p style="margin: 5px 0; font-size: 18px;"><strong>Budget Progress:</strong> ${projectBudgetProgress.toFixed(1)}%</p>
                      <p style="margin: 5px 0;"><strong>Total Budget:</strong> ${formatCurrency(projectBudgetAmount)}</p>
                      <p style="margin: 5px 0;"><strong>Amount Spent:</strong> ${formatCurrency(projectTotalSpent)}</p>
                      <p style="margin: 5px 0;"><strong>Remaining:</strong> ${formatCurrency(projectBudgetAmount - projectTotalSpent)}</p>
                    </div>
                    ${milestone >= 100 ? `
                    <p style="color: #c53030; font-weight: bold;">
                      ALERT: This project has exceeded its budget. Please review and take appropriate action.
                    </p>
                    ` : milestone >= 90 ? `
                    <p style="color: #c05621;">
                      This project is approaching its budget limit. Please monitor closely.
                    </p>
                    ` : ''}
                    <p style="color: #718096; font-size: 14px;">
                      This is an automated project budget alert from ${company?.name || 'Field Daily Reports'}.
                    </p>
                  </div>
                `,
              });
            } catch (emailError: any) {
              results.errors.push({
                contractId: project.id,
                error: `Failed to send project budget alert email: ${emailError.message}`,
              });
              continue;
            }
          }
          
          await storage.createProjectBudgetNotification({
            projectId: project.id,
            companyId: project.companyId,
            milestonePercent: milestone,
            currentSpend: projectTotalSpent.toString(),
            budgetAmount: projectBudgetAmount.toString(),
            recipientEmails: adminEmails,
          });
          
          results.projectBudgetAlerts.push({
            projectId: project.id,
            projectName: project.name,
            milestone,
            utilization: projectBudgetProgress,
            emails: adminEmails,
          });
        }
      }
    } catch (projectError: any) {
      results.errors.push({
        contractId: project.id,
        error: `Project budget notification error: ${projectError.message}`,
      });
    }
  }
  
  return results;
}
