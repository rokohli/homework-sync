import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma as db } from "@/lib/prisma";


export async function GET(
  request: Request,
  { params }: { params: { platform: string } }
) {
  const { platform } = await params;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    // Redirect to OAuth provider
    if (platform === "google_classroom") {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google_classroom`;
      const scope = "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly";
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline`;
      return NextResponse.redirect(authUrl);
    }
  }

  // Exchange code for token
  try {
    let tokenData;
    if (platform === "google_classroom") {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google_classroom`,
          code,
        }),
      });
      tokenData = await tokenRes.json();
    }

    // Store token securely in database
    const c = (await cookies()).get("uid");
    const userId = c?.value;
    
    if (userId && tokenData.access_token) {
      await db.userToken.upsert({
        where: { 
          userId_platform: { 
            userId, 
            platform 
          } 
        },
        update: { 
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: tokenData.expires_in 
            ? new Date(Date.now() + tokenData.expires_in * 1000)
            : null
        },
        create: { 
          userId, 
          platform,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: tokenData.expires_in 
            ? new Date(Date.now() + tokenData.expires_in * 1000)
            : null
        },
      });
    }

    // Redirect back to app
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}?sync=success`);
  } catch (error) {
    console.error("OAuth error:", error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}?sync=error`);
  }
}