import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { setSession } from '@/lib/auth/session';
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/payments/stripe';
import Stripe from 'stripe';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.redirect(new URL('/pricing', request.url));
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'subscription', 'line_items.data.price.product'],
    });



    const customerId = typeof session.customer === 'string' 
  ? session.customer 
  : session.customer?.id;

if (!customerId) {
  throw new Error('No customer ID found in Stripe session.');
}
    const userId = session.client_reference_id;
    
    if (!userId) {
      throw new Error("No user ID found in session's client_reference_id.");
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, Number(userId)))
      .limit(1);

    if (user.length === 0) {
      throw new Error('User not found in database.');
    }

    let updateData: any = {
      stripeCustomerId: customerId,
      updatedAt: new Date(),
    };

    if (session.mode === 'subscription') {
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;

      if (!subscriptionId) {
        throw new Error('No subscription found for this session.');
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price.product'],
      });

      const plan = subscription.items.data[0]?.price;

      if (!plan) {
        throw new Error('No plan found for this subscription.');
      }

      const productId = (plan.product as Stripe.Product).id;

      if (!productId) {
        throw new Error('No product ID found for this subscription.');
      }

      updateData = {
        ...updateData,
        stripeSubscriptionId: subscriptionId,
        stripeProductId: productId,
        planName: (plan.product as Stripe.Product).name,
        subscriptionStatus: subscription.status,
      };
    } else if (session.mode === 'payment') {
      const lineItem = session.line_items?.data[0];
      if (!lineItem) {
        throw new Error('No line items found in session.');
      }

      const product = lineItem.price?.product as Stripe.Product;
      if (!product) {
        throw new Error('No product found in line item.');
      }

      updateData = {
        ...updateData,
        stripeProductId: product.id,
        planName: product.name,
        subscriptionStatus: 'lifetime',
      };
    }

    await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, user[0].id));

    await setSession(user[0]);
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error) {
    console.error('Error handling successful checkout:', error);
    return NextResponse.redirect(new URL('/error', request.url));
  }
}
