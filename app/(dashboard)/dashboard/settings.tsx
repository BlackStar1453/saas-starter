'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { customerPortalAction } from '@/lib/payments/actions';
import { User } from '@/lib/db/schema';
import { Progress } from '@/components/ui/progress';

type ActionState = {
  error?: string;
  success?: string;
};

export function Settings({ user }: { user: User }) {

  const getUserDisplayName = (user: Pick<User, 'id' | 'name' | 'email'>) => {
    return user.name || user.email || 'Unknown User';
  };

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Subscription</h1>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <div className="mb-4 sm:mb-0">
                <p className="font-medium">
                  Current Plan: {user.planName || 'Free'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {user.subscriptionStatus === 'active'
                    ? 'Billed monthly'
                    : user.subscriptionStatus === 'trialing'
                      ? 'Trial period'
                      : 'No active subscription'}
                </p>
              </div>
              <form action={customerPortalAction}>
                <Button type="submit" variant="outline">
                  Manage Subscription
                </Button>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Usage (Last 30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {/* Premium Models 用量 */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium">Premium models</span>
                <span className="text-sm text-muted-foreground">
                  {user.premiumRequestsUsed || 0} / {user.premiumRequestsLimit || 0}
                </span>
              </div>
              <Progress 
                value={((user.premiumRequestsUsed || 0) / (user.premiumRequestsLimit || 50)) * 100} 
                className="h-2 bg-green-100" 
              />
            </div>

            {/* Fast Requests 用量 */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium">gpt-4o-mini</span>
                <span className="text-sm text-muted-foreground">
                  {user.fastRequestsUsed || 0} / {user.fastRequestsLimit || 150}
                </span>
              </div>
              <Progress 
                value={((user.fastRequestsUsed || 0) / (user.fastRequestsLimit || 150)) * 100} 
                className="h-2 bg-green-100" 
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
