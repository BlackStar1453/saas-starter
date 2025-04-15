import Stripe from 'stripe';
import { redirect } from 'next/navigation';
import { User } from '@/lib/db/schema';
import {
  getUser,
  getUserByEmail,
  updateUser,
  updateUserSubscription
} from '@/lib/db/queries';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil'
});

export async function createCheckoutSession({
  user,
  priceId
}: {
  user: User | null;
  priceId: string;
}) {
  const currentUser = user || await getUser();

  if (!currentUser) {
    redirect(`/sign-up?redirect=checkout&priceId=${priceId}`);
  }

  // 获取价格信息以确定支付模式
  const price = await stripe.prices.retrieve(priceId);
  const product = await stripe.products.retrieve(price.product as string);

  const isOneTime = product.name === 'Lifetime';
  

  
  const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    mode: isOneTime ? 'payment' : 'subscription',
    success_url: `${process.env.BASE_URL}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/pricing`,
    customer: currentUser.stripeCustomerId || undefined,
    client_reference_id: currentUser.id.toString(),
    allow_promotion_codes: true,
  });


  redirect(session.url!);
}

export async function createCustomerPortalSession(user: User) {
  if (!user.stripeCustomerId || !user.stripeProductId) {
    redirect('/pricing');
  }

  let configuration: Stripe.BillingPortal.Configuration;
  const configurations = await stripe.billingPortal.configurations.list();

  if (configurations.data.length > 0) {
    configuration = configurations.data[0];
  } else {
    const product = await stripe.products.retrieve(user.stripeProductId);
    if (!product.active) {
      throw new Error("User's product is not active in Stripe");
    }

    const prices = await stripe.prices.list({
      product: product.id,
      active: true
    });
    if (prices.data.length === 0) {
      throw new Error("No active prices found for the user's product");
    }

    configuration = await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: 'Manage your subscription'
      },
      features: {
        subscription_update: {
          enabled: true,
          default_allowed_updates: ['price', 'quantity', 'promotion_code'],
          proration_behavior: 'create_prorations',
          products: [
            {
              product: product.id,
              prices: prices.data.map((price) => price.id)
            }
          ]
        },
        subscription_cancel: {
          enabled: true,
          mode: 'at_period_end',
          cancellation_reason: {
            enabled: true,
            options: [
              'too_expensive',
              'missing_features',
              'switched_service',
              'unused',
              'other'
            ]
          }
        }
      }
    });
  }

  return stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${process.env.BASE_URL}/dashboard`,
    configuration: configuration.id
  });
}

export async function handleSubscriptionChange(
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;
  const status = subscription.status;

  // 获取客户信息以找到用户邮箱
  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
  
  if (!customer || !customer.email) {
    console.error('Customer not found or missing email:', customerId);
    return;
  }
  
  // 通过邮箱查找用户
  const user = await getUserByEmail(customer.email);

  if (!user) {
    console.error('User not found for Stripe customer email:', customer.email);
    return;
  }

  if (status === 'active') {
    const plan = subscription.items.data[0]?.plan;
    
    // 首先更新用户订阅信息（计划和状态）
    await updateUser(user.id, {
      stripeSubscriptionId: subscriptionId,
      stripeProductId: plan?.product as string,
      planName: (await stripe.products.retrieve(plan?.product as string)).name,
      subscriptionStatus: status,
    });
    
  } else if (status === 'canceled' || status === 'unpaid') {
    await updateUser(user.id, {
      stripeSubscriptionId: null,
      stripeProductId: null,
      planName: null,
      subscriptionStatus: status
    });
  }
}

export async function handleOneTimePayment(
  session: Stripe.Checkout.Session
) {
  const customerId = session.customer as string;
  
  // 获取客户信息以找到用户邮箱
  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
  
  if (!customer || !customer.email) {
    console.error('Customer not found or missing email:', customerId);
    return;
  }
  
  // 通过邮箱查找用户
  const user = await getUserByEmail(customer.email);

  if (!user) {
    console.error('User not found for Stripe customer email:', customer.email);
    return;
  }

  // 获取产品信息
  const lineItem = (await stripe.checkout.sessions.listLineItems(session.id)).data[0];
  const price = await stripe.prices.retrieve(lineItem.price?.id as string);
  const product = await stripe.products.retrieve(price.product as string);

  // 更新用户状态
  await updateUser(user.id, {
    stripeProductId: product.id,
    planName: product.name,
    subscriptionStatus: 'lifetime'
  });
}

export async function getStripePrices() {
  const prices = await stripe.prices.list({
    expand: ['data.product'],
    active: true
  });

  return prices.data.map((price) => ({
    id: price.id,
    productId:
      typeof price.product === 'string' ? price.product : price.product.id,
    unitAmount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring?.interval,
    trialPeriodDays: price.recurring?.trial_period_days,
    type: price.type
  }));
}

export async function getStripeProducts() {
  const products = await stripe.products.list({
    active: true,
    expand: ['data.default_price']
  });

  return products.data.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    defaultPriceId:
      typeof product.default_price === 'string'
        ? product.default_price
        : product.default_price?.id
  }));
}
