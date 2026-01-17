import { getUncachableStripeClient } from '../server/stripeClient';

async function seedProducts() {
  const stripe = await getUncachableStripeClient();
  console.log('Creating Stripe products and prices...');

  try {
    const existingProducts = await stripe.products.list({ limit: 100 });
    const existingNames = existingProducts.data.map(p => p.name);

    if (!existingNames.includes('Company Account')) {
      const companyProduct = await stripe.products.create({
        name: 'Company Account',
        description: 'Full company access with team management, branding, and unlimited features',
        metadata: {
          type: 'company',
        },
      });

      await stripe.prices.create({
        product: companyProduct.id,
        unit_amount: 49900,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { type: 'company' },
      });
      console.log('Created Company Account product ($499/month)');
    } else {
      console.log('Company Account product already exists');
    }

    if (!existingNames.includes('Company User')) {
      const userProduct = await stripe.products.create({
        name: 'Company User',
        description: 'Full access for team members within a company',
        metadata: {
          type: 'company_user',
        },
      });

      await stripe.prices.create({
        product: userProduct.id,
        unit_amount: 7900,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { type: 'company_user' },
      });
      console.log('Created Company User product ($79/month)');
    } else {
      console.log('Company User product already exists');
    }

    if (!existingNames.includes('Independent Pro')) {
      const independentProduct = await stripe.products.create({
        name: 'Independent Pro',
        description: 'Unlimited reports for independent inspectors',
        metadata: {
          type: 'independent_pro',
        },
      });

      await stripe.prices.create({
        product: independentProduct.id,
        unit_amount: 4900,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { type: 'independent_pro' },
      });
      console.log('Created Independent Pro product ($49/month)');
    } else {
      console.log('Independent Pro product already exists');
    }

    console.log('\nAll products created successfully!');
    console.log('\nPricing Summary:');
    console.log('- Company Account: $499/month');
    console.log('- Company User: $79/month');
    console.log('- Independent Pro: $49/month');
    console.log('- Independent Free: 5 reports/month (no charge)');

  } catch (error) {
    console.error('Error creating products:', error);
    throw error;
  }
}

seedProducts();
