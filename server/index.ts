import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient';
import { WebhookHandlers } from './webhookHandlers';
import { initDatabaseSequences } from './storage';

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('DATABASE_URL not set, skipping Stripe initialization');
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    try {
      await runMigrations({ databaseUrl });
      console.log('Stripe schema ready');
    } catch (migrationError: any) {
      // If migration fails but stripe tables exist, continue anyway
      if (migrationError.message?.includes('already exists') || 
          migrationError.cause?.includes('already exists')) {
        console.log('Stripe schema already exists, continuing...');
      } else {
        console.error('Stripe migration error (non-fatal):', migrationError.message);
        console.log('Continuing without full Stripe schema...');
      }
    }

    try {
      const stripeSync = await getStripeSync();

      console.log('Setting up managed webhook...');
      const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      const { webhook } = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      console.log(`Webhook configured: ${webhook.url}`);

      console.log('Syncing Stripe data...');
      stripeSync.syncBackfill()
        .then(() => console.log('Stripe data synced'))
        .catch((err: any) => console.error('Error syncing Stripe data:', err));
    } catch (webhookError: any) {
      // Handle missing stripe.accounts table gracefully
      if (webhookError.message?.includes('stripe.accounts') || 
          webhookError.message?.includes('relation') && webhookError.message?.includes('does not exist')) {
        console.log('Stripe tables not fully initialized. Stripe sync features disabled.');
        console.log('Stripe checkout and billing portal will still work.');
      } else {
        console.error('Webhook setup error (non-fatal):', webhookError.message);
        console.log('Stripe checkout and billing portal will still work.');
      }
    }
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

// Initialize Stripe asynchronously (wrapped for CommonJS compatibility)
(async () => {
  await initStripe();
})();

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error('Stripe webhook: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Initialize database sequences for report numbering
    await initDatabaseSequences();
    
    await registerRoutes(httpServer, app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || "5000", 10);
    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
        reusePort: true,
      },
      () => {
        log(`serving on port ${port}`);
        
        // Start daily notification scheduler
        startNotificationScheduler();
      },
    );
  } catch (error) {
    console.error("Fatal error during server startup:", error);
    process.exit(1);
  }
})();

// Daily notification scheduler for contract date reminders and budget milestones
function startNotificationScheduler() {
  const SCHEDULER_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
  const INITIAL_DELAY_MS = 60 * 1000; // 1 minute after startup
  
  async function runNotificationCheck() {
    try {
      log("Running scheduled notification check...", "scheduler");
      
      if (!process.env.RESEND_API_KEY) {
        log("RESEND_API_KEY not configured, skipping notifications", "scheduler");
        return;
      }
      
      // Import required modules
      const { Resend } = await import('resend');
      const { processContractNotifications } = await import('./notification-processor');
      
      const resend = new Resend(process.env.RESEND_API_KEY);
      
      // Use shared notification processing function (same as API route)
      const results = await processContractNotifications(resend, {
        companyIdFilter: null, // Process all companies
        sendEmails: true,
      });
      
      log(`Notification check complete: ${results.statusUpdates.length} status updates, ${results.notificationsSent.length + results.budgetAlerts.length} emails sent, ${results.errors.length} errors`, "scheduler");
    } catch (error: any) {
      log(`Notification scheduler error: ${error.message}`, "scheduler");
    }
  }
  
  // Schedule first run after initial delay, then repeat daily
  setTimeout(() => {
    runNotificationCheck();
    setInterval(runNotificationCheck, SCHEDULER_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
  
  log("Notification scheduler started (runs daily)", "scheduler");
}
