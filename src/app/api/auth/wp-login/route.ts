import { NextResponse } from "next/server";
import { WP_LOGIN_URL } from "@/lib/config";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    const wpBaseUrl = WP_LOGIN_URL.replace(/\/wp-login\.php.*$/, "");
    const apiUrl = `${wpBaseUrl}/wp-login.php?action=headless_auth`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("[WP Headless Auth Error] Invalid JSON response from WP:", text.substring(0, 200));
      return NextResponse.json(
        { success: false, error: "Ошибка связи с сервером авторизации (WordPress вернул не JSON)" },
        { status: 502 }
      );
    }

    if (!response.ok || !data.success) {
      return NextResponse.json(
        { success: false, error: data.message || "Неверный email или пароль" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      token: data.token,
    });
  } catch (error) {
    console.error("[WP Headless Auth Error]", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
