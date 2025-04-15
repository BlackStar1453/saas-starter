import { checkoutAction } from '@/lib/payments/actions';
import { Check } from 'lucide-react';
import { getStripePrices, getStripeProducts } from '@/lib/payments/stripe';
import { SubmitButton } from './submit-button';
import { getUser } from '@/lib/db/queries';

// Prices are fresh for one hour max
export const revalidate = 3600;

export default async function PricingPage() {
  const [prices, products, currentUser] = await Promise.all([
    getStripePrices(),
    getStripeProducts(),
    getUser(),
  ]);

  const premiumPlan = products.find((product) => product.name === 'Premium');
  const plusPlan = products.find((product) => product.name === 'Plus');
  const lifeTimePlan = products.find((product) => product.name === 'Lifetime');

  const premiumPrice = prices.find((price) => price.productId === premiumPlan?.id);
  const plusPrice = prices.find((price) => price.productId === plusPlan?.id);
  const lifeTimePrice = prices.find((price) => price.productId === lifeTimePlan?.id);

  // 确定当前用户方案
  const userPlanName = currentUser?.planName;
  const isLifetimeUser = userPlanName === 'Lifetime' || currentUser?.subscriptionStatus === 'lifetime';
  const isPremiumUser = userPlanName === 'Premium' && currentUser?.subscriptionStatus === 'active';
  const isFreeUser = !userPlanName || !currentUser?.subscriptionStatus;

  return (
    <main className="max-w-7xl mx-auto px-6 sm:px-9 lg:px-12 py-18">
      <div className="grid md:grid-cols-3 gap-12 max-w-xl mx-auto">
      <PricingCard
          name={'Free'}
          price={0}
          interval={'month'}
          features={[
            '100 Basic Models Queries for free',
            'No Premium Models',
          ]}
          isCurrentPlan={isFreeUser}
        />
        <PricingCard
          name={'Premium'}
          price={premiumPrice?.unitAmount || 800}
          interval={premiumPrice?.interval || 'month'}
          features={[
            '100 Premium Models Queries',
            '1000 Basic Models Queries',
          ]}
          priceId={premiumPrice?.id}
          isCurrentPlan={isPremiumUser}
        />
        <PricingCard
          name={'One-Time'}
          price={lifeTimePrice?.unitAmount || 2900}
          interval={'lifetime'}
          features={[
            'No Limit on Models Queries',
            'Use Your Own API Key',
          ]}
          priceId={lifeTimePrice?.id}
          isCurrentPlan={isLifetimeUser}
        />
      </div>
    </main>
  );
}

function PricingCard({
  name,
  price,
  interval,
  features,
  priceId,
  isCurrentPlan = false,
}: {
  name: string;
  price: number;
  interval: string;
  features: string[];
  priceId?: string;
  isCurrentPlan?: boolean;
}) {
  return (
    <div className="pt-6">
      <h2 className="text-2xl font-medium text-gray-900 mb-2">{name}</h2>
      <p className="text-4xl font-medium text-gray-900 mb-6">
        ${price / 100}{' '}
        <span className="text-xl font-normal text-gray-600">
          / {interval}
        </span>
      </p>
      <ul className="space-y-4 mb-8">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start">
            <Check className="h-5 w-5 text-orange-500 mr-2 mt-0.5 flex-shrink-0" />
            <span className="text-gray-700">{feature}</span>
          </li>
        ))}
      </ul>
      {isCurrentPlan ? (
        <div className="inline-flex items-center justify-center rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 w-full">
          当前方案
        </div>
      ) : (
        <form action={checkoutAction}>
          <input type="hidden" name="priceId" value={priceId} />
          <SubmitButton />
        </form>
      )}
    </div>
  );
}
