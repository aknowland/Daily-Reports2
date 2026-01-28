import { getUncachableStripeClient } from '../server/stripeClient';

async function seedProducts() {
  const stripe = await getUncachableStripeClient();
  console.log('Creating Stripe products and prices...');

  try {
    const existingProducts = await stripe.products.list({ limit: 100 });
    const existingNames = existingProducts.data.map(p => p.name);

    if (!existingNames.includes('Starter Plan')) {
      const starterProduct = await stripe.products.create({
        name: 'Starter Plan',
        description: 'For small teams getting started with digital reporting. Up to 3 inspectors.',
        metadata: {
          type: 'company_starter',
          inspectorLimit: '3',
        },
      });

      const starterPrice = await stripe.prices.create({
        product: starterProduct.id,
        unit_amount: 9900,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { 
          type: 'company_starter',
          lookupKey: 'price_starter_monthly',
        },
        lookup_key: 'price_starter_monthly',
      });
      console.log(`Created Starter Plan product ($99/month) - Price ID: ${starterPrice.id}`);
    } else {
      console.log('Starter Plan product already exists');
    }

    if (!existingNames.includes('Professional Plan')) {
      const professionalProduct = await stripe.products.create({
        name: 'Professional Plan',
        description: 'For growing companies with advanced needs. Up to 10 inspectors.',
        metadata: {
          type: 'company_professional',
          inspectorLimit: '10',
        },
      });

      const professionalPrice = await stripe.prices.create({
        product: professionalProduct.id,
        unit_amount: 29900,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { 
          type: 'company_professional',
          lookupKey: 'price_professional_monthly',
        },
        lookup_key: 'price_professional_monthly',
      });
      console.log(`Created Professional Plan product ($299/month) - Price ID: ${professionalPrice.id}`);
    } else {
      console.log('Professional Plan product already exists');
    }

    if (!existingNames.includes('Enterprise Plan')) {
      const enterpriseProduct = await stripe.products.create({
        name: 'Enterprise Plan',
        description: 'For large organizations with complex requirements. Unlimited inspectors.',
        metadata: {
          type: 'company_enterprise',
          inspectorLimit: 'unlimited',
        },
      });

      const enterprisePrice = await stripe.prices.create({
        product: enterpriseProduct.id,
        unit_amount: 69900,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { 
          type: 'company_enterprise',
          lookupKey: 'price_enterprise_monthly',
        },
        lookup_key: 'price_enterprise_monthly',
      });
      console.log(`Created Enterprise Plan product ($699/month) - Price ID: ${enterprisePrice.id}`);
    } else {
      console.log('Enterprise Plan product already exists');
    }

    console.log('\nAll products created successfully!');
    console.log('\nPricing Summary:');
    console.log('- Starter Plan: $99/month (up to 3 inspectors)');
    console.log('- Professional Plan: $299/month (up to 10 inspectors)');
    console.log('- Enterprise Plan: $699/month (unlimited inspectors)');

    console.log('\nNote: Price lookup keys can be used to reference prices:');
    console.log('- price_starter_monthly');
    console.log('- price_professional_monthly');
    console.log('- price_enterprise_monthly');

  } catch (error) {
    console.error('Error creating products:', error);
    throw error;
  }
}

seedProducts();
