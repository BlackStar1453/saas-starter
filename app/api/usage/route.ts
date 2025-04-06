import { NextRequest, NextResponse } from "next/server";
import { 
  getUser, 
  incrementPremiumRequests, 
  incrementFastRequests, 
  isPremiumRequestsQuotaExceeded,
  isFastRequestsQuotaExceeded
} from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { type } = await request.json();
    
    if (type === "premium") {
      // 检查是否超出配额
      const isExceeded = await isPremiumRequestsQuotaExceeded(user.id);
      if (isExceeded) {
        return NextResponse.json(
          { error: "Premium requests quota exceeded" },
          { status: 403 }
        );
      }
      
      await incrementPremiumRequests(user.id);
      return NextResponse.json({ 
        success: true,
        usedCount: (user.premiumRequestsUsed || 0) + 1,
        limit: user.premiumRequestsLimit || 50
      });
    } 
    else if (type === "fast") {
      // 检查是否超出配额
      const isExceeded = await isFastRequestsQuotaExceeded(user.id);
      if (isExceeded) {
        return NextResponse.json(
          { error: "Fast requests quota exceeded" },
          { status: 403 }
        );
      }
      
      await incrementFastRequests(user.id);
      return NextResponse.json({ 
        success: true,
        usedCount: (user.fastRequestsUsed || 0) + 1,
        limit: user.fastRequestsLimit || 150
      });
    }
    else {
      return NextResponse.json(
        { error: "Invalid request type" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error updating usage:", error);
    return NextResponse.json(
      { error: "Failed to update usage" },
      { status: 500 }
    );
  }
}

// 获取当前用量
export async function GET() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      premium: {
        used: user.premiumRequestsUsed || 0,
        limit: user.premiumRequestsLimit || 50
      },
      fast: {
        used: user.fastRequestsUsed || 0,
        limit: user.fastRequestsLimit || 150
      }
    });
  } catch (error) {
    console.error("Error fetching usage:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage" },
      { status: 500 }
    );
  }
} 